"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { coordinatorAppointSchema, coordinatorUpdateSchema } from "@khelkhud/shared";
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
import { VillagePicker, type Village } from "@/components/village-picker";
import { ApiClientError, apiClient } from "@/lib/api";

export type Coordinator = {
  id: string;
  designation: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  user: { id: string; name: string; email: string };
  appointedBy: { name: string; email: string } | null;
  villages: { id: string; name: string; displayPath: string | null }[];
  _count: { requestsValidated: number };
};

/** The picker returns a full match row; only these three fields survive into the form. */
type PickedVillage = { id: string; name: string; displayPath: string | null };

const EMPTY_FORM = { email: "", name: "", designation: "", phone: "" };

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

function VillageChips({
  villages,
  onRemove,
}: {
  villages: PickedVillage[];
  onRemove: (id: string) => void;
}) {
  if (villages.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No villages yet. A coordinator without one has no authority to exercise.
      </p>
    );
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {villages.map((v) => (
        <li
          key={v.id}
          className="flex items-center gap-2 rounded-md border border-border bg-muted px-2.5 py-1 text-xs"
          title={v.displayPath ?? undefined}
        >
          <span className="font-medium">{v.name}</span>
          <button
            type="button"
            onClick={() => onRemove(v.id)}
            aria-label={`Remove ${v.name}`}
            className="text-muted-foreground transition-colors hover:text-destructive"
          >
            &times;
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Appointing, editing and deactivating village coordinators.
 *
 * Client-side validation runs against the SAME zod schemas the API uses
 * (@khelkhud/shared), so the rules cannot drift. The server still validates.
 *
 * The appointment is deliberately two steps — fill in, then confirm against a summary of
 * what is being granted. This is a delegation of trust, not a row in a table: from the
 * moment it is saved, this person's word makes requests live without an admin in the loop.
 */
export function CoordinatorsManager({ coordinators }: { coordinators: Coordinator[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const [appointOpen, setAppointOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [villages, setVillages] = useState<PickedVillage[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Remounting the picker after each pick clears its name/PIN inputs, so the next village
  // starts from a blank search rather than the previous one's result list.
  const [pickerSeed, setPickerSeed] = useState(0);
  const [confirming, setConfirming] = useState(false);

  const [editing, setEditing] = useState<Coordinator | null>(null);
  const [editForm, setEditForm] = useState({ designation: "", phone: "" });
  const [editVillages, setEditVillages] = useState<PickedVillage[]>([]);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editSeed, setEditSeed] = useState(0);

  const [toggling, setToggling] = useState<Coordinator | null>(null);

  function addVillage(list: PickedVillage[], v: Village): PickedVillage[] {
    if (list.some((x) => x.id === v.id)) return list;
    return [...list, { id: v.id, name: v.name, displayPath: v.displayPath }];
  }

  function resetAppoint() {
    setForm(EMPTY_FORM);
    setVillages([]);
    setErrors({});
    setConfirming(false);
  }

  function reviewAppointment() {
    const parsed = coordinatorAppointSchema.safeParse({
      email: form.email,
      name: form.name,
      designation: form.designation,
      phone: form.phone.trim() || undefined,
      villageIds: villages.map((v) => v.id),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setConfirming(true);
  }

  async function appoint() {
    const parsed = coordinatorAppointSchema.safeParse({
      email: form.email,
      name: form.name,
      designation: form.designation,
      phone: form.phone.trim() || undefined,
      villageIds: villages.map((v) => v.id),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      setConfirming(false);
      return;
    }
    setBusy(true);
    try {
      await apiClient("/api/admin/coordinators", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      toast.success(`${parsed.data.name} can now validate in ${villages.length} village(s)`);
      resetAppoint();
      setAppointOpen(false);
      router.refresh();
    } catch (err) {
      setConfirming(false);
      if (err instanceof ApiClientError) {
        // Both of these are about a specific field, so they belong next to it rather than
        // in a toast the admin has to remember while re-reading the form.
        if (err.code === "ALREADY_COORDINATOR") setErrors({ email: err.message });
        else if (err.code === "INVALID_VILLAGE") setErrors({ villageIds: err.message });
        else setErrors({ form: err.message });
      } else {
        toast.error("Could not reach the server. Check your connection and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  function openEdit(c: Coordinator) {
    setEditing(c);
    setEditForm({ designation: c.designation, phone: c.phone ?? "" });
    setEditVillages(c.villages);
    setEditErrors({});
  }

  async function saveEdit() {
    if (!editing) return;
    const parsed = coordinatorUpdateSchema.safeParse({
      designation: editForm.designation,
      // "" rather than undefined: undefined means "leave unchanged", which would make a
      // phone number impossible to remove once entered.
      phone: editForm.phone.trim(),
      villageIds: editVillages.map((v) => v.id),
    });
    if (!parsed.success) {
      setEditErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setBusy(true);
    try {
      await apiClient(`/api/admin/coordinators/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify(parsed.data),
      });
      toast.success("Coordinator updated");
      setEditing(null);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setEditErrors(
          err.code === "INVALID_VILLAGE" ? { villageIds: err.message } : { form: err.message },
        );
      } else {
        toast.error("Could not reach the server. Check your connection and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    if (!toggling) return;
    const next = !toggling.isActive;
    setBusy(true);
    try {
      await apiClient(`/api/admin/coordinators/${toggling.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: next }),
      });
      toast.success(
        next
          ? `${toggling.user.name} can validate again`
          : `${toggling.user.name} can no longer validate`,
      );
      setToggling(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      {/* ── Appointment ─────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-6">
          {!appointOpen ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-medium">Appoint a coordinator</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Someone with public standing in the village — a PET teacher, a sarpanch.
                  Their word will validate requests without an admin reviewing them.
                </p>
              </div>
              <Button onClick={() => setAppointOpen(true)}>Appoint</Button>
            </div>
          ) : (
            <div className="grid gap-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">Appoint a coordinator</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    From the moment this is saved, anything this person raises in their
                    villages is live immediately, and requests from athletes there come to
                    them instead of to the verification queue.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    resetAppoint();
                    setAppointOpen(false);
                  }}
                >
                  Cancel
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="coord-name">Full name</Label>
                  <Input
                    id="coord-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Sunitha Reddy"
                    autoComplete="off"
                  />
                  {errors.name ? (
                    <p className="text-xs text-destructive">{errors.name}</p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="coord-email">Email</Label>
                  <Input
                    id="coord-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="sunitha@example.com"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    An account is created if this email is new; an existing one is switched
                    to the coordinator role.
                  </p>
                  {errors.email ? (
                    <p className="text-xs text-destructive">{errors.email}</p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="coord-designation">Who they are in the village</Label>
                <Input
                  id="coord-designation"
                  value={form.designation}
                  onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
                  placeholder="PET teacher, ZPHS Ammapur"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Sponsors see this and judge the vouching by it. &ldquo;PET teacher, ZPHS
                  Ammapur&rdquo; tells a donor in Dallas why this person&rsquo;s word counts.
                  &ldquo;Coordinator&rdquo; tells them nothing.
                </p>
                {errors.designation ? (
                  <p className="text-xs text-destructive">{errors.designation}</p>
                ) : null}
              </div>

              <div className="space-y-1.5 sm:max-w-xs">
                <Label htmlFor="coord-phone">Phone (optional)</Label>
                <Input
                  id="coord-phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+91 98490 00000"
                  inputMode="tel"
                  data-numeric
                  autoComplete="off"
                />
                {errors.phone ? (
                  <p className="text-xs text-destructive">{errors.phone}</p>
                ) : null}
              </div>

              <div className="space-y-3 border-t border-border pt-5">
                <div>
                  <Label>Villages they cover</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    One person routinely covers several small villages. Add them one at a
                    time — this list is the exact boundary of their authority.
                  </p>
                </div>
                <VillageChips
                  villages={villages}
                  onRemove={(id) => setVillages((vs) => vs.filter((v) => v.id !== id))}
                />
                <VillagePicker
                  // `value` stays null: a pick is appended to the list above rather than
                  // held by the picker, which is what lets the admin add several.
                  key={`appoint-village-${pickerSeed}`}
                  value={null}
                  label="Add a village"
                  onChange={(v) => {
                    if (!v) return;
                    setVillages((vs) => addVillage(vs, v));
                    setPickerSeed((s) => s + 1);
                  }}
                />
                {errors.villageIds ? (
                  <p className="text-xs text-destructive">{errors.villageIds}</p>
                ) : null}
              </div>

              {errors.form ? <p className="text-sm text-destructive">{errors.form}</p> : null}

              <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
                <Button onClick={reviewAppointment} disabled={busy}>
                  Review appointment
                </Button>
                <span className="text-xs text-muted-foreground">
                  You are recorded as the person who appointed them.
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Current coordinators ────────────────────────────────────────────── */}
      {coordinators.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
          No coordinators yet. Until one is appointed, every request in every village waits
          on an admin.
        </div>
      ) : (
        <div className="grid gap-4">
          {coordinators.map((c) => (
            <Card key={c.id} className={c.isActive ? undefined : "opacity-75"}>
              <CardContent className="grid gap-4 pt-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{c.user.name}</span>
                      <Badge variant={c.isActive ? "secondary" : "outline"}>
                        {c.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-sm">{c.designation}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[c.user.email, c.phone].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(c)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant={c.isActive ? "destructive" : "outline"}
                      onClick={() => setToggling(c)}
                    >
                      {c.isActive ? "Deactivate" : "Reactivate"}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {c.villages.map((v) => (
                    <span
                      key={v.id}
                      title={v.displayPath ?? undefined}
                      className="rounded-md border border-border bg-muted px-2.5 py-1 text-xs"
                    >
                      {v.name}
                    </span>
                  ))}
                  {c.villages.length === 0 ? (
                    <span className="text-xs text-destructive">
                      No villages assigned — they cannot act anywhere.
                    </span>
                  ) : null}
                </div>

                <p className="text-xs text-muted-foreground">
                  <span data-numeric>{c._count.requestsValidated}</span> request
                  {c._count.requestsValidated === 1 ? "" : "s"} validated
                  {c.appointedBy ? ` · appointed by ${c.appointedBy.name}` : null} ·{" "}
                  <time dateTime={c.createdAt}>
                    {new Date(c.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </time>
                </p>

                {!c.isActive ? (
                  <p className="text-xs text-muted-foreground">
                    Deactivated, not deleted. They validate nothing new, and their name
                    stays on the {c._count.requestsValidated} decision
                    {c._count.requestsValidated === 1 ? "" : "s"} they already signed.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Confirm appointment ─────────────────────────────────────────────── */}
      <Dialog open={confirming} onOpenChange={(o) => !o && setConfirming(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delegate verification to {form.name.trim()}?</DialogTitle>
            <DialogDescription>
              This is a trust delegation, and it takes effect immediately.
            </DialogDescription>
          </DialogHeader>
          <ul className="grid gap-2 text-sm">
            <li className="flex gap-2">
              <span className="text-muted-foreground">&bull;</span>
              <span>
                Requests <span className="font-medium">{form.name.trim()}</span> raises in{" "}
                {villages.map((v) => v.name).join(", ")} go live with no review.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-muted-foreground">&bull;</span>
              <span>
                Requests raised by athletes there stop coming to the admin verification
                queue and go to them instead.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-muted-foreground">&bull;</span>
              <span>
                Sponsors will see &ldquo;{form.designation.trim()}&rdquo; as the reason to
                trust the vouching.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-muted-foreground">&bull;</span>
              <span>
                Every decision is recorded against their name — and yours, as the person who
                appointed them.
              </span>
            </li>
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
              Back
            </Button>
            <Button onClick={() => void appoint()} disabled={busy}>
              {busy ? "Appointing…" : "Appoint"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit ────────────────────────────────────────────────────────────── */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit {editing?.user.name}</DialogTitle>
            <DialogDescription>
              Removing a village removes the authority with it — they can no longer act
              there.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-designation">Who they are in the village</Label>
              <Input
                id="edit-designation"
                value={editForm.designation}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, designation: e.target.value }))
                }
                placeholder="PET teacher, ZPHS Ammapur"
              />
              <p className="text-xs text-muted-foreground">Shown to sponsors.</p>
              {editErrors.designation ? (
                <p className="text-xs text-destructive">{editErrors.designation}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                value={editForm.phone}
                onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                inputMode="tel"
                data-numeric
              />
              {editErrors.phone ? (
                <p className="text-xs text-destructive">{editErrors.phone}</p>
              ) : null}
            </div>

            <div className="space-y-3 border-t border-border pt-4">
              <Label>Villages they cover</Label>
              <VillageChips
                villages={editVillages}
                onRemove={(id) => setEditVillages((vs) => vs.filter((v) => v.id !== id))}
              />
              <VillagePicker
                key={`edit-village-${editing?.id}-${editSeed}`}
                value={null}
                label="Add a village"
                onChange={(v) => {
                  if (!v) return;
                  setEditVillages((vs) => addVillage(vs, v));
                  setEditSeed((s) => s + 1);
                }}
              />
              {editErrors.villageIds ? (
                <p className="text-xs text-destructive">{editErrors.villageIds}</p>
              ) : null}
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

      {/* ── Deactivate / reactivate ─────────────────────────────────────────── */}
      <Dialog open={toggling !== null} onOpenChange={(o) => !o && setToggling(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {toggling?.isActive ? "Withdraw" : "Restore"} {toggling?.user.name}
              &rsquo;s authority
            </DialogTitle>
            <DialogDescription>
              {toggling?.isActive
                ? "They stop validating immediately. Requests in their villages fall back to the admin queue until someone else is appointed."
                : "They can validate in their assigned villages again, effective immediately."}
            </DialogDescription>
          </DialogHeader>
          {toggling?.isActive ? (
            <p className="text-sm text-muted-foreground">
              This is a flag, not a deletion. The {toggling._count.requestsValidated}{" "}
              verification record
              {toggling._count.requestsValidated === 1 ? "" : "s"} they signed must keep
              resolving to a real person, so their account and their name on those decisions
              stay exactly as they are. You can reactivate them at any time.
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setToggling(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={toggling?.isActive ? "destructive" : "default"}
              onClick={() => void toggleActive()}
              disabled={busy}
            >
              {busy ? "Saving…" : toggling?.isActive ? "Deactivate" : "Reactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
