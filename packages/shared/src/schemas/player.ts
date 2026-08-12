import { z } from "zod";

export const PLAYER_CATEGORIES = ["UNDER_12", "UNDER_15", "UNDER_19", "SENIOR", "PARA"] as const;
export const EXPERIENCE_LEVELS = [
  "BEGINNER",
  "DISTRICT",
  "STATE",
  "NATIONAL",
  "INTERNATIONAL",
] as const;

export const playerProfileUpdateSchema = z.object({
  sportId: z.string().nullish(),
  locationId: z.string().nullish(),
  dateOfBirth: z.string().datetime().nullish(),
  category: z.enum(PLAYER_CATEGORIES).nullish(),
  experienceLevel: z.enum(EXPERIENCE_LEVELS).nullish(),
  bio: z.string().max(2000).nullish(),
  photoKey: z.string().nullish(),
  coachName: z.string().max(120).nullish(),
  coachContact: z.string().max(120).nullish(),
  academyName: z.string().max(160).nullish(),
});

export const achievementSchema = z.object({
  title: z.string().min(1).max(200),
  level: z.enum(EXPERIENCE_LEVELS).nullish(),
  year: z.number().int().min(1980).max(2100).nullish(),
  description: z.string().max(1000).nullish(),
  proofDocumentId: z.string().nullish(),
});

export const eventSchema = z.object({
  name: z.string().min(1).max(200),
  date: z.string().datetime().nullish(),
  venue: z.string().max(200).nullish(),
  result: z.string().max(300).nullish(),
  estimatedExpensePaise: z.number().int().nonnegative().nullish(),
  isUpcoming: z.boolean().default(true),
});

export const requirementBreakdownItemSchema = z.object({
  label: z.string().min(1).max(120),
  amountPaise: z.number().int().positive(),
});

export const requirementCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  totalAmountPaise: z.number().int().positive(),
  breakdown: z.array(requirementBreakdownItemSchema).max(20).nullish(),
  deadline: z.string().datetime().nullish(),
});

export const requirementUpdateSchema = requirementCreateSchema.partial().extend({
  status: z.enum(["OPEN", "CLOSED"]).optional(),
});

export type PlayerProfileUpdateInput = z.infer<typeof playerProfileUpdateSchema>;
export type AchievementInput = z.infer<typeof achievementSchema>;
export type EventInput = z.infer<typeof eventSchema>;
export type RequirementCreateInput = z.infer<typeof requirementCreateSchema>;
export type RequirementUpdateInput = z.infer<typeof requirementUpdateSchema>;
