import { z } from "zod";

/**
 * Institutions — the beneficiary v1 could not express.
 *
 * Most village needs are not one athlete's: a school has one worn mat for 340 students, a
 * community ground has no posts. The beneficiary is the place, and whoever plays there.
 */

export const institutionKinds = [
  "SCHOOL",
  "PLAYGROUND",
  "CLUB",
  "ANGANWADI",
  "OTHER",
] as const;

export const institutionCreateSchema = z.object({
  villageId: z.string().min(1, "Pick the village this belongs to"),
  kind: z.enum(institutionKinds),
  name: z.string().trim().min(3, "Give its name").max(120),
  description: z.string().trim().max(500).optional(),
});

export const institutionUpdateSchema = z.object({
  kind: z.enum(institutionKinds).optional(),
  name: z.string().trim().min(3).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  // The village is deliberately NOT updatable. An institution that moved village is a
  // different institution, and silently rewriting it would relocate every request already
  // raised against it — including ones sponsors are watching.
});

export type InstitutionCreateInput = z.infer<typeof institutionCreateSchema>;
export type InstitutionUpdateInput = z.infer<typeof institutionUpdateSchema>;
