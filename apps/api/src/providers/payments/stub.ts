import crypto from "node:crypto";
import type { PaymentProvider } from "./types.js";

/**
 * Dev-mode provider used when Razorpay keys are absent. The frontend detects
 * provider === "STUB" and shows a "Simulate payment" dialog instead of
 * Razorpay checkout; the rest of the pipeline runs identically.
 */
export const stubProvider: PaymentProvider = {
  name: "STUB",
  async createOrder() {
    return {
      orderId: `order_stub_${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}`,
      keyId: "rzp_test_stub",
      provider: "STUB",
    };
  },
  verifyCheckoutSignature({ orderId, paymentId }) {
    return orderId.startsWith("order_stub_") && paymentId.startsWith("pay_stub_");
  },
  verifyWebhookSignature() {
    return false;
  },
};
