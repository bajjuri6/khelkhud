import crypto from "node:crypto";
import fs from "node:fs";
import { Router, raw, type Request, type Response, type NextFunction } from "express";
import {
  allowedMimeTypes,
  maxBytesForKind,
  uploadConfirmSchema,
  uploadPresignSchema,
} from "@khelkhud/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { validate } from "../middleware/validate.js";
import { storage } from "../providers/storage/index.js";
import { verifyUploadToken, writeLocalFile } from "../providers/storage/local.js";

export const uploadsRouter: Router = Router();

function sanitizeFileName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.length > 80 ? base.slice(-80) : base;
}

uploadsRouter.post("/presign", requireAuth, validate(uploadPresignSchema), async (req, res, next) => {
  try {
    const { kind, fileName, mimeType, sizeBytes } = req.body;
    const storageKey = `${kind.toLowerCase().replace(/_/g, "-")}/${req.user!.uid}/${crypto.randomUUID()}-${sanitizeFileName(fileName)}`;
    const presigned = await storage.presignPut(storageKey, mimeType, sizeBytes);
    res.json({ data: { ...presigned, storageKey } });
  } catch (err) {
    next(err);
  }
});

/**
 * Local-driver upload target. Mounted with a raw body parser in index.ts,
 * BEFORE express.json(). The token (signed at presign time) authorizes exactly
 * one key/type/size combination.
 */
export async function localUploadHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const claims = await verifyUploadToken(String(req.params.token ?? ""));
    if (!claims) throw new ApiError(403, "UPLOAD_TOKEN", "Invalid or expired upload token");
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new ApiError(400, "UPLOAD_EMPTY", "Empty upload body");
    }
    if (body.length > claims.sizeBytes + 1024) {
      throw new ApiError(413, "UPLOAD_TOO_LARGE", "Upload exceeds declared size");
    }
    writeLocalFile(claims.key, body);
    res.json({ data: { ok: true } });
  } catch (err) {
    next(err);
  }
}

uploadsRouter.post("/confirm", requireAuth, validate(uploadConfirmSchema), async (req, res, next) => {
  try {
    const { storageKey, kind, fileName, mimeType, sizeBytes, attach } = req.body;
    if (!allowedMimeTypes(kind).includes(mimeType) || sizeBytes > maxBytesForKind(kind)) {
      throw new ApiError(400, "VALIDATION", "File type or size not allowed");
    }
    // The key embeds the uploader id — reject confirms for other users' keys.
    const [, owner] = storageKey.split("/");
    if (owner !== req.user!.uid) {
      throw new ApiError(403, "FORBIDDEN", "Not your upload");
    }
    if (!(await storage.exists(storageKey))) {
      throw new ApiError(400, "UPLOAD_MISSING", "File was not uploaded");
    }

    const uid = req.user!.uid;
    const attachData: Record<string, string> = {};
    if (attach?.playerProfileId) {
      const profile = await prisma.playerProfile.findUnique({ where: { id: attach.playerProfileId } });
      if (!profile || profile.userId !== uid) throw new ApiError(403, "FORBIDDEN", "Not your profile");
      attachData.playerProfileId = profile.id;
    }
    if (attach?.sponsorProfileId) {
      const profile = await prisma.sponsorProfile.findUnique({ where: { id: attach.sponsorProfileId } });
      if (!profile || profile.userId !== uid) throw new ApiError(403, "FORBIDDEN", "Not your profile");
      attachData.sponsorProfileId = profile.id;
    }
    if (attach?.sponsorshipId) {
      const s = await prisma.sponsorship.findUnique({
        where: { id: attach.sponsorshipId },
        include: { player: true, sponsor: true },
      });
      if (!s || (s.player.userId !== uid && s.sponsor.userId !== uid)) {
        throw new ApiError(403, "FORBIDDEN", "Not your sponsorship");
      }
      attachData.sponsorshipId = s.id;
    }
    if (attach?.updateId) {
      const u = await prisma.sponsorshipUpdate.findUnique({
        where: { id: attach.updateId },
        include: { player: true },
      });
      if (!u || u.player.userId !== uid) throw new ApiError(403, "FORBIDDEN", "Not your update");
      attachData.updateId = u.id;
    }

    const document = await prisma.document.create({
      data: {
        kind,
        storageKey,
        fileName,
        mimeType,
        sizeBytes,
        uploaderUserId: uid,
        ...attachData,
      },
    });
    res.json({ data: document });
  } catch (err) {
    next(err);
  }
});

export const filesRouter: Router = Router();

/** Public profile photos, served by storage key (only the profile-photo prefix). */
filesRouter.get("/photo", async (req, res, next) => {
  try {
    const key = typeof req.query.key === "string" ? req.query.key : "";
    if (!key.startsWith("profile-photo/")) {
      throw new ApiError(404, "NOT_FOUND", "Photo not found");
    }
    await serveByKey(key, res);
  } catch (err) {
    next(err);
  }
});

/** Authorized document access. Visibility broadens per kind in later phases. */
filesRouter.get("/:documentId", requireAuth, async (req, res, next) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: String(req.params.documentId) },
      include: { sponsorship: { include: { player: true, sponsor: true } } },
    });
    if (!doc) throw new ApiError(404, "NOT_FOUND", "Document not found");

    const uid = req.user!.uid;
    const isUploader = doc.uploaderUserId === uid;
    const isAdmin = req.user!.role === "ADMIN";
    const isSponsorshipParty =
      doc.sponsorship != null &&
      (doc.sponsorship.player.userId === uid || doc.sponsorship.sponsor.userId === uid);
    const isPublicKind = doc.kind === "PROFILE_PHOTO" || doc.kind === "UPDATE_MEDIA";

    if (!isUploader && !isAdmin && !isSponsorshipParty && !isPublicKind) {
      throw new ApiError(403, "FORBIDDEN", "You cannot access this document");
    }
    await serveByKey(doc.storageKey, res, doc.mimeType, doc.fileName);
  } catch (err) {
    next(err);
  }
});

async function serveByKey(
  key: string,
  res: Response,
  mimeType?: string,
  fileName?: string,
): Promise<void> {
  const redirectUrl = await storage.getRedirectUrl(key);
  if (redirectUrl) {
    res.redirect(302, redirectUrl);
    return;
  }
  const localPath = storage.getLocalPath(key);
  if (!localPath || !fs.existsSync(localPath)) {
    throw new ApiError(404, "NOT_FOUND", "File not found");
  }
  if (mimeType) res.type(mimeType);
  if (fileName) res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
  res.sendFile(localPath);
}

export const rawUploadBodyParser = raw({ type: () => true, limit: "12mb" });
