"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatPaise } from "@khelkhud/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, apiClient } from "@/lib/api";

export type QueueRequest = {
  id: string;
  kind: "EQUIPMENT" | "CASH";
  title: string;
  description: string | null;
  status: string;
  totalEstimatedPaise: number;
  createdAt: string;
  village: { name: string; displayPath?: string | null };
  athlete: { user: { name: string }; sport?: { name: string } | null } | null;
  institution: { name: string; kind: string } | null;
  items: { id: string; label: string; quantity: number; estimatedPaise: number }[];
};

/**
 * The coordinator's queue.
 *
 * Approving is one click because that is the point of the role — no admin step, no second
 * queue. Rejecting deliberately is not: it opens a dialog and requires a reason, because
 * "no" without one leaves the athlete with nothing to act on, and the API rejects it anyway.
 */
export function ValidationQueue({ pending }: { pending: QueueRequest[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<QueueRequest | null>(null);
  const [note, setNote] = useState("");

  async function decide(id: string, decision: "APPROVE" | "REJECT", reason?: string) {
    setBusy(id);
    try {
      await apiClient(`/api/coordinators/requests/${id}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision, note: reason }),
      });
      toast.success(
        decision === "APPROVE"
          ? "Approved — it is live for sponsors now"
          : "Sent back with your note",
      );
      setRejecting(null);
      setNote("");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof ApiClientError ? err.message : "Could not reach the server",
      );
    } finally {
      setBusy(null);
    }
  }

  if (pending.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-cream-2/60 p-12 text-center">
        <p className="font-display text-h3">Nothing waiting on you.</p>
        <p className="mt-2 text-sm text-slate">
          Requests raised by athletes in your villages appear here. Anything you raise
          yourself goes live immediately.
        </p>
      </div>
    );
  }

  return (
    <>
      <ul className="space-y-5">
        {pending.map((r) => {
          const who = r.athlete?.user.name ?? r.institution?.name ?? "Unknown";
          const what = r.athlete
            ? (r.athlete.sport?.name ?? "Athlete")
            : (r.institution?.kind.toLowerCase() ?? "institution");
          return (
            <li key={r.id} className="rounded-xl border border-border bg-card p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="eyebrow text-marigold">
                    {r.kind === "EQUIPMENT" ? "Equipment" : "Cash"} &middot; {r.village.name}
                  </p>
                  <h3 className="mt-2 font-display text-h3 font-semibold">{r.title}</h3>
                  <p className="mt-1 text-sm text-slate">
                    For <span className="font-medium text-foreground">{who}</span> ({what})
                  </p>
                </div>
                <p className="shrink-0 font-display text-xl font-semibold" data-numeric>
                  {formatPaise(r.totalEstimatedPaise)}
                </p>
              </div>

              {r.description ? (
                <p className="mt-4 text-sm leading-relaxed text-slate">{r.description}</p>
              ) : null}

              {r.items.length > 0 ? (
                <ul className="mt-4 space-y-2 border-t border-border pt-4">
                  {r.items.map((it) => (
                    <li key={it.id} className="flex justify-between gap-4 text-sm">
                      <span className="text-slate">
                        {it.label}
                        {it.quantity > 1 ? (
                          <span className="text-sweat"> &times; {it.quantity}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 font-medium" data-numeric>
                        {formatPaise(it.estimatedPaise * it.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button
                  variant="accent"
                  disabled={busy === r.id}
                  onClick={() => void decide(r.id, "APPROVE")}
                >
                  {busy === r.id ? "Working…" : "Approve — make it live"}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy === r.id}
                  onClick={() => {
                    setRejecting(r);
                    setNote("");
                  }}
                >
                  Send back
                </Button>
                <span className="text-xs text-sweat">
                  Approving vouches for this person. Your name is recorded against it.
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={Boolean(rejecting)} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send back for changes</DialogTitle>
            <DialogDescription>
              Say what needs fixing. They will see this, so be specific — &ldquo;add the bus
              fare&rdquo; is useful, &ldquo;incomplete&rdquo; is not.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="What should they change?"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!note.trim() || busy === rejecting?.id}
              onClick={() => rejecting && void decide(rejecting.id, "REJECT", note.trim())}
            >
              Send back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
