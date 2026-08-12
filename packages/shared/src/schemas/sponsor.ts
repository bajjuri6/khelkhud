import { z } from "zod";

export const SPONSOR_TYPES = ["INDIVIDUAL", "COMPANY", "ORGANIZATION"] as const;

export const sponsorProfileUpdateSchema = z.object({
  sponsorType: z.enum(SPONSOR_TYPES).optional(),
  displayName: z.string().min(1).max(120).nullish(),
  orgName: z.string().max(160).nullish(),
  locationId: z.string().nullish(),
  bio: z.string().max(2000).nullish(),
  isAnonymousByDefault: z.boolean().optional(),
  preferredSportIds: z.array(z.string()).max(20).optional(),
});

export type SponsorProfileUpdateInput = z.infer<typeof sponsorProfileUpdateSchema>;
