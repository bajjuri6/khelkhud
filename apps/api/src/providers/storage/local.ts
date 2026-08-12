import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SignJWT, jwtVerify } from "jose";
import { config } from "../../config.js";
import type { PresignedUpload, StorageDriver } from "./types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_ROOT = path.resolve(here, "../../../uploads");

const secret = new TextEncoder().encode(config.SESSION_SECRET);

export type LocalUploadToken = { key: string; mimeType: string; sizeBytes: number };

export async function signUploadToken(claims: LocalUploadToken): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);
}

export async function verifyUploadToken(token: string): Promise<LocalUploadToken | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.key !== "string" || typeof payload.mimeType !== "string") return null;
    return {
      key: payload.key,
      mimeType: payload.mimeType,
      sizeBytes: Number(payload.sizeBytes ?? 0),
    };
  } catch {
    return null;
  }
}

/** Resolve a storage key inside the uploads root, refusing path traversal. */
export function safeLocalPath(key: string): string {
  const resolved = path.resolve(UPLOADS_ROOT, key);
  if (!resolved.startsWith(UPLOADS_ROOT + path.sep)) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
  return resolved;
}

export function writeLocalFile(key: string, data: Buffer): void {
  const filePath = safeLocalPath(key);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, data);
}

export const localDriver: StorageDriver = {
  name: "local",
  async presignPut(key, mimeType, sizeBytes): Promise<PresignedUpload> {
    const token = await signUploadToken({ key, mimeType, sizeBytes });
    return {
      uploadUrl: `${config.API_URL}/api/uploads/local/${token}`,
      method: "PUT",
      headers: { "Content-Type": mimeType },
    };
  },
  async exists(key) {
    try {
      return fs.existsSync(safeLocalPath(key));
    } catch {
      return false;
    }
  },
  async getRedirectUrl() {
    return null;
  },
  getLocalPath(key) {
    return safeLocalPath(key);
  },
};
