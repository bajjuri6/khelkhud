import type { Prisma, Sponsorship } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { payments } from "../providers/payments/index.js";
import { ApiError } from "../middleware/errors.js";
import { notify } from "./notify.js";
import { formatPaise } from "@khelkhud/shared";

export async function createSponsorship(
  sponsorUserId: string,
  input: {
    playerId: string;
    requirementId?: string | null;
    amountPaise: number;
    purpose: string;
    isAnonymous: boolean;
  },
) {
  const sponsor = await prisma.sponsorProfile.findUnique({ where: { userId: sponsorUserId } });
  if (!sponsor) throw new ApiError(404, "NO_PROFILE", "Sponsor profile not found");

  const player = await prisma.playerProfile.findUnique({
    where: { id: input.playerId },
    include: { user: { select: { isActive: true } } },
  });
  if (!player || !player.user.isActive) throw new ApiError(404, "NOT_FOUND", "Player not found");
  if (player.userId === sponsorUserId) {
    throw new ApiError(400, "SELF_SPONSOR", "You cannot sponsor yourself");
  }

  if (input.requirementId) {
    const requirement = await prisma.sponsorshipRequirement.findUnique({
      where: { id: input.requirementId },
    });
    if (!requirement || requirement.playerId !== player.id) {
      throw new ApiError(404, "NOT_FOUND", "Requirement not found for this player");
    }
    if (requirement.status === "CLOSED") {
      throw new ApiError(400, "REQUIREMENT_CLOSED", "This requirement is closed");
    }
  }

  // Human-readable code via an atomic per-year counter, e.g. SPN-2026-00042.
  const year = new Date().getFullYear();
  const counterId = `SPN-${year}`;
  const sponsorship = await prisma.$transaction(async (tx) => {
    const counter = await tx.counter.upsert({
      where: { id: counterId },
      create: { id: counterId, value: 1 },
      update: { value: { increment: 1 } },
    });
    const code = `${counterId}-${String(counter.value).padStart(5, "0")}`;
    return tx.sponsorship.create({
      data: {
        code,
        sponsorId: sponsor.id,
        playerId: player.id,
        requirementId: input.requirementId ?? null,
        amountPaise: input.amountPaise,
        purpose: input.purpose,
        isAnonymous: input.isAnonymous,
      },
    });
  });

  const order = await payments.createOrder({
    amountPaise: input.amountPaise,
    receipt: sponsorship.code,
    notes: { sponsorshipId: sponsorship.id, playerId: player.id },
  });

  await prisma.$transaction([
    prisma.sponsorship.update({
      where: { id: sponsorship.id },
      data: { razorpayOrderId: order.orderId },
    }),
    prisma.transaction.create({
      data: {
        sponsorshipId: sponsorship.id,
        amountPaise: input.amountPaise,
        provider: payments.name,
        providerOrderId: order.orderId,
        status: "CREATED",
      },
    }),
  ]);

  return {
    sponsorshipId: sponsorship.id,
    code: sponsorship.code,
    orderId: order.orderId,
    keyId: order.keyId,
    provider: order.provider,
    amountPaise: input.amountPaise,
  };
}

/** Idempotent transition to PAID; used by both checkout verify and webhook. */
export async function markSponsorshipPaid(
  sponsorship: Sponsorship,
  paymentId: string,
  rawPayload?: Prisma.InputJsonValue,
): Promise<void> {
  if (sponsorship.paymentStatus === "PAID") return;

  await prisma.$transaction(async (tx) => {
    await tx.sponsorship.update({
      where: { id: sponsorship.id },
      data: { paymentStatus: "PAID", razorpayPaymentId: paymentId },
    });
    // Unique providerPaymentId makes concurrent webhook + checkout verify safe.
    await tx.transaction.create({
      data: {
        sponsorshipId: sponsorship.id,
        amountPaise: sponsorship.amountPaise,
        provider: payments.name,
        providerOrderId: sponsorship.razorpayOrderId,
        providerPaymentId: paymentId,
        status: "PAID",
        rawPayload,
      },
    });
    if (sponsorship.requirementId) {
      const requirement = await tx.sponsorshipRequirement.update({
        where: { id: sponsorship.requirementId },
        data: { raisedAmountPaise: { increment: sponsorship.amountPaise } },
      });
      const newStatus =
        requirement.raisedAmountPaise >= requirement.totalAmountPaise
          ? "FULLY_FUNDED"
          : "PARTIALLY_FUNDED";
      if (requirement.status !== "CLOSED" && requirement.status !== newStatus) {
        await tx.sponsorshipRequirement.update({
          where: { id: requirement.id },
          data: { status: newStatus },
        });
      }
    }
  });

  const [player, sponsor] = await Promise.all([
    prisma.playerProfile.findUnique({
      where: { id: sponsorship.playerId },
      include: { user: true },
    }),
    prisma.sponsorProfile.findUnique({
      where: { id: sponsorship.sponsorId },
      include: { user: true },
    }),
  ]);
  const amount = formatPaise(sponsorship.amountPaise);
  if (player) {
    const sponsorName = sponsorship.isAnonymous
      ? "An anonymous sponsor"
      : (sponsor?.displayName ?? sponsor?.user.name ?? "A sponsor");
    await notify(player.userId, "SPONSORSHIP_RECEIVED", {
      title: `You received a sponsorship of ${amount}`,
      body: `${sponsorName} sponsored you for: ${sponsorship.purpose} (${sponsorship.code})`,
      linkUrl: `/dashboard/player/sponsorships/${sponsorship.id}`,
    });
  }
  if (sponsor) {
    await notify(sponsor.userId, "PAYMENT_CONFIRMED", {
      title: `Payment confirmed — ${amount}`,
      body: `Your sponsorship ${sponsorship.code} is now active.`,
      linkUrl: `/dashboard/sponsor/sponsorships/${sponsorship.id}`,
    });
  }
  logger.info({ code: sponsorship.code, paymentId }, "Sponsorship paid");
}

export async function markSponsorshipFailed(
  sponsorship: Sponsorship,
  paymentId: string | null,
  rawPayload?: Prisma.InputJsonValue,
): Promise<void> {
  if (sponsorship.paymentStatus === "PAID" || sponsorship.paymentStatus === "FAILED") return;
  await prisma.$transaction([
    prisma.sponsorship.update({
      where: { id: sponsorship.id },
      data: { paymentStatus: "FAILED" },
    }),
    prisma.transaction.create({
      data: {
        sponsorshipId: sponsorship.id,
        amountPaise: sponsorship.amountPaise,
        provider: payments.name,
        providerOrderId: sponsorship.razorpayOrderId,
        providerPaymentId: paymentId,
        status: "FAILED",
        rawPayload,
      },
    }),
  ]);
}

/** Recompute utilizationStatus from allocation states (used from Phase 5 on). */
export async function recomputeUtilization(sponsorshipId: string): Promise<void> {
  const allocations = await prisma.sponsorshipAllocation.findMany({
    where: { sponsorshipId },
  });
  let status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" = "NOT_STARTED";
  if (allocations.length > 0) {
    if (allocations.every((a) => a.status === "COMPLETED")) status = "COMPLETED";
    else if (allocations.some((a) => a.status !== "PLANNED")) status = "IN_PROGRESS";
  }
  await prisma.sponsorship.update({
    where: { id: sponsorshipId },
    data: {
      utilizationStatus: status,
      ...(status === "COMPLETED" ? { status: "COMPLETED" } : {}),
    },
  });
}
