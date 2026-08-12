import { Router } from "express";
import { sponsorshipCreateSchema, verifyPaymentSchema } from "@khelkhud/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { validate } from "../middleware/validate.js";
import { payments } from "../providers/payments/index.js";
import {
  createSponsorship,
  markSponsorshipPaid,
} from "../services/sponsorship.service.js";

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

sponsorshipsRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const sponsorship = await prisma.sponsorship.findUnique({
      where: { id: String(req.params.id) },
      include: {
        sponsor: { include: { user: { select: { name: true, avatarUrl: true } } } },
        player: { include: { user: { select: { name: true, avatarUrl: true } } } },
        requirement: true,
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
    const isPlayer = sponsorship.player.userId === uid;
    const isAdmin = req.user!.role === "ADMIN";
    if (!isSponsor && !isPlayer && !isAdmin) {
      throw new ApiError(403, "FORBIDDEN", "You cannot view this sponsorship");
    }

    // Respect sponsor anonymity toward the player.
    const sponsorView =
      sponsorship.isAnonymous && isPlayer && !isAdmin
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
        player: {
          id: sponsorship.player.id,
          name: sponsorship.player.user.name,
          avatarUrl: sponsorship.player.user.avatarUrl,
          photoKey: sponsorship.player.photoKey,
        },
        requirement: sponsorship.requirement,
        allocations: sponsorship.allocations,
        updates: sponsorship.updates,
        documents: sponsorship.documents,
        transactions: isAdmin || isSponsor ? sponsorship.transactions : undefined,
        viewer: { isSponsor, isPlayer, isAdmin },
      },
    });
  } catch (err) {
    next(err);
  }
});
