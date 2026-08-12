import { raw, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { payments } from "../providers/payments/index.js";
import {
  markSponsorshipFailed,
  markSponsorshipPaid,
} from "../services/sponsorship.service.js";

export const razorpayWebhookBodyParser = raw({ type: () => true, limit: "1mb" });

/**
 * Authoritative payment reconciler. Handles payment.captured / payment.failed.
 * Idempotent: markSponsorshipPaid no-ops on already-PAID rows and the unique
 * providerPaymentId constraint guards concurrent double-writes.
 */
export async function razorpayWebhookHandler(req: Request, res: Response): Promise<void> {
  const signature = req.headers["x-razorpay-signature"];
  const body = req.body as Buffer;
  if (typeof signature !== "string" || !Buffer.isBuffer(body)) {
    res.status(400).json({ error: { code: "WEBHOOK_BAD_REQUEST", message: "Invalid webhook" } });
    return;
  }
  if (!payments.verifyWebhookSignature(body, signature)) {
    logger.warn("Razorpay webhook signature rejected");
    res.status(400).json({ error: { code: "WEBHOOK_SIGNATURE", message: "Invalid signature" } });
    return;
  }

  let event: {
    event: string;
    payload?: { payment?: { entity?: { id: string; order_id: string } } };
  };
  try {
    event = JSON.parse(body.toString("utf8"));
  } catch {
    res.status(400).json({ error: { code: "WEBHOOK_PARSE", message: "Invalid JSON" } });
    return;
  }

  const payment = event.payload?.payment?.entity;
  if (!payment?.order_id) {
    res.json({ data: { ignored: true } });
    return;
  }
  const sponsorship = await prisma.sponsorship.findUnique({
    where: { razorpayOrderId: payment.order_id },
  });
  if (!sponsorship) {
    logger.warn({ orderId: payment.order_id }, "Webhook for unknown order");
    res.json({ data: { ignored: true } });
    return;
  }

  const rawPayload = event as unknown as Parameters<typeof markSponsorshipPaid>[2];
  if (event.event === "payment.captured") {
    await markSponsorshipPaid(sponsorship, payment.id, rawPayload);
  } else if (event.event === "payment.failed") {
    await markSponsorshipFailed(sponsorship, payment.id, rawPayload);
  }
  res.json({ data: { ok: true } });
}
