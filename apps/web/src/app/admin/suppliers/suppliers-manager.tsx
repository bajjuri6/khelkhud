"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { supplierApprovalSchema, supplierUpdateSchema } from "@khelkhud/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, apiClient } from "@/lib/api";

export type AdminSupplier = {
  id: string;
  name: string;
  website: string | null;
  gstin: string | null;
  contactPhone: string | null;
  canPublish: boolean;
  isActive: boolean;
  approvedAt: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
  approvedBy: { name: string; email: string } | null;
  offerCount: number;
  /** Live offers no donor can currently see. The number that says what is waiting on us. */
  hiddenOfferCount: number;
};

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function plural(n: number, one: string, many = `${one}s`) {
  return n === 1 ? one : many;
}

function SupplierRow({
  s,
  onEdit,
  onApprove,
  onWithdraw,
}: {
  s: AdminSupplier;
  onEdit: () => void;
  onApprove: () => void;
  onWithdraw: () => void;
}) {
  return (
    <Card className={s.isActive ? undefined : "opacity-75"}>
      <CardContent className="grid gap-4 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{s.name}</span>
              {!s.isActive ? (
                <Badge variant="outline">Inactive</Badge>
              ) : s.canPublish ? (
                <Badge variant="secondary">Publishing</Badge>
              ) : (
                <Badge variant="outline" className="text-marigold">
                  Waiting on approval
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {[s.user.name, s.user.email, s.contactPhone].filter(Boolean).join(" · ")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {s.website ? (
                <a
                  href={s.website}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  {s.website}
                </a>
              ) : (
                <span>No website</span>
              )}
              {" · "}
              {s.gstin ? (
                <span data-numeric title="Format-checked only, not verified with GSTN">
                  GSTIN {s.gstin}
                </span>
              ) : (
                <span>No GSTIN</span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="outline" onClick={onEdit}>
              Edit
            </Button>
            {s.canPublish ? (
              <Button size="sm" variant="destructive" onClick={onWithdraw}>
                Withdraw
              </Button>
            ) : (
              <Button size="sm" onClick={onApprove}>
                Approve
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            <span data-numeric>{s.offerCount}</span> {plural(s.offerCount, "offer")} written
          </span>
          {s.hiddenOfferCount > 0 ? (
            <span className="text-marigold">
              <span data-numeric>{s.hiddenOfferCount}</span> live{" "}
              {plural(s.hiddenOfferCount, "offer")} no donor can see
            </span>
          ) : null}
          <span>registered {formatDate(s.createdAt)}</span>
        </div>

        <p className="text-xs text-muted-foreground">
          {s.approvedAt && s.approvedBy
            ? `${s.canPublish ? "Approved" : "Withdrawn"} by ${s.approvedBy.name} on ${formatDate(s.approvedAt)}`
            : "No approval decision has been made on this supplier yet."}
        </p>
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  blurb,
  count,
  children,
}: {
  title: string;
  blurb: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-lg font-semibold">
          {title} (<span data-numeric>{count}</span>)
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

/**
 * Approving, withdrawing and correcting suppliers.
 *
 * Both directions of the grant go through a confirm dialog that names the consequence,
 * because both are instantaneous and neither is obvious from a toggle: approving puts every
 * offer this supplier has already written in front of donors, and withdrawing takes them
 * all down. Withdrawing additionally requires a reason, which is sent to the supplier —
 * the API enforces that too, and the copy here says so rather than pretending it is
 * optional politeness.
 */
export function SuppliersManager({ suppliers }: { suppliers: AdminSupplier[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const [approving, setApproving] = useState<AdminSupplier | null>(null);
  const [revoking, setRevoking] = useState<AdminSupplier | null>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);

  const [editing, setEditing] = useState<AdminSupplier | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    website: "",
    gstin: "",
    contactPhone: "",
  });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  // Waiting first, and separated rather than merely sorted: an unapproved supplier is a
  // person stuck behind a decision only someone on this screen can make.
  const waiting = suppliers.filter((s) => !s.canPublish && s.isActive);
  const publishing = suppliers.filter((s) => s.canPublish && s.isActive);
  const inactive = suppliers.filter((s) => !s.isActive);

  async function setApproval(supplier: AdminSupplier, canPublish: boolean) {
    const parsed = supplierApprovalSchema.safeParse({
      canPublish,
      note: note.trim() || undefined,
    });
    if (!parsed.success) {
      setNoteError(parsed.error.issues[0]?.message ?? "Check the note");
      return;
    }
    // Mirrors the API's 400: the schema cannot require this without also demanding a note
    // on every approval, so both ends enforce it on the direction it applies to.
    if (!canPublish && !parsed.data.note) {
      setNoteError("Say why. The supplier is told this, and they deserve a reason.");
      return;
    }
    setBusy(true);
    try {
      await apiClient(`/api/admin/suppliers/${supplier.id}/approval`, {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      toast.success(
        canPublish
          ? `${supplier.name} is publishing — their offers are live`
          : `${supplier.name}'s offers are hidden from donors`,
      );
      setApproving(null);
      setRevoking(null);
      setNote("");
      setNoteError(null);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "NOTE_REQUIRED") {
        setNoteError(err.message);
      } else {
        toast.error(err instanceof Error ? err.message : "Could not update");
      }
    } finally {
      setBusy(false);
    }
  }

  function openEdit(s: AdminSupplier) {
    setEditing(s);
    setEditForm({
      name: s.name,
      website: s.website ?? "",
      gstin: s.gstin ?? "",
      contactPhone: s.contactPhone ?? "",
    });
    setEditErrors({});
  }

  async function saveEdit() {
    if (!editing) return;
    // null, not "": an empty box means "remove this", and undefined would mean "leave it",
    // which would make a wrong website impossible to clear.
    const parsed = supplierUpdateSchema.safeParse({
      name: editForm.name.trim(),
      website: editForm.website.trim() || null,
      gstin: editForm.gstin.trim() || null,
      contactPhone: editForm.contactPhone.trim() || null,
    });
    if (!parsed.success) {
      setEditErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setBusy(true);
    try {
      await apiClient(`/api/admin/suppliers/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify(parsed.data),
      });
      toast.success("Supplier updated");
      setEditing(null);
      router.refresh();
    } catch (err) {
      setEditErrors({ form: err instanceof Error ? err.message : "Could not save" });
    } finally {
      setBusy(false);
    }
  }

  function rows(list: AdminSupplier[]) {
    return list.map((s) => (
      <SupplierRow
        key={s.id}
        s={s}
        onEdit={() => openEdit(s)}
        onApprove={() => {
          setNote("");
          setNoteError(null);
          setApproving(s);
        }}
        onWithdraw={() => {
          setNote("");
          setNoteError(null);
          setRevoking(s);
        }}
      />
    ));
  }

  return (
    <div className="grid gap-8">
      {suppliers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
          No suppliers have registered yet. Until one does, every offer in the catalogue is
          an admin-curated marketplace link.
        </div>
      ) : null}

      <Section
        title="Waiting on approval"
        blurb="They have registered and can see their own catalogue. Nothing they have written reaches a donor until you decide."
        count={waiting.length}
      >
        {rows(waiting)}
      </Section>
      <Section
        title="Publishing"
        blurb="Their offers are live. Anything they add from here appears in front of donors immediately."
        count={publishing.length}
      >
        {rows(publishing)}
      </Section>
      <Section
        title="Inactive"
        blurb="Wound down. Their offers are hidden for the same reason an unapproved supplier's are, and nothing has been deleted."
        count={inactive.length}
      >
        {rows(inactive)}
      </Section>

      {/* ── Approve ─────────────────────────────────────────────────────────── */}
      <Dialog open={approving !== null} onOpenChange={(o) => !o && setApproving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Let {approving?.name} publish?</DialogTitle>
            <DialogDescription>This takes effect immediately.</DialogDescription>
          </DialogHeader>
          <ul className="grid gap-2 text-sm">
            <li className="flex gap-2">
              <span className="text-muted-foreground">&bull;</span>
              <span>
                All <span data-numeric>{approving?.offerCount ?? 0}</span>{" "}
                {plural(approving?.offerCount ?? 0, "offer")} they have already written become
                visible to donors on the next page load.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-muted-foreground">&bull;</span>
              <span>
                Anything they add afterwards is live the moment they save it — there is no
                second review.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-muted-foreground">&bull;</span>
              <span>
                They still cannot set an indicative price. That number is the guard against
                overpaying, and it stays with admins.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-muted-foreground">&bull;</span>
              <span>You are recorded as the person who approved them, and they are told.</span>
            </li>
          </ul>
          <div className="space-y-1.5">
            <Label htmlFor="approve-note">Note (optional)</Label>
            <Textarea
              id="approve-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything you want them to read alongside the approval."
              rows={2}
            />
            {noteError ? <p className="text-xs text-destructive">{noteError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproving(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={() => approving && void setApproval(approving, true)}
              disabled={busy}
            >
              {busy ? "Approving…" : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Withdraw ────────────────────────────────────────────────────────── */}
      <Dialog open={revoking !== null} onOpenChange={(o) => !o && setRevoking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw publishing from {revoking?.name}?</DialogTitle>
            <DialogDescription>This takes effect immediately.</DialogDescription>
          </DialogHeader>
          <ul className="grid gap-2 text-sm">
            <li className="flex gap-2">
              <span className="text-muted-foreground">&bull;</span>
              <span>
                All <span data-numeric>{revoking?.offerCount ?? 0}</span>{" "}
                {plural(revoking?.offerCount ?? 0, "offer")} they have written stop being
                visible to donors.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-muted-foreground">&bull;</span>
              <span>
                Nothing is deleted. Their offers, prices and links stay exactly as they are,
                they keep their own view of them, and they can still correct a price or take
                a dead link down.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-muted-foreground">&bull;</span>
              <span>
                Approving them again puts everything back. This is a flag you can flip either
                way, not a punishment you have to undo by hand.
              </span>
            </li>
          </ul>
          <div className="space-y-1.5">
            <Label htmlFor="revoke-note">Why (required)</Label>
            <Textarea
              id="revoke-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Prices are consistently above the indicative price and the last three links were dead."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              This is sent to {revoking?.user.name} by email and shown on their dashboard. It
              is the only thing telling them what to fix.
            </p>
            {noteError ? <p className="text-xs text-destructive">{noteError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevoking(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => revoking && void setApproval(revoking, false)}
              disabled={busy}
            >
              {busy ? "Withdrawing…" : "Withdraw"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit profile ────────────────────────────────────────────────────── */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit {editing?.name}</DialogTitle>
            <DialogDescription>
              You are editing on the supplier&rsquo;s behalf — for the ones who phone rather
              than log in. This changes their details only; it cannot grant or withdraw
              publishing.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="sup-name">Trading name</Label>
              <Input
                id="sup-name"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Sachdev Sports, Secunderabad"
              />
              <p className="text-xs text-muted-foreground">
                Donors see this next to the price. A name and a place beats a name.
              </p>
              {editErrors.name ? (
                <p className="text-xs text-destructive">{editErrors.name}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sup-website">Website</Label>
              <Input
                id="sup-website"
                value={editForm.website}
                onChange={(e) => setEditForm((f) => ({ ...f, website: e.target.value }))}
                placeholder="https://example.com"
                inputMode="url"
              />
              {editErrors.website ? (
                <p className="text-xs text-destructive">{editErrors.website}</p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sup-gstin">GSTIN</Label>
                <Input
                  id="sup-gstin"
                  value={editForm.gstin}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, gstin: e.target.value.toUpperCase() }))
                  }
                  placeholder="36AAAAA0000A1Z5"
                  data-numeric
                />
                <p className="text-xs text-muted-foreground">
                  Checked for shape only. We do not verify it against the GST registry, so
                  nothing on the site claims we have.
                </p>
                {editErrors.gstin ? (
                  <p className="text-xs text-destructive">{editErrors.gstin}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sup-phone">Contact phone</Label>
                <Input
                  id="sup-phone"
                  value={editForm.contactPhone}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, contactPhone: e.target.value }))
                  }
                  placeholder="9849000000"
                  inputMode="tel"
                  data-numeric
                />
                {editErrors.contactPhone ? (
                  <p className="text-xs text-destructive">{editErrors.contactPhone}</p>
                ) : null}
              </div>
            </div>

            {editErrors.form ? (
              <p className="text-sm text-destructive">{editErrors.form}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void saveEdit()} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
