"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  EQUIPMENT_CATEGORIES,
  equipmentItemCreateSchema,
  equipmentItemUpdateSchema,
  formatPaise,
  rupeesToPaise,
  type EquipmentCategory,
} from "@khelkhud/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, apiClient } from "@/lib/api";
import type { Sport } from "@/lib/types";

export type EquipmentItem = {
  id: string;
  slug: string;
  name: string;
  sportId: string | null;
  sport: { id: string; name: string } | null;
  category: EquipmentCategory;
  spec: string | null;
  indicativePaise: number;
  isActive: boolean;
  _count?: { offers: number };
};

export const CATEGORY_LABEL: Record<EquipmentCategory, string> = {
  BAT: "Bat",
  BALL: "Ball",
  SHOE: "Shoe",
  KIT: "Kit",
  PROTECTIVE: "Protective",
  MAT: "Mat",
  NET: "Net",
  APPAREL: "Apparel",
  TRAINING: "Training",
  OTHER: "Other",
};

/** Radix Select cannot hold an empty string, so the two "unset" options need sentinels. */
const ALL_CATEGORIES = "__all__";
const NO_SPORT = "__none__";

type FormState = {
  name: string;
  sportId: string;
  category: EquipmentCategory;
  spec: string;
  rupees: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  sportId: NO_SPORT,
  category: "OTHER",
  spec: "",
  rupees: "",
  isActive: true,
};

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

/**
 * Curating the catalogue by hand — the row-at-a-time path that sits beside the importer.
 *
 * Validation runs against the same zod schemas the API uses (@khelkhud/shared), so the
 * rules cannot drift. Rupees exist only in this form: they are converted to integer paise
 * with `rupeesToPaise` before anything leaves the component, and a float is never sent.
 */
