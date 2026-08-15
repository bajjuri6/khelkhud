import { Router } from "express";
import { supplierApprovalSchema, supplierUpdateSchema } from "@khelkhud/shared";
import type { SupplierApprovalInput, SupplierUpdateInput } from "@khelkhud/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { validate } from "../middleware/validate.js";
import { notify } from "../services/notify.js";

/**
 * The admin side of the supplier relationship.
 *
 * One decision lives here and nothing else does: **`canPublish`, the §9.4 grant.** A
 * supplier registers themselves on /api/suppliers and builds a profile while an admin
 * decides whether to put them in front of donors. That decision is the only thing standing
 * between a stranger's price and a donor's wallet, so it is recorded (who, when, why) and
 * the supplier is told.
 *
 * Note what this router does NOT do: it never re-derives supplier authority. Visibility is
 * `PUBLIC_OFFER_WHERE` in supplier.service.ts and nothing here duplicates that predicate —
 * flipping the boolean is the whole mechanism.
 *
 * Mounted BEFORE /api/admin in index.ts, like the catalogue router: Express matches mounts
 * in order and the general admin router would otherwise swallow these paths.
 */
export const adminSuppliersRouter: Router = Router();

adminSuppliersRouter.use(requireAuth, requireRole("ADMIN"));

/**
 * Every supplier, approved or not, with the two numbers an admin actually decides on.
 *
 * `hiddenOfferCount` is the important one. An unapproved supplier's live offers exist, are
 * finished, and are invisible to every donor on the site — that number is the size of what
 * is waiting on an admin, and without it the queue looks like a list of names rather than
 * a list of consequences.
 */
adminSuppliersRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.supplierProfile.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { name: true, email: true } },
        _count: { select: { offers: true } },
      },
      // Unapproved first: the whole point of the screen is the people waiting on us.
      orderBy: [{ canPublish: "asc" }, { isActive: "desc" }, { createdAt: "asc" }],
    });

    // Live offers only. A retired offer is hidden because the supplier retired it, which is
    // not something an admin needs to act on; only the live ones are being suppressed by the
    // grant. Counted separately rather than as a filtered `_count` so the "is it actually
    // suppressed" branch happens once, below, where the supplier's own flags are in hand.
    const liveCounts = await prisma.supplierOffer.groupBy({
      by: ["supplierId"],
      where: { isActive: true, supplierId: { in: rows.map((r) => r.id) } },
      _count: { _all: true },
    });
    const liveBySupplier = new Map(
      liveCounts.map((c) => [c.supplierId, c._count._all] as const),
    );

    const data = rows.map((row) => {
      const live = liveBySupplier.get(row.id) ?? 0;
      return {
        ...row,
        offerCount: row._count.offers,
        // Both flags suppress, and for different reasons — a wound-down supplier's offers
        // are just as invisible as an unapproved one's. Either way this is what a donor is
        // not seeing.
        hiddenOfferCount: row.canPublish && row.isActive ? 0 : live,
      };
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

/**
 * Grant or withdraw `canPublish`.
 *
 * The grant is instantaneous in both directions and neither direction deletes anything:
 * approving makes every offer the supplier has already written visible to donors on the
 * next page load, and revoking hides them again while leaving the rows, the prices and the
 * supplier's own view of them untouched.
 */
adminSuppliersRouter.post(
  "/:id/approval",
  validate(supplierApprovalSchema),
  async (req, res, next) => {
    try {
      const body = req.body as SupplierApprovalInput;

      // supplierApprovalSchema marks `note` optional because it genuinely is when granting
      // — "yes, you are trusted" needs no justification. Revoking is the opposite: it takes
      // a supplier's whole catalogue off the site, and the person it happens to is entitled
      // to know why. The rule cannot live in the schema without also forcing a note on
      // every approval, so it is enforced here, on the direction it applies to.
      if (!body.canPublish && !body.note?.trim()) {
        throw new ApiError(
          400,
          "NOTE_REQUIRED",
          "Say why you are withdrawing this supplier — they are told, and they deserve a reason.",
        );
      }

      const supplier = await prisma.supplierProfile.findUnique({
        where: { id: String(req.params.id) },
        include: { user: { select: { id: true, name: true } } },
      });
      if (!supplier) throw new ApiError(404, "NOT_FOUND", "Supplier not found");

      const updated = await prisma.supplierProfile.update({
        where: { id: supplier.id },
        data: {
          canPublish: body.canPublish,
          // Written on a withdrawal too, so the pair reads as "who last decided this, and
          // when" rather than going stale on the admin who approved months ago. The UI
          // reads it against `canPublish` and says "approved by" or "withdrawn by"
          // accordingly — never "approved by" next to a supplier who is not.
          approvedById: req.user!.uid,
          approvedAt: new Date(),
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          approvedBy: { select: { name: true, email: true } },
        },
      });

      // SYSTEM for the grant: good news the recipient did not ask for, in-app only, because
      // emailing housekeeping trains people to ignore mail from us. INFO_REQUESTED for the
      // withdrawal: it carries email, and something that takes a supplier's catalogue off
      // the site must leave the site to reach them rather than wait for their next visit.
      if (body.canPublish) {
        await notify(supplier.userId, "SYSTEM", {
          title: "Your supplier catalogue is live",
          body: `khelkhud has approved ${supplier.name} to publish. Every offer you have written is now visible to donors, and anything you add from here is live immediately.${
            body.note?.trim() ? ` ${body.note.trim()}` : ""
          }`,
          linkUrl: "/dashboard/supplier",
        });
      } else {
        await notify(supplier.userId, "INFO_REQUESTED", {
          title: "Your supplier offers are no longer visible to donors",
          body: `khelkhud has withdrawn publishing for ${supplier.name}. Reason: ${body.note!.trim()} Nothing has been deleted — your offers, prices and links are all still there, you can still correct them, and they go back in front of donors if this is restored.`,
          linkUrl: "/dashboard/supplier",
        });
      }

      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * An admin editing a supplier's own profile fields (§9.4).
 *
 * This is an admin acting on the supplier's behalf — fixing a mistyped GSTIN or a dead
 * website for someone who phoned rather than logged in. It is deliberately the same
 * `supplierUpdateSchema` the supplier's own PATCH /api/suppliers/me uses, so an admin
 * cannot reach a field the owner cannot.
 */
adminSuppliersRouter.patch("/:id", validate(supplierUpdateSchema), async (req, res, next) => {
  try {
    const body = req.body as SupplierUpdateInput;
    const supplier = await prisma.supplierProfile.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!supplier) throw new ApiError(404, "NOT_FOUND", "Supplier not found");

    // Field by field, not a spread — and note that `canPublish` is unreachable from here by
    // construction. The grant has exactly one route, above, because that is the route that
    // records who decided and tells the supplier. A profile edit must never be able to
    // quietly become an approval.
    const updated = await prisma.supplierProfile.update({
      where: { id: supplier.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.website !== undefined ? { website: body.website ?? null } : {}),
        ...(body.gstin !== undefined ? { gstin: body.gstin ?? null } : {}),
        ...(body.contactPhone !== undefined ? { contactPhone: body.contactPhone ?? null } : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { name: true, email: true } },
      },
    });
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});
