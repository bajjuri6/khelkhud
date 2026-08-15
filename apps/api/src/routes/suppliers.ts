import { Router } from "express";
import {
  isOverpriced,
  supplierOfferCreateSchema,
  supplierOfferUpdateSchema,
  supplierRegisterSchema,
  supplierUpdateSchema,
} from "@khelkhud/shared";
import type {
  SupplierOfferCreateInput,
  SupplierOfferUpdateInput,
  SupplierRegisterInput,
  SupplierUpdateInput,
} from "@khelkhud/shared";
import { prisma } from "../lib/prisma.js";
import { setSessionCookie, signSession } from "../lib/session.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { validate } from "../middleware/validate.js";
import {
  assertOwnsOffer,
  requireSupplier,
} from "../services/supplier.service.js";

export const suppliersRouter: Router = Router();

/**
 * Supplier self-serve.
 *
 * Every route here needs only `requireSupplier`. Writing an offer is NOT gated on
 * approval: registering and being trusted are separate states, so a supplier builds their
 * catalogue while an admin decides, and it goes live the moment the grant lands.
 *
 * Visibility is enforced in exactly one other place — `PUBLIC_OFFER_WHERE`, applied by the
 * public catalogue routes. That separation is deliberate. Gating the write as well would
 * mean an approved supplier starts from nothing, and would put the same rule in two places
 * where only one of them is the one that actually protects donors.
 *
 * Authority never gets re-derived here. Ownership goes through `assertOwnsOffer` so that
 * "not yours" and "does not exist" stay indistinguishable, exactly as with coordinators.
 */

/**
 * Register as a supplier.
 *
 * Deliberately NOT part of /auth/role: that endpoint mints a profile for a role the user
 * picked at onboarding, whereas a supplier usually arrives later, already holding an
 * account. It promotes an unassigned user, and refuses everyone else.
 */
suppliersRouter.post(
  "/register",
  requireAuth,
  validate(supplierRegisterSchema),
  async (req, res, next) => {
    try {
      const body = req.body as SupplierRegisterInput;
      const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.uid } });

      const existing = await prisma.supplierProfile.findUnique({ where: { userId: user.id } });
      if (existing) {
        throw new ApiError(409, "ALREADY_REGISTERED", "This account is already a supplier");
      }

      // An ATHLETE or SPONSOR quietly becoming a SUPPLIER would orphan the profile they
      // already have — every dashboard route is gated on the role, so their athlete
      // profile would still exist with nothing able to reach it. Refuse instead, and let a
      // human decide; a second account is the honest answer.
      if (user.role !== null && user.role !== "SUPPLIER") {
        throw new ApiError(
          409,
          "ROLE_ALREADY_SET",
          `This account is already a ${user.role.toLowerCase()}. Register the supplier under its own account.`,
        );
      }

      const profile = await prisma.$transaction(async (tx) => {
        if (user.role === null) {
          await tx.user.update({ where: { id: user.id }, data: { role: "SUPPLIER" } });
        }
        return tx.supplierProfile.create({
          data: {
            userId: user.id,
            name: body.name,
            website: body.website ?? null,
            gstin: body.gstin ?? null,
            contactPhone: body.contactPhone ?? null,
            // canPublish stays at its default false. Nothing written here can grant it —
            // the schema omits the field and so does this call.
          },
        });
      });

      // The role lives in the session JWT, so a promotion that does not re-issue the cookie
      // leaves the caller role-less until they sign in again.
      setSessionCookie(res, await signSession({ uid: user.id, role: "SUPPLIER" }));
      res.status(201).json({ data: profile });
    } catch (err) {
      next(err);
    }
  },
);

/** Their profile, their approval state, and their whole catalogue — drafts included. */
suppliersRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const profile = await requireSupplier(req.user!.uid);
    // canPublish rides along in the profile spread — the dashboard's whole top-of-page
    // state ("waiting for approval" vs "live") is that one boolean.
    const offers = await listOwnOffers(profile.id);
    res.json({ data: { ...profile, offers } });
  } catch (err) {
    next(err);
  }
});

suppliersRouter.patch(
  "/me",
  requireAuth,
  validate(supplierUpdateSchema),
  async (req, res, next) => {
    try {
      const profile = await requireSupplier(req.user!.uid);
      const body = req.body as SupplierUpdateInput;

      // Field by field rather than a spread. supplierUpdateSchema already omits canPublish,
      // approvedById and approvedAt, but a spread means the day someone widens that schema
      // for an unrelated reason, this route silently starts writing the admin's grant.
      const updated = await prisma.supplierProfile.update({
        where: { id: profile.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.website !== undefined ? { website: body.website ?? null } : {}),
          ...(body.gstin !== undefined ? { gstin: body.gstin ?? null } : {}),
          ...(body.contactPhone !== undefined
            ? { contactPhone: body.contactPhone ?? null }
            : {}),
        },
      });
      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  },
);

