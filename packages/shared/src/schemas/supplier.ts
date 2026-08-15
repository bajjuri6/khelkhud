import { z } from "zod";

/**
 * A supplier registering themselves. Note what is absent: `canPublish`, `approvedById`,
 * `approvedAt`. Those are the admin's grant and can never arrive in a request body — see
 * docs/architecture/v2-village-model.md §9.4.
 */
export const supplierRegisterSchema = z.object({
  name: z.string().trim().min(2).max(160),
  website: z.string().url().max(500).nullish(),
  // Format-checked, not verified against the GST registry. Claiming otherwise in the UI
  // would be a lie a donor might rely on.
  gstin: z
    .string()
    .trim()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/, "That is not a valid GSTIN")
    .nullish(),
  contactPhone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number")
    .nullish(),
});

export const supplierUpdateSchema = supplierRegisterSchema.partial();

/** The admin grant. Separate from the profile so the audit trail is unambiguous. */
export const supplierApprovalSchema = z.object({
  canPublish: z.boolean(),
  /** Why, for the record. Required when revoking — a supplier deserves a reason. */
  note: z.string().trim().max(500).optional(),
});

export type SupplierRegisterInput = z.infer<typeof supplierRegisterSchema>;
export type SupplierUpdateInput = z.infer<typeof supplierUpdateSchema>;
export type SupplierApprovalInput = z.infer<typeof supplierApprovalSchema>;
