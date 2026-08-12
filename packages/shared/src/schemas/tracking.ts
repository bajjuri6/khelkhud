import { z } from "zod";

export const ALLOCATION_STATUSES = ["PLANNED", "PURCHASED", "COMPLETED"] as const;

export const allocationCreateSchema = z.object({
  label: z.string().min(1).max(160),
  amountPaise: z.number().int().positive(),
  note: z.string().max(500).nullish(),
});

export const allocationUpdateSchema = z.object({
  label: z.string().min(1).max(160).optional(),
  amountPaise: z.number().int().positive().optional(),
  status: z.enum(ALLOCATION_STATUSES).optional(),
  receiptDocumentId: z.string().nullish(),
  note: z.string().max(500).nullish(),
});

export const updateCreateSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
  sponsorshipId: z.string().nullish(),
  documentIds: z.array(z.string()).max(10).default([]),
});

export type AllocationCreateInput = z.infer<typeof allocationCreateSchema>;
export type AllocationUpdateInput = z.infer<typeof allocationUpdateSchema>;
export type UpdateCreateInput = z.infer<typeof updateCreateSchema>;
