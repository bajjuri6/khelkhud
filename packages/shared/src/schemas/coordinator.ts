import { z } from "zod";

/**
 * Coordinator schemas.
 *
 * A coordinator is a village-level validator — a PET teacher, a sarpanch, someone with
 * public visibility locally. Their appointment is a delegation of trust, so who appointed
 * them and which villages they cover are both required, never inferred.
 */

export const coordinatorAppointSchema = z.object({
  /** Existing account, or one created on appointment if the email is new. */
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  name: z.string().trim().min(2, "Name is required").max(80),
  /**
   * Shown to sponsors so they can judge the vouching. "PET teacher, ZPHS Ammapur" tells a
   * donor in Dallas why this person's word means something; "Coordinator" tells them
   * nothing.
   */
  designation: z.string().trim().min(3, "Say who they are in the village").max(120),
  phone: z.string().trim().max(20).optional(),
  /** At least one village — an unscoped coordinator has no authority to exercise. */
  villageIds: z.array(z.string().min(1)).min(1, "Assign at least one village"),
});

export const coordinatorUpdateSchema = z.object({
  designation: z.string().trim().min(3).max(120).optional(),
  phone: z.string().trim().max(20).optional(),
  villageIds: z.array(z.string().min(1)).min(1).optional(),
  isActive: z.boolean().optional(),
});

export const requestValidationSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  /** Required on reject: "no" without a reason is not actionable for the athlete. */
  note: z.string().trim().max(500).optional(),
}).refine((v) => v.decision !== "REJECT" || (v.note && v.note.length > 0), {
  message: "Give a reason when rejecting, so the athlete knows what to fix",
  path: ["note"],
});

export type CoordinatorAppointInput = z.infer<typeof coordinatorAppointSchema>;
export type CoordinatorUpdateInput = z.infer<typeof coordinatorUpdateSchema>;
export type RequestValidationInput = z.infer<typeof requestValidationSchema>;
