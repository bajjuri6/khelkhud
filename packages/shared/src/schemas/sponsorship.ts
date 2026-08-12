import { z } from "zod";

export const sponsorshipCreateSchema = z.object({
  playerId: z.string().min(1),
  requirementId: z.string().nullish(),
  amountPaise: z
    .number()
    .int()
    .min(10000, "Minimum sponsorship is ₹100")
    .max(10000000000, "Amount too large"),
  purpose: z.string().min(1).max(300),
  isAnonymous: z.boolean().default(false),
});

export const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export type SponsorshipCreateInput = z.infer<typeof sponsorshipCreateSchema>;
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
