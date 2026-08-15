"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatPaise, rupeesToPaise } from "@khelkhud/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EquipmentPicker, type CatalogueItem } from "@/components/equipment-picker";
import { ApiClientError, apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * A coordinator asking on someone else's behalf.
 *
 * Two things make this different from the athlete's own form, and both are visible in the
 * UI rather than only in the API:
 *
 *   1. The beneficiary has to be named. An athlete's request is for them; a coordinator's
 *      is for a person or a place, and the delivery model needs to know which.
 *   2. There is no queue. It goes live the moment it is saved, under this coordinator's
 *      name — which is the privilege of the role and equally its accountability. Someone
 *      should not discover either by watching it happen.
 */

type Village = { id: string; name: string; displayPath: string | null };

export type Beneficiaries = Record<
  string,
  {
    athletes: {
      id: string;
      name: string;
      sportName: string | null;
      verificationStatus: string;
    }[];
    institutions: { id: string; name: string; kind: string }[];
  }
>;

export type RaisedRequest = {
  id: string;
  kind: "EQUIPMENT" | "CASH";
  title: string;
  status: string;
  totalEstimatedPaise: number;
  raisedAmountPaise: number;
  createdAt: string;
  village: { id: string; name: string };
  athlete: { id: string; user: { name: string } } | null;
  institution: { id: string; name: string; kind: string } | null;
  items: { id: string; label: string; quantity: number; estimatedPaise: number }[];
};

type Kind = "EQUIPMENT" | "CASH";
type BeneficiaryKind = "ATHLETE" | "INSTITUTION";

type Line = {
  /** Stable across re-renders so an input does not lose focus when a line above is removed. */
  key: string;
  label: string;
  quantity: string;
  rupees: string;
  equipmentItemId: string | null;
  /** The catalogue's anchor price, kept so the form can say when the estimate has drifted. */
  indicativePaise: number | null;
  note: string;
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Live",
  PARTIALLY_FULFILLED: "Part met",
  FULFILLED: "Fulfilled",
  PENDING_VALIDATION: "Waiting for validation",
  REJECTED: "Sent back",
  CLOSED: "Closed",
  DRAFT: "Draft",
};

const KIND_BLURB: Record<Kind, string> = {
  EQUIPMENT: "A sponsor buys the thing and ships it to you or to the athlete. No money moves through khelkhud.",
  CASH: "Travel, coaching, entry fees. Money reaches the athlete, who uploads receipts for it.",
};

let lineSeq = 0;
function newLine(patch: Partial<Line> = {}): Line {
  return {
    key: `l${++lineSeq}`,
    label: "",
    quantity: "1",
    rupees: "",
    equipmentItemId: null,
    indicativePaise: null,
    note: "",
    ...patch,
  };
}

/** Money is integer paise everywhere; rupees exist only in these inputs. */
function linePaise(line: Line): number {
  const rupees = Number(line.rupees);
  const qty = Number(line.quantity);
  if (!(rupees > 0) || !(qty > 0)) return 0;
  return rupeesToPaise(rupees) * Math.round(qty);
}

export function RaiseRequest({
  villages,
  beneficiaries,
  designation,
  raised,
}: {
  villages: Village[];
  beneficiaries: Beneficiaries;
  designation: string;
  raised: RaisedRequest[];
}) {
  const router = useRouter();
  const [villageId, setVillageId] = useState(villages[0]?.id ?? "");
  const [beneficiaryKind, setBeneficiaryKind] = useState<BeneficiaryKind>("ATHLETE");
  const [beneficiaryId, setBeneficiaryId] = useState("");
  const [kind, setKind] = useState<Kind>("EQUIPMENT");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);

  const candidates = beneficiaries[villageId] ?? { athletes: [], institutions: [] };
  const options =
    beneficiaryKind === "ATHLETE"
      ? candidates.athletes.map((a) => ({
          id: a.id,
          label: a.name,
          hint: [a.sportName, a.verificationStatus === "VERIFIED" ? null : "not verified yet"]
            .filter(Boolean)
            .join(" · "),
        }))
      : candidates.institutions.map((i) => ({
          id: i.id,
          label: i.name,
          hint: i.kind.toLowerCase(),
        }));

  const total = useMemo(() => lines.reduce((s, l) => s + linePaise(l), 0), [lines]);
  const chosen = options.find((o) => o.id === beneficiaryId) ?? null;

  function setLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function pickVillage(next: string) {
    setVillageId(next);
    // The beneficiary belongs to the village, so it cannot survive the village changing —
    // and the API would refuse the pair anyway, later and less clearly.
    setBeneficiaryId("");
  }

  function pickKind(next: Kind) {
    setKind(next);
    // A cash line is a cost, not a thing anyone stocks, so it can never carry a catalogue
    // id. Dropping the link rather than the typed text keeps the work and keeps the API
    // from having to reject the submit.
    if (next === "CASH") {
      setLines((prev) => prev.map((l) => ({ ...l, equipmentItemId: null, indicativePaise: null })));
    }
  }

  function addFromCatalogue(item: CatalogueItem) {
    setLines((prev) => [
      ...prev,
      newLine({
        label: item.name,
        equipmentItemId: item.id,
        indicativePaise: item.indicativePaise,
        rupees: String(item.indicativePaise / 100),
      }),
    ]);
  }

  async function submit() {
    if (!villageId) {
      toast.error("Pick a village");
      return;
    }
    if (!beneficiaryId) {
      toast.error("Say who this is for");
      return;
    }
    if (!title.trim()) {
      toast.error("Give the request a title");
      return;
    }
    const items = lines
      .filter((l) => l.label.trim() && Number(l.rupees) > 0 && Number(l.quantity) > 0)
      .map((l) => ({
        label: l.label.trim(),
        quantity: Math.round(Number(l.quantity)),
        estimatedPaise: rupeesToPaise(Number(l.rupees)),
        equipmentItemId: l.equipmentItemId,
        note: l.note.trim() || null,
      }));
    if (items.length === 0) {
      toast.error("Add at least one line with a name and a price");
      return;
    }

    setBusy(true);
    try {
      await apiClient("/api/coordinators/me/requests", {
        method: "POST",
        body: JSON.stringify({
          kind,
          title: title.trim(),
          description: description.trim() || null,
          villageId,
          athleteId: beneficiaryKind === "ATHLETE" ? beneficiaryId : null,
          institutionId: beneficiaryKind === "INSTITUTION" ? beneficiaryId : null,
          items,
          // Sent as an instant so the API stores a real point in time rather than a date
          // string whose timezone nobody agreed on.
          deadline: deadline ? new Date(`${deadline}T00:00:00Z`).toISOString() : null,
        }),
      });
      toast.success("Live now — sponsors following this village can see it");
      setTitle("");
      setDescription("");
      setDeadline("");
      setLines([]);
      setBeneficiaryId("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-12">
      <section className="rounded-xl border border-border bg-card p-6">
        {/* Said before the form, not after it. The absence of a review step is the single
            most surprising thing about this screen. */}
        <div className="rounded-lg border border-border bg-muted p-4">
          <p className="text-sm font-medium text-foreground">
            This goes live immediately, in your name.
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            You are the validator in your villages, so there is nobody to approve this after
            you. It is published as validated by{" "}
            <span className="font-medium text-foreground">{designation}</span>, sponsors
            following the village are shown it, and the record says you vouched for it.
          </p>
        </div>

        <div className="mt-6 grid gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {villages.length > 1 ? (
              <div className="space-y-1.5">
                <Label htmlFor="req-village">Village</Label>
                <Select value={villageId} onValueChange={pickVillage}>
                  <SelectTrigger id="req-village" className="h-10">
                    <SelectValue placeholder="Choose a village" />
                  </SelectTrigger>
                  <SelectContent>
                    {villages.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Who you can raise for depends on this.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Village</Label>
                <p className="flex h-10 items-center text-sm text-muted-foreground">
                  {villages[0]?.name ?? "No village assigned"}
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="req-beneficiary">Who is it for</Label>
              <div className="flex gap-1.5">
                {(["ATHLETE", "INSTITUTION"] as const).map((b) => (
                  <button
                    key={b}
                    type="button"
                    aria-pressed={beneficiaryKind === b}
                    onClick={() => {
                      setBeneficiaryKind(b);
                      setBeneficiaryId("");
                    }}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-xs transition-colors",
                      beneficiaryKind === b
                        ? "border-marigold bg-muted text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {b === "ATHLETE" ? "An athlete" : "A school or ground"}
                  </button>
                ))}
              </div>
              {options.length === 0 ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {beneficiaryKind === "ATHLETE"
                    ? "No athlete has registered in this village yet."
                    : "No place registered here yet — register it under Places first."}
                </p>
              ) : (
                <Select value={beneficiaryId} onValueChange={setBeneficiaryId}>
                  <SelectTrigger id="req-beneficiary" className="h-10">
                    <SelectValue placeholder="Choose" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.label}
                        {o.hint ? ` — ${o.hint}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <fieldset className="grid gap-3">
            <legend className="eyebrow text-marigold">What kind of help</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["EQUIPMENT", "CASH"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => pickKind(k)}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-colors",
                    kind === k
                      ? "border-marigold bg-muted"
                      : "border-border bg-card hover:bg-muted/60",
                  )}
                >
                  <span className="block text-sm font-semibold text-foreground">
                    {k === "EQUIPMENT" ? "Equipment" : "Cash"}
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                    {KIND_BLURB[k]}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="req-title">Title</Label>
              <Input
                id="req-title"
                className="h-10"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  kind === "EQUIPMENT" ? "Kabaddi mats for the school ground" : "Nationals in Ranchi"
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="req-deadline">Needed by (optional)</Label>
              <Input
                id="req-deadline"
                type="date"
                className="h-10"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="req-description">Why it is needed</Label>
            <Textarea
              id="req-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A donor in another country knows nothing about this village. You do — tell them."
            />
          </div>

          {kind === "EQUIPMENT" ? (
            <div className="rounded-lg border border-border p-4">
              <EquipmentPicker
                onPick={addFromCatalogue}
                onFreeText={(label) => setLines((prev) => [...prev, newLine({ label })])}
                label="Add what is needed"
              />
            </div>
          ) : null}

          <div className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Label>{kind === "EQUIPMENT" ? "What is needed" : "What the money is for"}</Label>
              {kind === "CASH" ? (
                <Button variant="outline" size="sm" onClick={() => setLines((p) => [...p, newLine()])}>
                  Add a line
                </Button>
              ) : null}
            </div>

            {lines.length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-muted/60 p-4 text-sm text-muted-foreground">
                {kind === "EQUIPMENT"
                  ? "Search the catalogue above to add a line. Anything it has never heard of can still be asked for."
                  : "Break the amount down. A total on its own is hard to say yes to."}
              </p>
            ) : (
              <ul className="grid gap-3">
                {lines.map((line) => {
                  const rupees = Number(line.rupees);
                  // Only a warning. The catalogue price is an anchor, not a rule — a real
                  // local quote can honestly differ from it.
                  const offAnchor =
                    line.indicativePaise !== null &&
                    rupees > 0 &&
                    Math.abs(rupeesToPaise(rupees) - line.indicativePaise) >
                      line.indicativePaise * 0.5;
                  return (
                    <li key={line.key} className="flex flex-wrap items-end gap-2">
                      <div className="grid min-w-[12rem] flex-1 gap-1">
                        <Label className="text-xs text-muted-foreground" htmlFor={`li-${line.key}`}>
                          {line.equipmentItemId ? "From the catalogue" : "Item"}
                        </Label>
                        <Input
                          id={`li-${line.key}`}
                          className="h-10"
                          value={line.label}
                          onChange={(e) => setLine(line.key, { label: e.target.value })}
                          placeholder={kind === "EQUIPMENT" ? "Volleyball net" : "Bus fare, both ways"}
                        />
                      </div>
                      <div className="grid w-20 gap-1">
                        <Label className="text-xs text-muted-foreground" htmlFor={`lq-${line.key}`}>
                          Qty
                        </Label>
                        <Input
                          id={`lq-${line.key}`}
                          className="h-10"
                          type="number"
                          min="1"
                          value={line.quantity}
                          onChange={(e) => setLine(line.key, { quantity: e.target.value })}
                        />
                      </div>
                      <div className="grid w-32 gap-1">
                        <Label className="text-xs text-muted-foreground" htmlFor={`lp-${line.key}`}>
                          Each (₹)
                        </Label>
                        <Input
                          id={`lp-${line.key}`}
                          className="h-10"
                          type="number"
                          min="0"
                          value={line.rupees}
                          onChange={(e) => setLine(line.key, { rupees: e.target.value })}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${line.label || "line"}`}
                        onClick={() => setLines((p) => p.filter((l) => l.key !== line.key))}
                      >
                        &times;
                      </Button>
                      {offAnchor ? (
                        <p className="w-full text-xs text-muted-foreground">
                          The catalogue expects around{" "}
                          <span data-numeric>{formatPaise(line.indicativePaise!)}</span> for this.
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
              <p className="text-sm text-muted-foreground">
                Estimated total{" "}
                <span className="text-base font-semibold text-foreground" data-numeric>
                  {formatPaise(total)}
                </span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="accent" disabled={busy} onClick={() => void submit()}>
              {busy ? "Publishing…" : "Publish this request"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {chosen
                ? `Goes live now for ${chosen.label}, validated by you.`
                : "Choose who it is for first."}
            </span>
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <h2 className="text-h2 font-semibold">What you have raised</h2>
        {raised.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet. Anything you raise here appears in this list, and against your name
            on the sponsor&rsquo;s side.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {raised.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{r.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {r.kind === "EQUIPMENT" ? "Equipment" : "Cash"} &middot;{" "}
                    {r.athlete?.user.name ?? r.institution?.name ?? "—"} &middot; {r.village.name}
                  </p>
                  {r.items.length > 0 ? (
                    <p className="mt-1 max-w-xl truncate text-xs text-muted-foreground">
                      {r.items.map((i) => `${i.label}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join(", ")}
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <Badge variant={r.status === "OPEN" ? "default" : "outline"}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </Badge>
                  <p className="mt-1.5 text-sm font-medium text-foreground" data-numeric>
                    {formatPaise(r.totalEstimatedPaise)}
                  </p>
                  {r.raisedAmountPaise > 0 ? (
                    <p className="text-xs text-muted-foreground" data-numeric>
                      {formatPaise(r.raisedAmountPaise)} in
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
