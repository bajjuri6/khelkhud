"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { formatPaise, rupeesToPaise } from "@khelkhud/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EquipmentPicker, type CatalogueItem } from "@/components/equipment-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, apiClient } from "@/lib/api";

export type RequestKind = "EQUIPMENT" | "CASH";

/** The catalogue row a saved line points at, when it points at one. */
export type LinkedEquipmentItem = {
  id: string;
  name: string;
  slug: string;
  indicativePaise: number;
};

export type AthleteRequestItem = {
  id: string;
  label: string;
  quantity: number;
  estimatedPaise: number;
  fulfilledQty: number;
  equipmentItem?: LinkedEquipmentItem | null;
};

export type AthleteRequest = {
  id: string;
  kind: RequestKind;
  title: string;
  description: string | null;
  status:
    | "DRAFT"
    | "PENDING_VALIDATION"
    | "OPEN"
    | "PARTIALLY_FULFILLED"
    | "FULFILLED"
    | "CLOSED"
    | "REJECTED";
  rejectionNote: string | null;
  totalEstimatedPaise: number;
  raisedAmountPaise: number;
  items: AthleteRequestItem[];
};

/**
 * A line being edited.
 *
 * `equipmentItemId` is what makes the line mean the same object to a donor in New Jersey as
 * to the athlete typing it, and it carries the price anchor with it. It stays null for
 * everything else — cash lines, and equipment the catalogue has never heard of — which is
 * an ordinary outcome, not a half-filled form. `indicativePaise` is kept alongside the
 * athlete's own figure rather than replacing it, so an override shows up as a difference
 * instead of quietly overwriting the number a sponsor would have judged the ask against.
 */
type DraftItem = {
  label: string;
  quantity: string;
  rupees: string;
  equipmentItemId: string | null;
  indicativePaise: number | null;
};

type Draft = {
  kind: RequestKind;
  title: string;
  description: string;
  items: DraftItem[];
};

const EMPTY_ITEM: DraftItem = {
  label: "",
  quantity: "1",
  rupees: "",
  equipmentItemId: null,
  indicativePaise: null,
};

// Equipment starts with no lines because the first step is the catalogue, not a blank box.
const emptyDraft = (): Draft => ({
  kind: "EQUIPMENT",
  title: "",
  description: "",
  items: [],
});

const KINDS: { value: RequestKind; label: string; blurb: string }[] = [
  {
    value: "EQUIPMENT",
    label: "Equipment",
    blurb: "A sponsor buys the thing and has it shipped to you or your coordinator.",
  },
  {
    value: "CASH",
    label: "Cash",
    blurb: "Travel, coaching, entry fees. Money reaches you, and you upload receipts.",
  },
];

type StatusMeta = {
  label: string;
  variant: "default" | "secondary" | "outline" | "destructive";
  /** Says what happens next. Empty where the label already says everything. */
  note: string;
};

const STATUS: Record<AthleteRequest["status"], StatusMeta> = {
  DRAFT: { label: "Draft", variant: "outline", note: "Not sent anywhere yet." },
  PENDING_VALIDATION: {
    label: "Waiting on your coordinator",
    variant: "secondary",
    note: "Your village coordinator checks this before sponsors can see it.",
  },
  OPEN: {
    label: "Open to sponsors",
    variant: "default",
    note: "Validated and visible to everyone following your village.",
  },
  PARTIALLY_FULFILLED: { label: "Partly met", variant: "default", note: "" },
  FULFILLED: { label: "Fully met", variant: "default", note: "" },
  CLOSED: { label: "Closed", variant: "outline", note: "" },
  REJECTED: {
    label: "Sent back for changes",
    variant: "destructive",
    note: "Fix what your coordinator asked for and send it again.",
  },
};

/** Money is integer paise everywhere; rupees only ever exist in this input. */
function linePaise(item: DraftItem): number | null {
  const rupees = Number(item.rupees);
  return item.rupees.trim() && rupees > 0 ? rupeesToPaise(rupees) : null;
}

