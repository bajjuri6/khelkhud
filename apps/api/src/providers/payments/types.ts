export type PaymentProviderName = "RAZORPAY" | "STUB";

export type CreatedOrder = {
  orderId: string;
  keyId: string;
  provider: PaymentProviderName;
};

export interface PaymentProvider {
  name: PaymentProviderName;
  createOrder(input: {
    amountPaise: number;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<CreatedOrder>;
  verifyCheckoutSignature(input: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): boolean;
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;
}
