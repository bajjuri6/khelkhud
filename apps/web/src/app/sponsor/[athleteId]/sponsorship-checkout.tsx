"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { formatPaise } from "@khelkhud/shared";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/lib/api";
import { profilePhotoUrl } from "@/lib/upload";
import type { PublicAthlete } from "@/lib/types";

type CreatedOrder = {
  sponsorshipId: string;
  code: string;
  orderId: string;
  keyId: string;
  provider: "RAZORPAY" | "STUB";
  amountPaise: number;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const NONE = "__none__";

async function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Razorpay checkout"));
    document.body.appendChild(script);
  });
}

export function SponsorshipCheckout({ athlete }: { athlete: PublicAthlete }) {
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [requestId, setRequestId] = useState(NONE);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stubOrder, setStubOrder] = useState<CreatedOrder | null>(null);
  const [success, setSuccess] = useState<{ code: string } | null>(null);

  const photo = profilePhotoUrl(athlete.photoKey) ?? athlete.avatarUrl;
  const openRequests = athlete.requests.filter((r) => r.status !== "CLOSED");

  async function verify(order: CreatedOrder, paymentId: string, signature: string) {
    const res = await apiClient<{ data: { code: string } }>(
      `/api/sponsorships/${order.sponsorshipId}/verify-payment`,
      {
        method: "POST",
        body: JSON.stringify({
          razorpayOrderId: order.orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: signature,
        }),
      },
    );
    setSuccess({ code: res.data.code });
  }

  async function submit() {
    const amountPaise = Math.round(Number(amount) * 100);
    if (!amountPaise || amountPaise < 10000) {
      toast.error("Minimum sponsorship is ₹100");
      return;
    }
    if (!purpose.trim()) {
      toast.error("Add a purpose for your sponsorship");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiClient<{ data: CreatedOrder }>("/api/sponsorships", {
        method: "POST",
        body: JSON.stringify({
          athleteId: athlete.id,
          requestId: requestId === NONE ? null : requestId,
          amountPaise,
          purpose: purpose.trim(),
          isAnonymous,
        }),
      });
      const order = res.data;

      if (order.provider === "STUB") {
        setStubOrder(order);
        return;
      }

      await loadRazorpayScript();
      const rzp = new window.Razorpay!({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: "INR",
        name: "khelkhud",
        description: purpose.trim(),
        handler: (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          void verify(order, response.razorpay_payment_id, response.razorpay_signature).catch(
            (err) => toast.error(err instanceof Error ? err.message : "Verification failed"),
          );
        },
        theme: { color: "#0a0a0a" },
      });
      rzp.open();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start sponsorship");
    } finally {
      setSubmitting(false);
    }
  }

  async function simulateStubPayment() {
    if (!stubOrder) return;
    try {
      await verify(stubOrder, `pay_stub_${Date.now()}`, "stub");
      setStubOrder(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed");
    }
  }

  if (success) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-emerald-100 text-2xl">
            ✓
          </span>
          <h2 className="text-xl font-bold">Sponsorship successful!</h2>
          <p className="text-muted-foreground">
            You are now supporting <span className="font-medium">{athlete.name}</span>.
          </p>
          <p className="rounded-md bg-muted px-4 py-2 font-mono text-sm">{success.code}</p>
          <div className="flex gap-3">
            <Button asChild>
              <Link href="/dashboard/sponsor/sponsorships">Track your sponsorships</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/athletes/${athlete.id}`}>Back to profile</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Avatar className="size-12">
              {photo ? <AvatarImage src={photo} alt={athlete.name} /> : null}
              <AvatarFallback>{athlete.name[0]}</AvatarFallback>
            </Avatar>
            <div>
              <CardTitle>Sponsor {athlete.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {[athlete.sport?.name, athlete.locationLabel].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {openRequests.length > 0 ? (
            <div className="grid gap-2">
              <Label>Support a specific request (optional)</Label>
              <Select
                value={requestId}
                onValueChange={(v) => {
                  setRequestId(v);
                  const req = openRequests.find((r) => r.id === v);
                  if (req) {
                    setPurpose(req.title);
                    const remaining = req.totalEstimatedPaise - req.raisedAmountPaise;
                    if (remaining > 0 && !amount) setAmount(String(remaining / 100));
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="General support" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>General support</SelectItem>
                  {openRequests.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.title} ({formatPaise(r.raisedAmountPaise)} /{" "}
                      {formatPaise(r.totalEstimatedPaise)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label>Amount (₹)</Label>
            <Input
              type="number"
              min="100"
              placeholder="e.g. 5000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label>Purpose</Label>
            <Input
              placeholder="e.g. Cricket equipment"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
            />
            Sponsor anonymously (the athlete won&apos;t see your name)
          </label>

          <Button size="lg" onClick={() => void submit()} disabled={submitting}>
            {submitting
              ? "Preparing payment…"
              : `Sponsor ${Number(amount) > 0 ? formatPaise(Math.round(Number(amount) * 100)) : ""}`}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Payments are processed securely via Razorpay. You&apos;ll be able to track exactly how
            your money is used.
          </p>
        </CardContent>
      </Card>

      <Dialog open={stubOrder !== null} onOpenChange={(open) => !open && setStubOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Simulate payment (dev mode)</DialogTitle>
            <DialogDescription>
              Razorpay keys are not configured, so payments run in stub mode. Simulate a successful
              payment of {stubOrder ? formatPaise(stubOrder.amountPaise) : ""}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStubOrder(null)}>
              Cancel
            </Button>
            <Button onClick={() => void simulateStubPayment()}>Simulate payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
