import { Router } from "express";
import {
  allocationCreateSchema,
  allocationUpdateSchema,
  formatPaise,
  sponsorshipCreateSchema,
  verifyPaymentSchema,
} from "@khelkhud/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { validate } from "../middleware/validate.js";
import { payments } from "../providers/payments/index.js";
import { notify } from "../services/notify.js";
import {
  createSponsorship,
  markSponsorshipPaid,
  recomputeUtilization,
} from "../services/sponsorship.service.js";

/** Loads a sponsorship and asserts the caller is its athlete-owner. */
async function athleteOwnedSponsorship(id: string, uid: string) {
  const sponsorship = await prisma.sponsorship.findUnique({
    where: { id },
    include: {
      athlete: { select: { userId: true } },
      sponsor: { select: { userId: true } },
      allocations: true,
    },
  });
  if (!sponsorship || sponsorship.athlete.userId !== uid) {
    throw new ApiError(404, "NOT_FOUND", "Sponsorship not found");
  }
  if (sponsorship.paymentStatus !== "PAID") {
    throw new ApiError(400, "NOT_PAID", "This sponsorship has no confirmed payment yet");
  }
  return sponsorship;
}

export const sponsorshipsRouter: Router = Router();

sponsorshipsRouter.post(
  "/",
  requireAuth,
  requireRole("SPONSOR"),
  validate(sponsorshipCreateSchema),
  async (req, res, next) => {
    try {
      const result = await createSponsorship(req.user!.uid, req.body);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

sponsorshipsRouter.post(
  "/:id/verify-payment",
  requireAuth,
  requireRole("SPONSOR"),
  validate(verifyPaymentSchema),
  async (req, res, next) => {
    try {
      const sponsorship = await prisma.sponsorship.findUnique({
        where: { id: String(req.params.id) },
        include: { sponsor: { select: { userId: true } } },
      });
      if (!sponsorship || sponsorship.sponsor.userId !== req.user!.uid) {
        throw new ApiError(404, "NOT_FOUND", "Sponsorship not found");
      }
      if (sponsorship.paymentStatus === "PAID") {
        res.json({ data: { code: sponsorship.code, paymentStatus: "PAID" } });
        return;
      }
      const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
      if (sponsorship.razorpayOrderId !== razorpayOrderId) {
        throw new ApiError(400, "PAYMENT_MISMATCH", "Order does not match this sponsorship");
      }
      const valid = payments.verifyCheckoutSignature({
        orderId: razorpayOrderId,
        paymentId: razorpayPaymentId,
        signature: razorpaySignature,
      });
      if (!valid) throw new ApiError(400, "PAYMENT_SIGNATURE", "Payment verification failed");

      await markSponsorshipPaid(sponsorship, razorpayPaymentId);
      res.json({ data: { code: sponsorship.code, paymentStatus: "PAID" } });
    } catch (err) {
      next(err);
    }
  },
);

sponsorshipsRouter.post(
  "/:id/allocations",
  requireAuth,
  requireRole("ATHLETE"),
  validate(allocationCreateSchema),
  async (req, res, next) => {
    try {
      const sponsorship = await athleteOwnedSponsorship(String(req.params.id), req.user!.uid);
      const allocatedSoFar = sponsorship.allocations.reduce((s, a) => s + a.amountPaise, 0);
      if (allocatedSoFar + req.body.amountPaise > sponsorship.amountPaise) {
        throw new ApiError(
          400,
          "OVER_ALLOCATED",
          `Allocations cannot exceed the sponsored amount (${formatPaise(sponsorship.amountPaise)})`,
        );
      }
      const allocation = await prisma.sponsorshipAllocation.create({
        data: { ...req.body, sponsorshipId: sponsorship.id },
      });
      await recomputeUtilization(sponsorship.id);
      res.status(201).json({ data: allocation });
    } catch (err) {
      next(err);
    }
  },
);

sponsorshipsRouter.patch(
  "/:id/allocations/:allocationId",
  requireAuth,
  requireRole("ATHLETE"),
  validate(allocationUpdateSchema),
  async (req, res, next) => {
    try {
      const sponsorship = await athleteOwnedSponsorship(String(req.params.id), req.user!.uid);
      const existing = sponsorship.allocations.find(
        (a) => a.id === String(req.params.allocationId),
      );
      if (!existing) throw new ApiError(404, "NOT_FOUND", "Allocation not found");

      if (req.body.amountPaise !== undefined) {
        const others = sponsorship.allocations
          .filter((a) => a.id !== existing.id)
          .reduce((s, a) => s + a.amountPaise, 0);
        if (others + req.body.amountPaise > sponsorship.amountPaise) {
          throw new ApiError(400, "OVER_ALLOCATED", "Allocations cannot exceed the sponsored amount");
        }
      }
      if (req.body.receiptDocumentId) {
        const doc = await prisma.document.findUnique({
          where: { id: req.body.receiptDocumentId },
        });
        if (!doc || doc.uploaderUserId !== req.user!.uid) {
          throw new ApiError(403, "FORBIDDEN", "Receipt document not found");
        }
      }

      const allocation = await prisma.sponsorshipAllocation.update({
        where: { id: existing.id },
        data: {
          ...req.body,
          ...(req.body.status === "COMPLETED" && existing.status !== "COMPLETED"
            ? { completedAt: new Date() }
            : {}),
        },
      });
      await recomputeUtilization(sponsorship.id);

      if (req.body.status && req.body.status !== existing.status) {
        await notify(sponsorship.sponsor.userId, "ATHLETE_UPDATE", {
          title: `Utilization update on ${sponsorship.code}`,
          body: `"${allocation.label}" is now ${allocation.status.toLowerCase()}.`,
          linkUrl: `/dashboard/sponsor/sponsorships/${sponsorship.id}`,
        });
      }
      res.json({ data: allocation });
    } catch (err) {
      next(err);
    }
  },
);

sponsorshipsRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const sponsorship = await prisma.sponsorship.findUnique({
      where: { id: String(req.params.id) },
      include: {
        sponsor: { include: { user: { select: { name: true, avatarUrl: true } } } },
        athlete: { include: { user: { select: { name: true, avatarUrl: true } } } },
        request: true,
        allocations: { orderBy: { createdAt: "asc" } },
        updates: {
          orderBy: { createdAt: "desc" },
          include: { attachments: { select: { id: true, fileName: true, mimeType: true, kind: true } } },
        },
        documents: { select: { id: true, fileName: true, mimeType: true, kind: true } },
        transactions: { orderBy: { occurredAt: "asc" } },
      },
    });
    if (!sponsorship) throw new ApiError(404, "NOT_FOUND", "Sponsorship not found");

    const uid = req.user!.uid;
    const isSponsor = sponsorship.sponsor.userId === uid;
    const isAthlete = sponsorship.athlete.userId === uid;
    const isAdmin = req.user!.role === "ADMIN";
    if (!isSponsor && !isAthlete && !isAdmin) {
      throw new ApiError(403, "FORBIDDEN", "You cannot view this sponsorship");
    }

    // Respect sponsor anonymity toward the athlete.
    const sponsorView =
      sponsorship.isAnonymous && isAthlete && !isAdmin
        ? { displayName: "Anonymous sponsor", user: { name: "Anonymous", avatarUrl: null } }
        : {
            displayName: sponsorship.sponsor.displayName,
            sponsorType: sponsorship.sponsor.sponsorType,
            orgName: sponsorship.sponsor.orgName,
            user: sponsorship.sponsor.user,
          };

    res.json({
      data: {
        id: sponsorship.id,
        code: sponsorship.code,
        amountPaise: sponsorship.amountPaise,
        purpose: sponsorship.purpose,
        isAnonymous: sponsorship.isAnonymous,
        status: sponsorship.status,
        paymentStatus: sponsorship.paymentStatus,
        utilizationStatus: sponsorship.utilizationStatus,
        createdAt: sponsorship.createdAt,
        sponsor: sponsorView,
        athlete: {
          id: sponsorship.athlete.id,
          name: sponsorship.athlete.user.name,
          avatarUrl: sponsorship.athlete.user.avatarUrl,
          photoKey: sponsorship.athlete.photoKey,
        },
        request: sponsorship.request,
        allocations: sponsorship.allocations,
        updates: sponsorship.updates,
        documents: sponsorship.documents,
        transactions: isAdmin || isSponsor ? sponsorship.transactions : undefined,
        viewer: { isSponsor, isAthlete, isAdmin },
      },
    });
  } catch (err) {
    next(err);
  }
});
