import { z } from "zod";

export const verificationDecisionSchema = z.object({
  decision: z.enum(["VERIFIED", "REJECTED", "INFO_REQUESTED"]),
  note: z.string().max(1000).nullish(),
});

export const sportCreateSchema = z.object({
  name: z.string().min(1).max(80),
});

export const sportUpdateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  isActive: z.boolean().optional(),
});

export const locationCreateSchema = z.object({
  name: z.string().min(1).max(120),
  level: z.enum(["STATE", "DISTRICT", "CITY"]),
  parentId: z.string().nullish(),
});

export const locationUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
});

export type VerificationDecisionInput = z.infer<typeof verificationDecisionSchema>;
