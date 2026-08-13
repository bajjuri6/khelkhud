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

export type OrphanRequest = {
  id: string;
  kind: "EQUIPMENT" | "CASH";
  title: string;
  description: string | null;
  totalEstimatedPaise: number;
  createdAt: string;
  village: { id: string; name: string; displayPath: string | null };
  athlete: { user: { name: string }; sport?: { name: string } | null } | null;
  institution: { name: string; kind: string } | null;
  items: { id: string; label: string; quantity: number; estimatedPaise: number }[];
};

function daysWaiting(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

/**
 * The admin fallback queue.
 *
 * Approving here is weaker than a coordinator approving: nobody local has confirmed this
 * person is who they say they are. The dialog says so rather than presenting the same
 * one-click flow the coordinator gets, because the two decisions are not equivalent and
 * the interface should not pretend otherwise.
 */
export function OrphanQueue({ pending }: { pending: OrphanRequest[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<OrphanRequest | null>(null);
  const [rejecting, setRejecting] = useState<OrphanRequest | null>(null);
  const [note, setNote] = useState("");

  async function decide(id: string, decision: "APPROVE" | "REJECT", reason?: string) {
    setBusy(id);
    try {
      await apiClient(`/api/admin/requests/${id}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision, note: reason }),
      });
      toast.success(
        decision === "APPROVE" ? "Opened to sponsors" : "Sent back with your note",
      );
      setConfirming(null);
      setRejecting(null);
      setNote("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not reach the server");
    } finally {
      setBusy(null);
    }
  }

  if (pending.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/60 p-12 text-center">
        <p className="text-base font-semibold">Nothing stuck.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Every village with a pending request has an active coordinator to handle it.
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
          const waited = daysWaiting(r.createdAt);
          return (
            <li key={r.id} className="rounded-xl border border-border bg-card p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="eyebrow text-marigold">
                    {r.kind === "EQUIPMENT" ? "Equipment" : "Cash"} &middot; {r.village.name}
                  </p>
                  <h3 className="mt-2 text-base font-semibold">{r.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    For <span className="font-medium text-foreground">{who}</span> ({what})
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-semibold" data-numeric>
                    {formatPaise(r.totalEstimatedPaise)}
                  </p>
                  {waited > 0 ? (
                    <p
                      className={
                        waited >= 7
                          ? "mt-0.5 text-xs font-medium text-destructive"
                          : "mt-0.5 text-xs text-muted-foreground"
                      }
                    >
                      waiting {waited} day{waited === 1 ? "" : "s"}
                    </p>
                  ) : null}
                </div>
              </div>

              {r.description ? (
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  {r.description}
                </p>
              ) : null}

              {r.items.length > 0 ? (
                <ul className="mt-4 space-y-2 border-t border-border pt-4">
                  {r.items.map((it) => (
                    <li key={it.id} className="flex justify-between gap-4 text-sm">
                      <span className="text-muted-foreground">
                        {it.label}
                        {it.quantity > 1 ? ` × ${it.quantity}` : ""}
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
                  onClick={() => setConfirming(r)}
                >
                  Open to sponsors
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
                <span className="text-xs text-muted-foreground">
                  No coordinator in {r.village.name}. Nobody local has vouched for this.
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={Boolean(confirming)} onOpenChange={(o) => !o && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open this without a local check?</DialogTitle>
            <DialogDescription>
              You are standing in for a coordinator who does not exist yet.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>&bull; The request becomes visible to sponsors immediately.</li>
            <li>
              &bull; The athlete is <span className="font-medium text-foreground">not</span>{" "}
              marked verified — that needs someone who knows them.
            </li>
            <li>&bull; Sponsors are told no local coordinator vouched for it.</li>
            <li>&bull; Your name is recorded against the decision.</li>
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={busy === confirming?.id}
              onClick={() => confirming && void decide(confirming.id, "APPROVE")}
            >
              {busy === confirming?.id ? "Working…" : "Open to sponsors"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rejecting)} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send back for changes</DialogTitle>
            <DialogDescription>
              Say what needs fixing. They will see this, so be specific.
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
