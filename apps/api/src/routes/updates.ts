import { Router } from "express";
import { updateCreateSchema } from "@khelkhud/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { validate } from "../middleware/validate.js";
import { notify } from "../services/notify.js";

export const updatesRouter: Router = Router();

updatesRouter.post(
  "/",
  requireAuth,
  requireRole("PLAYER"),
  validate(updateCreateSchema),
  async (req, res, next) => {
    try {
      const profile = await prisma.playerProfile.findUnique({
        where: { userId: req.user!.uid },
        include: { user: { select: { name: true } } },
      });
      if (!profile) throw new ApiError(404, "NO_PROFILE", "Player profile not found");

      const { title, body, sponsorshipId, documentIds } = req.body as {
        title: string;
        body: string;
        sponsorshipId?: string | null;
        documentIds: string[];
      };

      if (sponsorshipId) {
        const sponsorship = await prisma.sponsorship.findUnique({
          where: { id: sponsorshipId },
        });
        if (!sponsorship || sponsorship.playerId !== profile.id) {
          throw new ApiError(404, "NOT_FOUND", "Sponsorship not found");
        }
      }
      if (documentIds.length > 0) {
        const owned = await prisma.document.count({
          where: { id: { in: documentIds }, uploaderUserId: req.user!.uid },
        });
        if (owned !== documentIds.length) {
          throw new ApiError(403, "FORBIDDEN", "You can only attach your own uploads");
        }
      }

      const update = await prisma.sponsorshipUpdate.create({
        data: {
          playerId: profile.id,
          sponsorshipId: sponsorshipId ?? null,
          title,
          body,
          attachments: { connect: documentIds.map((id) => ({ id })) },
        },
        include: {
          attachments: { select: { id: true, fileName: true, mimeType: true, kind: true } },
        },
      });

      // Fan out to the linked sponsor, or to every sponsor with a paid
      // sponsorship on this player for general updates (deduped).
      const sponsorships = await prisma.sponsorship.findMany({
        where: sponsorshipId
          ? { id: sponsorshipId }
          : { playerId: profile.id, paymentStatus: "PAID" },
        include: { sponsor: { select: { userId: true } } },
      });
      const notified = new Set<string>();
      for (const s of sponsorships) {
        if (notified.has(s.sponsor.userId)) continue;
        notified.add(s.sponsor.userId);
        await notify(s.sponsor.userId, "PLAYER_UPDATE", {
          title: `${profile.user.name} posted an update`,
          body: title,
          linkUrl: `/dashboard/sponsor/sponsorships/${s.id}`,
        });
      }

      res.status(201).json({ data: update });
    } catch (err) {
      next(err);
    }
  },
);
