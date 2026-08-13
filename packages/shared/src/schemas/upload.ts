import { z } from "zod";

export const DOCUMENT_KINDS = [
  "ID_PROOF",
  "ACHIEVEMENT_PROOF",
  "RECEIPT",
  "UPDATE_MEDIA",
  "PROFILE_PHOTO",
  "OTHER",
] as const;

export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const DOC_MIME_TYPES = [...IMAGE_MIME_TYPES, "application/pdf"] as const;

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_DOC_BYTES = 10 * 1024 * 1024;

const imageOnlyKinds = new Set(["PROFILE_PHOTO", "UPDATE_MEDIA"]);

export function allowedMimeTypes(kind: string): readonly string[] {
  return imageOnlyKinds.has(kind) ? IMAGE_MIME_TYPES : DOC_MIME_TYPES;
}

export function maxBytesForKind(kind: string): number {
  return imageOnlyKinds.has(kind) ? MAX_IMAGE_BYTES : MAX_DOC_BYTES;
}

export const uploadPresignSchema = z
  .object({
    kind: z.enum(DOCUMENT_KINDS),
    fileName: z.string().min(1).max(200),
    mimeType: z.string().min(1),
    sizeBytes: z.number().int().positive(),
  })
  .superRefine((val, ctx) => {
    if (!allowedMimeTypes(val.kind).includes(val.mimeType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mimeType"],
        message: `File type not allowed for ${val.kind}`,
      });
    }
    if (val.sizeBytes > maxBytesForKind(val.kind)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sizeBytes"],
        message: `File too large (max ${Math.round(maxBytesForKind(val.kind) / 1024 / 1024)}MB)`,
      });
    }
  });

export const uploadConfirmSchema = z.object({
  storageKey: z.string().min(1),
  kind: z.enum(DOCUMENT_KINDS),
  fileName: z.string().min(1).max(200),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  attach: z
    .object({
      athleteProfileId: z.string().optional(),
      sponsorProfileId: z.string().optional(),
      sponsorshipId: z.string().optional(),
      updateId: z.string().optional(),
    })
    .optional(),
});

export type UploadPresignInput = z.infer<typeof uploadPresignSchema>;
export type UploadConfirmInput = z.infer<typeof uploadConfirmSchema>;
