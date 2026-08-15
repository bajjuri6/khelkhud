import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../middleware/errors.js";

/**
 * Supplier authority.
 *
 * The rule this file enforces: **a supplier may only touch their own offers, and only
 * appears in front of donors once an admin has said so.** Registering and being trusted
 * are deliberately separate states — a supplier builds their catalogue while an admin
 * decides. See docs/architecture/v2-village-model.md §9.4.
 *
 * Same shape as coordinator.service.ts, for the same reason: one chokepoint, so nobody
 * queries SupplierOffer from a route and acts on it.
 */

/** The supplier profile for a user. Throws if they are not one. */
export async function requireSupplier(userId: string) {
  const profile = await prisma.supplierProfile.findUnique({
    where: { userId },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!profile || !profile.isActive) {
    throw new ApiError(403, "NOT_A_SUPPLIER", "This account is not an active supplier");
  }
  return profile;
}

/**
 * A supplier who may publish. Used for anything that becomes visible to donors.
 *
 * Kept distinct from `requireSupplier` on purpose: an unapproved supplier can still read
 * and edit their own draft catalogue, which is the whole point of letting them register
 * before approval. Only publication is gated.
 */
export async function requirePublishingSupplier(userId: string) {
  const profile = await requireSupplier(userId);
  if (!profile.canPublish) {
    throw new ApiError(
      403,
      "NOT_APPROVED",
      "An admin has not approved this supplier to publish yet",
    );
  }
  return profile;
}

/**
 * Load an offer the caller is allowed to act on.
 *
 * A non-existent offer and someone else's offer return the SAME 403, never a 404 — the
 * difference would let a supplier enumerate competitors' offer ids. Admins are unscoped.
 */
export async function assertOwnsOffer(userId: string, isAdmin: boolean, offerId: string) {
  const offer = await prisma.supplierOffer.findUnique({
    where: { id: offerId },
    include: { equipmentItem: { select: { id: true, name: true, indicativePaise: true } } },
  });

  if (isAdmin) {
    if (!offer) throw new ApiError(404, "NOT_FOUND", "Offer not found");
    return offer;
  }

  const profile = await requireSupplier(userId);
  if (!offer || offer.supplierId !== profile.id) {
    throw new ApiError(403, "NOT_YOURS", "That offer is not yours");
  }
  return offer;
}

/**
 * Whether a supplier's offers should be visible publicly.
 *
 * Both conditions matter and neither is redundant: `isActive` is the supplier winding down,
 * `canPublish` is trust that an admin can withdraw without deleting anything. An
 * admin-curated offer has no supplier at all (`supplierId: null`) and is always visible —
 * that is the common case at launch, since an Amazon listing has no khelkhud account.
 */
export const PUBLIC_OFFER_WHERE = {
  isActive: true,
  OR: [{ supplierId: null }, { supplier: { canPublish: true, isActive: true } }],
} satisfies Prisma.SupplierOfferWhereInput;
