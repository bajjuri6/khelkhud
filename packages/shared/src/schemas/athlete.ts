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

export const REQUEST_KINDS = ["EQUIPMENT", "CASH"] as const;

/**
 * One line of a request. Equipment lines are things ("Volleyball net, size 9.5m"), cash
 * lines are costs ("Bus to Ranchi"), and both need a quantity: a request for six mats is
 * partly fulfillable, a request for "mats, ₹18,000" is not.
 */
export const requestItemSchema = z.object({
  label: z.string().trim().min(1, "Say what the item is").max(160),
  quantity: z.number().int().positive().max(999).default(1),
  /** Per unit, not per line. The server multiplies. */
  estimatedPaise: z.number().int().positive("Give an estimated price"),
  note: z.string().trim().max(300).nullish(),
});

/**
 * Note the absence of a total: it is derived from the items on the server. A
 * client-supplied total is a number nobody has checked against the things being asked for.
 */
export const requestCreateSchema = z.object({
  kind: z.enum(REQUEST_KINDS),
  title: z.string().trim().min(1, "Give the request a title").max(200),
  description: z.string().max(2000).nullish(),
  items: z.array(requestItemSchema).min(1, "Add at least one item").max(20),
  deadline: z.string().datetime().nullish(),
});

export const requestUpdateSchema = requestCreateSchema.partial().extend({
  /**
   * Closing is the only status an athlete may set. OPEN is the coordinator's word, not the
   * asker's — see docs/architecture/v2-village-model.md section 2.
   */
  status: z.literal("CLOSED").optional(),
});

export type AthleteProfileUpdateInput = z.infer<typeof athleteProfileUpdateSchema>;
export type AchievementInput = z.infer<typeof achievementSchema>;
export type EventInput = z.infer<typeof eventSchema>;
export type RequestKind = (typeof REQUEST_KINDS)[number];
export type RequestItemInput = z.infer<typeof requestItemSchema>;
export type RequestCreateInput = z.infer<typeof requestCreateSchema>;
export type RequestUpdateInput = z.infer<typeof requestUpdateSchema>;
