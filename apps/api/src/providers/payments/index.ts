import { config } from "../../config.js";
import { razorpayProvider } from "./razorpay.js";
import { stubProvider } from "./stub.js";
import type { PaymentProvider } from "./types.js";

export const payments: PaymentProvider = config.payments.enabled ? razorpayProvider : stubProvider;

export type { PaymentProvider } from "./types.js";