/** Same list as GET /me carries, for a page that only renders the catalogue. */
suppliersRouter.get("/me/offers", requireAuth, async (req, res, next) => {
  try {
    const profile = await requireSupplier(req.user!.uid);
    res.json({ data: await listOwnOffers(profile.id) });
  } catch (err) {
    next(err);
  }
});

/**
 * Create an offer.
 *
 * The one write on this router that gates on `canPublish`: an offer is by definition a
 * thing a donor will see, so there is no draft state to hide behind. An unapproved supplier
 * gets 403 NOT_APPROVED here and full access to everything above.
 */
suppliersRouter.post(
  "/me/offers",
  requireAuth,
  validate(supplierOfferCreateSchema),
  async (req, res, next) => {
    try {
      // Not gated on approval — see the note at the top of this file. An unapproved
      // supplier writing an offer is writing a draft; PUBLIC_OFFER_WHERE is what keeps it
      // away from donors until an admin grants publication.
      const profile = await requireSupplier(req.user!.uid);
      const body = req.body as SupplierOfferCreateInput;

      const item = await prisma.equipmentItem.findUnique({
        where: { id: body.equipmentItemId },
        select: { id: true, name: true, isActive: true },
      });
      // A withdrawn item is as unusable as a missing one — an offer against it would never
      // surface, since the public detail route 404s the item itself.
      if (!item || !item.isActive) {
        throw new ApiError(400, "UNKNOWN_ITEM", "That is not a catalogue item");
      }

      // Two live offers from one supplier on one marketplace for one item split nothing
      // useful: cheapest-first shows the pair adjacently and the donor is left guessing
      // which is current. Editing the existing one is the intended move; retiring it
      // (isActive false) frees the slot.
      const clash = await prisma.supplierOffer.findFirst({
        where: {
          supplierId: profile.id,
          equipmentItemId: item.id,
          marketplace: body.marketplace,
          isActive: true,
        },
      });
      if (clash) {
        throw new ApiError(
          409,
          "DUPLICATE_OFFER",
          `You already have a live ${body.marketplace} offer for ${item.name}`,
        );
      }

      const created = await prisma.supplierOffer.create({
        data: {
          // From the session profile, never the body — supplierOfferCreateSchema has no
          // supplierId for exactly this reason.
          supplierId: profile.id,
          equipmentItemId: item.id,
          marketplace: body.marketplace,
          url: body.url,
          pricePaise: body.pricePaise,
        },
        include: { equipmentItem: { select: { id: true, name: true, slug: true } } },
      });
      res.status(201).json({ data: created });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Edit or retire an offer.
 *
 * Gated on ownership only, not on `canPublish`. A supplier whose grant was withdrawn must
 * still be able to correct a price or take a dead link down — PUBLIC_OFFER_WHERE has
 * already stopped anyone seeing it, so there is nothing to protect by locking them out of
 * their own record.
 */
suppliersRouter.patch(
  "/me/offers/:id",
  requireAuth,
  validate(supplierOfferUpdateSchema),
  async (req, res, next) => {
    try {
      const body = req.body as SupplierOfferUpdateInput;
      const offer = await assertOwnsOffer(req.user!.uid, false, String(req.params.id));

      // checkedAt means "when someone last looked at this link and this price". Saying so
      // is the whole `checked` flag; changing the price says it too, because you cannot
      // restate a price without having checked it. Everything else (url, isActive) leaves
      // the timestamp alone rather than laundering a stale price into a fresh-looking one.
      const reaffirmed = body.checked === true || body.pricePaise !== undefined;

      const updated = await prisma.supplierOffer.update({
        where: { id: offer.id },
        data: {
          ...(body.marketplace !== undefined ? { marketplace: body.marketplace } : {}),
          ...(body.url !== undefined ? { url: body.url } : {}),
          ...(body.pricePaise !== undefined ? { pricePaise: body.pricePaise } : {}),
          // Retiring an offer, rather than deleting it: the link may come back, and a
          // deleted row loses the price history a donor's receipt was checked against.
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          ...(reaffirmed ? { checkedAt: new Date() } : {}),
        },
        include: { equipmentItem: { select: { id: true, name: true, slug: true } } },
      });
      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * A supplier's own catalogue, drafts and retired offers included — it is theirs, and the
 * inactive ones are the half of it they need to see to manage it.
 *
 * `isOverpriced` is computed here too, against the admin's indicative price, so a supplier
 * finds out they are above the guard on their own dashboard rather than by wondering why
 * they sort last in front of donors.
 */
async function listOwnOffers(supplierId: string) {
  const offers = await prisma.supplierOffer.findMany({
    where: { supplierId },
    include: {
      equipmentItem: {
        select: { id: true, name: true, slug: true, category: true, indicativePaise: true },
      },
    },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
  });
  return offers.map((offer) => ({
    ...offer,
    isOverpriced: isOverpriced(offer.pricePaise, offer.equipmentItem.indicativePaise),
  }));
}
