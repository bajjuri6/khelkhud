import crypto from "node:crypto";
import Razorpay from "razorpay";
import { config } from "../../config.js";
import type { PaymentProvider } from "./types.js";

// Lazy so importing this module without keys (stub mode) never throws.
let _client: Razorpay | null = null;
function client(): Razorpay {
  _client ??= new Razorpay({
    key_id: config.RAZORPAY_KEY_ID,
    key_secret: config.RAZORPAY_KEY_SECRET,
  });
  return _client;
}

export const razorpayProvider: PaymentProvider = {
  name: "RAZORPAY",
  async createOrder({ amountPaise, receipt, notes }) {
    const order = await client().orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes,
    });
    return { orderId: order.id, keyId: config.RAZORPAY_KEY_ID, provider: "RAZORPAY" };
  },
  verifyCheckoutSignature({ orderId, paymentId, signature }) {
    const expected = crypto
      .createHmac("sha256", config.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
    return (
      expected.length === signature.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
    );
  },
  verifyWebhookSignature(rawBody, signature) {
    if (!config.RAZORPAY_WEBHOOK_SECRET) return false;
    const expected = crypto
      .createHmac("sha256", config.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");
    return (
      expected.length === signature.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
    );
  },
};