export function CatalogueManager({
  items,
  sports,
}: {
  items: EquipmentItem[];
  sports: Sport[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>(ALL_CATEGORIES);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EquipmentItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (category !== ALL_CATEGORIES && i.category !== category) return false;
      if (!q) return true;
      const haystack = [
        i.name,
        i.spec ?? "",
        i.sport?.name ?? "",
        CATEGORY_LABEL[i.category] ?? i.category,
        i.slug,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, query, category]);

  const unbuyable = filtered.filter((i) => (i._count?.offers ?? 0) === 0).length;

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setOpen(true);
  }

  function openEdit(item: EquipmentItem) {
    setEditing(item);
    setForm({
      name: item.name,
      sportId: item.sportId ?? NO_SPORT,
      category: item.category,
      spec: item.spec ?? "",
      // Paise back to rupees for display only. The value is an integer in the database, so
      // this division is exact to two places and round-trips through rupeesToPaise.
      rupees: String(item.indicativePaise / 100),
      isActive: item.isActive,
    });
    setErrors({});
    setOpen(true);
  }

  async function save() {
    const rupees = Number(form.rupees.trim());
    if (!form.rupees.trim() || !Number.isFinite(rupees) || rupees <= 0) {
      setErrors({ indicativePaise: "Enter the expected price in rupees." });
      return;
    }

    const payload = {
      name: form.name.trim(),
      sportId: form.sportId === NO_SPORT ? null : form.sportId,
      category: form.category,
      spec: form.spec.trim() || null,
      indicativePaise: rupeesToPaise(rupees),
    };

    const parsed = editing
      ? equipmentItemUpdateSchema.safeParse({ ...payload, isActive: form.isActive })
      : equipmentItemCreateSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }

    setSaving(true);
    try {
      await apiClient(
        editing ? `/api/admin/catalogue/${editing.id}` : "/api/admin/catalogue",
        { method: editing ? "PATCH" : "POST", body: JSON.stringify(parsed.data) },
      );
      toast.success(editing ? `${payload.name} updated` : `${payload.name} added`);
      setOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) setErrors({ form: err.message });
      else toast.error("Could not reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="cat-search">Search</Label>
            <Input
              id="cat-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, spec, sport"
              className="h-10 sm:w-72"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="cat-category" className="h-10 sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
                {EQUIPMENT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={openCreate}>Add an item</Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing <span data-numeric>{filtered.length}</span> of{" "}
        <span data-numeric>{items.length}</span> items
        {unbuyable > 0 ? (
          <>
            {" · "}
            <span className="text-destructive">
              <span data-numeric>{unbuyable}</span> with nothing to buy
            </span>
          </>
        ) : null}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
          {items.length === 0
            ? "The catalogue is empty. Until something is in it, an equipment request has no shared name to point at."
            : "Nothing matches that search."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Sport</TableHead>
                <TableHead className="text-right">Indicative price</TableHead>
                <TableHead>Where to buy</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => {
                const offers = item._count?.offers ?? 0;
                return (
                  <TableRow key={item.id} className={item.isActive ? undefined : "opacity-60"}>
                    <TableCell className="max-w-sm align-top">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{item.name}</span>
                        {item.isActive ? null : <Badge variant="outline">Inactive</Badge>}
                      </div>
                      {item.spec ? (
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                          {item.spec}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          No spec — size, weight or material is usually what makes it
                          orderable.
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      {CATEGORY_LABEL[item.category] ?? item.category}
                    </TableCell>
                    <TableCell className="align-top text-muted-foreground">
                      {item.sport?.name ?? "—"}
                    </TableCell>
                    <TableCell className="align-top text-right" data-numeric>
                      {formatPaise(item.indicativePaise)}
                    </TableCell>
                    <TableCell className="align-top">
                      {offers === 0 ? (
                        <Badge variant="destructive">Nothing to buy</Badge>
                      ) : (
                        <span className="text-muted-foreground">
                          <span data-numeric>{offers}</span> offer{offers === 1 ? "" : "s"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="align-top text-right">
                      <Button size="sm" variant="outline" onClick={() => openEdit(item)}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {unbuyable > 0 ? (
        <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
          An item with nothing to buy names something a donor cannot act on: they read the
          name, agree to fund it, and there is no link to follow. Add an offer, or leave the
          item out of the catalogue until there is one.
        </p>
      ) : null}

      {/* ── Add / edit ──────────────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : "Add an item"}</DialogTitle>
            <DialogDescription>
              Name it precisely enough that a donor could search for it and get the right
              thing.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="item-name">Name</Label>
              <Input
                id="item-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Cricket bat, English willow, size 6, short handle"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                &ldquo;Bat&rdquo; is unbuyable. Include what distinguishes this from the next
                one on the shelf.
              </p>
              {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="item-sport">Sport</Label>
                <Select
                  value={form.sportId}
                  onValueChange={(v) => setForm((f) => ({ ...f, sportId: v }))}
                >
                  <SelectTrigger id="item-sport" className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SPORT}>No particular sport</SelectItem>
                    {sports.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.sportId ? (
                  <p className="text-xs text-destructive">{errors.sportId}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-category">Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, category: v as EquipmentCategory }))
                  }
                >
                  <SelectTrigger id="item-category" className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EQUIPMENT_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_LABEL[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.category ? (
                  <p className="text-xs text-destructive">{errors.category}</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="item-spec">Spec (optional)</Label>
              <Textarea
                id="item-spec"
                value={form.spec}
                onChange={(e) => setForm((f) => ({ ...f, spec: e.target.value }))}
                rows={2}
                placeholder="Size 6, short handle, 1.1–1.2 kg, Kashmir willow acceptable"
              />
              {errors.spec ? <p className="text-xs text-destructive">{errors.spec}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="item-price">Indicative price (₹)</Label>
              <Input
                id="item-price"
                value={form.rupees}
                onChange={(e) => setForm((f) => ({ ...f, rupees: e.target.value }))}
                placeholder="2400"
                inputMode="decimal"
                data-numeric
                autoComplete="off"
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                In rupees — this is converted to paise when it is saved. It is what a donor
                is told to expect to pay, and it is their only defence against overpaying: a
                seller asking ₹18,000 is only obviously wrong next to a number that says
                ₹2,400. Set it too high and the guard silently stops working.
              </p>
              {errors.indicativePaise ? (
                <p className="text-xs text-destructive">{errors.indicativePaise}</p>
              ) : null}
            </div>

            {editing ? (
              <label className="flex items-start gap-2.5 border-t border-border pt-4 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-marigold"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                <span>
                  Active
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    An inactive item keeps its row and its history — nothing is deleted — but
                    it drops out of the public catalogue and out of the request-form picker.
                    Use it to retire a name, not to fix a wrong one.
                  </span>
                </span>
              </label>
            ) : null}

            {errors.form ? <p className="text-sm text-destructive">{errors.form}</p> : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save" : "Add item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
