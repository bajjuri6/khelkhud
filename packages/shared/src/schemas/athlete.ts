import { z } from "zod";

export const ATHLETE_CATEGORIES = ["UNDER_12", "UNDER_15", "UNDER_19", "SENIOR", "PARA"] as const;
export const EXPERIENCE_LEVELS = [
  "BEGINNER",
  "DISTRICT",
  "STATE",
  "NATIONAL",
  "INTERNATIONAL",
] as const;

export const athleteProfileUpdateSchema = z.object({
  sportId: z.string().nullish(),
  locationId: z.string().nullish(),
  dateOfBirth: z.string().datetime().nullish(),
  category: z.enum(ATHLETE_CATEGORIES).nullish(),
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

export const requestBreakdownItemSchema = z.object({
  label: z.string().min(1).max(120),
  amountPaise: z.number().int().positive(),
});

export const requestCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  totalEstimatedPaise: z.number().int().positive(),
  breakdown: z.array(requestBreakdownItemSchema).max(20).nullish(),
  deadline: z.string().datetime().nullish(),
});

export const requestUpdateSchema = requestCreateSchema.partial().extend({
  status: z.enum(["OPEN", "CLOSED"]).optional(),
});

export type AthleteProfileUpdateInput = z.infer<typeof athleteProfileUpdateSchema>;
export type AchievementInput = z.infer<typeof achievementSchema>;
export type EventInput = z.infer<typeof eventSchema>;
export type RequestCreateInput = z.infer<typeof requestCreateSchema>;
export type RequestUpdateInput = z.infer<typeof requestUpdateSchema>;