function draftTotalPaise(draft: Draft): number {
  return draft.items.reduce((sum, i) => {
    const paise = linePaise(i);
    const qty = Number(i.quantity);
    if (paise === null || !(qty > 0)) return sum;
    return sum + paise * Math.round(qty);
  }, 0);
}

function toPayload(draft: Draft) {
  return {
    kind: draft.kind,
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    items: draft.items
      .filter((i) => i.label.trim() && Number(i.rupees) > 0 && Number(i.quantity) > 0)
      .map((i) => ({
        label: i.label.trim(),
        quantity: Math.round(Number(i.quantity)),
        estimatedPaise: rupeesToPaise(Number(i.rupees)),
        equipmentItemId: i.equipmentItemId,
      })),
  };
}

function RequestEditor({
  draft,
  setDraft,
  onSubmit,
  submitting,
  submitLabel,
  pickerEnabled = true,
}: {
  draft: Draft;
  setDraft: (next: Draft) => void;
  onSubmit: () => void;
  submitting: boolean;
  submitLabel: string;
  /**
   * False for the editor sitting behind the edit dialog. EquipmentPicker owns a fixed input
   * id, so two of them mounted at once would give the page duplicate ids and point a label
   * at the wrong field — and the one behind a modal is unreachable anyway.
   */
  pickerEnabled?: boolean;
}) {
  const total = draftTotalPaise(draft);
  const isEquipment = draft.kind === "EQUIPMENT";
  // The picker leads for equipment: the first move is looking the thing up, not typing into
  // a blank box. It only steps aside once there is something on the list.
  const [picking, setPicking] = useState(false);
  const showPicker = pickerEnabled && (picking || draft.items.length === 0);

  function setItem(index: number, patch: Partial<DraftItem>) {
    setDraft({
      ...draft,
      items: draft.items.map((it, i) => (i === index ? { ...it, ...patch } : it)),
    });
  }

  function addItem(item: DraftItem) {
    setDraft({ ...draft, items: [...draft.items, item] });
    setPicking(false);
  }

  function setKind(kind: RequestKind) {
    setDraft({
      ...draft,
      kind,
      // Cash is money toward travel and fees; the catalogue names objects a donor buys and
      // ships. Carrying a catalogue link across the switch would be a category error the
      // API rejects, so the link is dropped here rather than surfaced as a 400 later.
      items:
        kind === "CASH"
          ? (draft.items.length > 0 ? draft.items : [{ ...EMPTY_ITEM }]).map((i) => ({
              ...i,
              equipmentItemId: null,
              indicativePaise: null,
            }))
          : draft.items,
    });
  }

  return (
    <div className="grid gap-6">
      <fieldset className="grid gap-3">
        <legend className="eyebrow text-marigold">What kind of help</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {KINDS.map((k) => {
            const selected = draft.kind === k.value;
            return (
              <button
                key={k.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setKind(k.value)}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  selected ? "border-marigold bg-muted" : "border-border bg-card hover:bg-muted/60"
                }`}
              >
                <span className="font-display text-base font-semibold text-foreground">
                  {k.label}
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">{k.blurb}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor="request-title">Title</Label>
        <Input
          id="request-title"
          placeholder={
            isEquipment ? "e.g. Kabaddi mats for our ground" : "e.g. Nationals in Ranchi"
          }
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="request-description">Why you need it</Label>
        <Textarea
          id="request-description"
          rows={3}
          placeholder="A sponsor in another city knows nothing about your situation. Tell them."
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </div>

      <div className="grid gap-3">
        <div>
          <Label>{isEquipment ? "What you need" : "What the money is for"}</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            {isEquipment
              ? "One line per item, with roughly what it costs. Sponsors can take one line each."
              : "Break the amount down. A total on its own is hard to say yes to."}
          </p>
        </div>

        {draft.items.map((item, i) => {
          const entered = linePaise(item);
          const linked = isEquipment && item.equipmentItemId !== null;
          // Only worth saying when the two numbers actually disagree. A village shop may
          // genuinely cost more, so this is context for the coordinator and the sponsor,
          // not a correction of the athlete.
          const gap =
            linked && item.indicativePaise !== null && entered !== null
              ? entered - item.indicativePaise
              : 0;

          return (
            <div
              key={i}
              className={
                isEquipment ? "rounded-xl border border-border bg-card p-3" : undefined
              }
            >
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[12rem] flex-1 grid gap-1">
                  <Label className="text-xs text-muted-foreground" htmlFor={`item-label-${i}`}>
                    Item
                  </Label>
                  <Input
                    id={`item-label-${i}`}
                    placeholder={isEquipment ? "Volleyball net" : "Bus fare, both ways"}
                    value={item.label}
                    onChange={(e) => setItem(i, { label: e.target.value })}
                  />
                </div>
                <div className="grid w-20 gap-1">
                  <Label className="text-xs text-muted-foreground" htmlFor={`item-qty-${i}`}>
                    Qty
                  </Label>
                  <Input
                    id={`item-qty-${i}`}
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => setItem(i, { quantity: e.target.value })}
                  />
                </div>
                <div className="grid w-32 gap-1">
                  <Label className="text-xs text-muted-foreground" htmlFor={`item-price-${i}`}>
                    Each (₹)
                  </Label>
                  <Input
                    id={`item-price-${i}`}
                    type="number"
                    min="0"
                    value={item.rupees}
                    onChange={(e) => setItem(i, { rupees: e.target.value })}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove item"
                  disabled={!isEquipment && draft.items.length === 1}
                  onClick={() =>
                    setDraft({ ...draft, items: draft.items.filter((_, idx) => idx !== i) })
                  }
                >
                  &times;
                </Button>
              </div>

              {linked ? (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="font-medium text-marigold">From the catalogue</span>
                  <span className="text-muted-foreground" data-numeric>
                    Typical price {formatPaise(item.indicativePaise ?? 0)}
                  </span>
                  {gap !== 0 ? (
                    <span className="text-foreground" data-numeric>
                      Your estimate is {formatPaise(Math.abs(gap))}{" "}
                      {gap > 0 ? "higher" : "lower"}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    // Un-linking is a real answer, not an undo: what the catalogue calls
                    // the item may not be what the athlete actually needs.
                    onClick={() =>
                      setItem(i, { equipmentItemId: null, indicativePaise: null })
                    }
                    className="text-muted-foreground underline hover:text-foreground"
                  >
                    Not this item
                  </button>
                </div>
              ) : isEquipment ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Your own words. A sponsor sees no typical price against this one, so be
                  precise about what is needed.
                </p>
              ) : null}
            </div>
          );
        })}

        {isEquipment ? (
          showPicker ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/40 p-4">
              <EquipmentPicker
                autoFocus={draft.items.length > 0}
                onPick={(picked: CatalogueItem) =>
                  addItem({
                    label: picked.name,
                    quantity: "1",
                    // Pre-filled, not fixed. The athlete can change it, and the catalogue
                    // figure stays visible beside whatever they put.
                    rupees: String(picked.indicativePaise / 100),
                    equipmentItemId: picked.id,
                    indicativePaise: picked.indicativePaise,
                  })
                }
                onFreeText={(label: string) =>
                  addItem({ ...EMPTY_ITEM, label, quantity: "1" })
                }
              />
              {draft.items.length > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3"
                  onClick={() => setPicking(false)}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          ) : (
            <div>
              <Button variant="outline" size="sm" onClick={() => setPicking(true)}>
                Add an item
              </Button>
            </div>
          )
        ) : (
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDraft({ ...draft, items: [...draft.items, { ...EMPTY_ITEM }] })}
            >
              Add another line
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-3">
          <p className="text-sm text-muted-foreground">
            Estimated total{" "}
            <span className="font-display text-base font-semibold text-foreground" data-numeric>
              {formatPaise(total)}
            </span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="accent" disabled={submitting} onClick={onSubmit}>
          {submitting ? "Sending…" : submitLabel}
        </Button>
        <span className="text-xs text-muted-foreground">
          Goes to your village coordinator first. They vouch for it, then sponsors see it.
        </span>
      </div>
    </div>
  );
}

export function RequestsManager({
  requests,
  villageLabel,
}: {
  requests: AthleteRequest[];
  /** Null when the profile has no village yet, which the API refuses to guess. */
  villageLabel: string | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState<AthleteRequest | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);

  function validate(payload: ReturnType<typeof toPayload>): boolean {
    if (!payload.title) {
      toast.error("Give the request a title");
      return false;
    }
    if (payload.items.length === 0) {
      toast.error("Add at least one line with a name and a price");
      return false;
    }
    return true;
  }

  async function send(url: string, method: "POST" | "PUT", payload: unknown, ok: string) {
    setBusy(true);
    try {
      await apiClient(url, { method, body: JSON.stringify(payload) });
      toast.success(ok);
      router.refresh();
      return true;
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not reach the server");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    const payload = toPayload(draft);
    if (!validate(payload)) return;
    const sent = await send(
      "/api/athletes/me/requests",
      "POST",
      payload,
      "Sent to your village coordinator",
    );
    if (sent) setDraft(emptyDraft());
  }

  async function saveEdit() {
    if (!editing) return;
    const payload = toPayload(editDraft);
    if (!validate(payload)) return;
    const sent = await send(
      `/api/athletes/me/requests/${editing.id}`,
      "PUT",
      payload,
      "Sent back to your coordinator",
    );
    if (sent) setEditing(null);
  }

  async function close(id: string) {
    await send(`/api/athletes/me/requests/${id}`, "PUT", { status: "CLOSED" }, "Request closed");
  }

  function startEdit(request: AthleteRequest) {
    setEditing(request);
    setEditDraft({
      kind: request.kind,
      title: request.title,
      description: request.description ?? "",
      // A saved line keeps whatever it was linked to, so editing the price does not
      // silently sever the anchor a coordinator already saw it against.
      items: request.items.map((i) => ({
        label: i.label,
        quantity: String(i.quantity),
        rupees: String(i.estimatedPaise / 100),
        equipmentItemId: i.equipmentItem?.id ?? null,
        indicativePaise: i.equipmentItem?.indicativePaise ?? null,
      })),
    });
  }

  return (
    <div className="mt-8 grid gap-10">
      {villageLabel ? (
        <section className="rounded-xl border border-border bg-card p-6">
          <p className="eyebrow text-marigold">Raise a request &middot; {villageLabel}</p>
          <div className="mt-5">
            <RequestEditor
              draft={draft}
              setDraft={setDraft}
              onSubmit={() => void create()}
              submitting={busy}
              submitLabel="Send to my coordinator"
              pickerEnabled={!editing}
            />
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-border bg-muted/60 p-8 text-center">
          <p className="font-display text-h3">Set your village first.</p>
          <p className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">
            Sponsors follow villages, and it is your village coordinator who validates what you
            ask for. Without one there is nobody to send this to.
          </p>
          <Button asChild variant="accent" className="mt-5">
            <Link href="/dashboard/athlete/profile">Add my village</Link>
          </Button>
        </section>
      )}

      <section className="grid gap-4">
        <h2 className="font-display text-h3 font-semibold">Your requests</h2>
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing raised yet.</p>
        ) : (
          <ul className="grid gap-4">
            {requests.map((r) => {
              const status = STATUS[r.status];
              const neededQty = r.items.reduce((s, i) => s + i.quantity, 0);
              const gotQty = r.items.reduce((s, i) => s + i.fulfilledQty, 0);
              const pct =
                r.kind === "CASH"
                  ? r.totalEstimatedPaise > 0
                    ? Math.min(100, Math.round((r.raisedAmountPaise / r.totalEstimatedPaise) * 100))
                    : 0
                  : neededQty > 0
                    ? Math.min(100, Math.round((gotQty / neededQty) * 100))
                    : 0;

              return (
                <li key={r.id} className="rounded-xl border border-border bg-card p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="eyebrow text-marigold">
                        {r.kind === "EQUIPMENT" ? "Equipment" : "Cash"}
                      </p>
                      <h3 className="mt-2 font-display text-h3 font-semibold">{r.title}</h3>
                      {r.description ? (
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                          {r.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      <p className="mt-2 font-display text-xl font-semibold" data-numeric>
                        {formatPaise(r.totalEstimatedPaise)}
                      </p>
                    </div>
                  </div>

                  {status.note ? (
                    <p className="mt-3 text-sm text-muted-foreground">{status.note}</p>
                  ) : null}

                  {r.status === "REJECTED" && r.rejectionNote ? (
                    <blockquote className="mt-3 border-l-2 border-border bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
                      &ldquo;{r.rejectionNote}&rdquo;
                    </blockquote>
                  ) : null}

                  {r.items.length > 0 ? (
                    <ul className="mt-4 space-y-2 border-t border-border pt-4">
                      {r.items.map((it) => (
                        <li key={it.id} className="flex justify-between gap-4 text-sm">
                          <span className="min-w-0 text-muted-foreground">
                            {it.label}
                            {it.quantity > 1 ? (
                              <span className="text-muted-foreground"> &times; {it.quantity}</span>
                            ) : null}
                            {it.fulfilledQty > 0 ? (
                              <span className="text-muted-foreground">
                                {" "}
                                &middot; {it.fulfilledQty} received
                              </span>
                            ) : null}
                            {/* The anchor a sponsor judges the ask against, shown to the
                                athlete too so the two of them are looking at one number. */}
                            {it.equipmentItem ? (
                              <span className="mt-0.5 block text-xs text-marigold" data-numeric>
                                Catalogue &middot; typical{" "}
                                {formatPaise(it.equipmentItem.indicativePaise)}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 font-medium" data-numeric>
                            {formatPaise(it.estimatedPaise * it.quantity)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {r.status === "OPEN" ||
                  r.status === "PARTIALLY_FULFILLED" ||
                  r.status === "FULFILLED" ? (
                    <div className="mt-4">
                      <div className="mb-1 flex justify-between text-sm text-muted-foreground">
                        <span data-numeric>
                          {r.kind === "CASH"
                            ? `${formatPaise(r.raisedAmountPaise)} of ${formatPaise(r.totalEstimatedPaise)} funded`
                            : `${gotQty} of ${neededQty} items received`}
                        </span>
                        <span className="text-muted-foreground" data-numeric>
                          {pct}%
                        </span>
                      </div>
                      <Progress value={pct} />
                    </div>
                  ) : null}

                  <div className="mt-5 flex flex-wrap gap-3">
                    {r.status === "REJECTED" || r.status === "PENDING_VALIDATION" ? (
                      <Button variant="outline" size="sm" onClick={() => startEdit(r)}>
                        Edit and resend
                      </Button>
                    ) : null}
                    {r.status !== "CLOSED" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => void close(r.id)}
                      >
                        Close
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit request</DialogTitle>
            <DialogDescription>
              Any change goes back to your coordinator for validation, so sponsors never see a
              request that was vouched for and then altered.
            </DialogDescription>
          </DialogHeader>
          <RequestEditor
            draft={editDraft}
            setDraft={setEditDraft}
            onSubmit={() => void saveEdit()}
            submitting={busy}
            submitLabel="Save and resend"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
