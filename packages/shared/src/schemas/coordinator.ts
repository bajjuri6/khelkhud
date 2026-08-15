import { z } from "zod";
import { REQUEST_KINDS, requestItemSchema } from "./athlete.js";

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

/**
 * A coordinator raising a request themselves.
 *
 * Not the same input as an athlete's. An athlete's own request needs no beneficiary field —
 * it is them, and no village field — it is theirs. A coordinator is asking on someone
 * else's behalf, so both have to be said out loud, and both are what the server checks
 * their authority against.
 *
 * Deliberately absent, as on the athlete schema: any total, and any status. The total is
 * derived from the items server-side, and the status of a coordinator's request is not the
 * client's to assert even though the answer is always OPEN.
 */
export const coordinatorRequestCreateSchema = z
  .object({
    kind: z.enum(REQUEST_KINDS),
    title: z.string().trim().min(1, "Give the request a title").max(200),
    description: z.string().trim().max(2000).nullish(),
    /**
     * Which village this is being raised in. Required rather than inferred: a coordinator
     * often covers several, and guessing the first one would silently file a request under
     * the wrong village — where the wrong diaspora is watching.
     */
    villageId: z.string().min(1, "Pick the village this request is for"),
    athleteId: z.string().min(1).nullish(),
    institutionId: z.string().min(1).nullish(),
    items: z.array(requestItemSchema).min(1, "Add at least one item").max(20),
    deadline: z.string().datetime().nullish(),
  })
  .refine((v) => Boolean(v.athleteId) !== Boolean(v.institutionId), {
    // Exactly one beneficiary, because the whole delivery model rests on knowing who
    // receives: equipment ships to a person or a place, and a request that names both or
    // neither cannot be delivered, confirmed, or shown honestly to a donor.
    message: "Choose exactly one beneficiary — either an athlete or a place, not both",
    path: ["athleteId"],
  });

export type CoordinatorRequestCreateInput = z.infer<typeof coordinatorRequestCreateSchema>;
export type CoordinatorAppointInput = z.infer<typeof coordinatorAppointSchema>;
export type CoordinatorUpdateInput = z.infer<typeof coordinatorUpdateSchema>;
export type RequestValidationInput = z.infer<typeof requestValidationSchema>;
