"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  MARKETPLACES,
  formatPaise,
  isOverpriced,
  rupeesToPaise,
  supplierOfferCreateSchema,
  supplierRegisterSchema,
} from "@khelkhud/shared";
import type { Marketplace } from "@khelkhud/shared";
import { EquipmentPicker, type CatalogueItem } from "@/components/equipment-picker";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiClientError, apiClient } from "@/lib/api";

export type SupplierOffer = {
  id: string;
  marketplace: Marketplace;
  url: string;
  pricePaise: number;
  checkedAt: string;
  isActive: boolean;
  equipmentItem: {
    id: string;
    name: string;
    slug: string;
    category: string;
    indicativePaise: number;
  };
};

export type SupplierMe = {
  id: string;
  name: string;
  website: string | null;
  gstin: string | null;
  contactPhone: string | null;
  canPublish: boolean;
  isActive: boolean;
  approvedAt: string | null;
  createdAt: string;
  user: { name: string; email: string };
  offers: SupplierOffer[];
};

const MARKETPLACE_LABEL: Record<Marketplace, string> = {
  AMAZON: "Amazon",
  FLIPKART: "Flipkart",
  MEESHO: "Meesho",
  DIRECT: "Direct (your own storefront)",
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
 * How old the price is, in words.
 *
 * Shown everywhere a price is, on both sides of the site. We do not scrape marketplaces to
 * refresh this — that is brittle and adversarial — so the age is the donor's only signal
 * that a number may have moved since anyone looked.
 */
function checkedLabel(iso: string): { text: string; stale: boolean } {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return { text: "Price checked today", stale: false };
  if (days === 1) return { text: "Price checked yesterday", stale: false };
  return { text: `Price checked ${days} days ago`, stale: days > 90 };
}

/* ── Registration ─────────────────────────────────────────────────────────── */

function RegisterForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", website: "", gstin: "", contactPhone: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit() {
    const parsed = supplierRegisterSchema.safeParse({
      name: form.name.trim(),
      website: form.website.trim() || null,
      gstin: form.gstin.trim() || null,
      contactPhone: form.contactPhone.trim() || null,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setBusy(true);
    try {
      await apiClient("/api/suppliers/register", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      toast.success("Registered. An admin will review this before anything goes public.");
      router.refresh();
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : "Could not register" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="grid gap-5 pt-6">
        <div>
          <h2 className="text-lg font-semibold">Register as a supplier</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            This creates your account and nothing else. It does not put you in front of
            donors — an admin decides that separately, and until they do, everything you
            write here is yours alone.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reg-name">Trading name</Label>
          <Input
            id="reg-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Sachdev Sports, Secunderabad"
            autoComplete="organization"
          />
          <p className="text-xs text-muted-foreground">
            Donors see this next to your price. A name and a place tells someone in New
            Jersey who they are buying from; a name alone does not.
          </p>
          {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reg-website">Website (optional)</Label>
          <Input
            id="reg-website"
            value={form.website}
            onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
            placeholder="https://example.com"
            inputMode="url"
          />
          {errors.website ? (
            <p className="text-xs text-destructive">{errors.website}</p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="reg-gstin">GSTIN (optional)</Label>
            <Input
              id="reg-gstin"
              value={form.gstin}
              onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value.toUpperCase() }))}
              placeholder="36AAAAA0000A1Z5"
              data-numeric
            />
            <p className="text-xs text-muted-foreground">
              We check the shape of it, not the registry. Nothing on the site will claim we
              verified it.
            </p>
            {errors.gstin ? <p className="text-xs text-destructive">{errors.gstin}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reg-phone">Contact phone (optional)</Label>
            <Input
              id="reg-phone"
              value={form.contactPhone}
              onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
              placeholder="9849000000"
              inputMode="tel"
              data-numeric
            />
            {errors.contactPhone ? (
              <p className="text-xs text-destructive">{errors.contactPhone}</p>
            ) : null}
          </div>
        </div>

        {errors.form ? <p className="text-sm text-destructive">{errors.form}</p> : null}

        <div>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? "Registering…" : "Register"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Approval state ───────────────────────────────────────────────────────── */

function ApprovalState({ profile }: { profile: SupplierMe }) {
  if (!profile.isActive) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="eyebrow text-muted-foreground">Account inactive</p>
          <h2 className="mt-2 text-lg font-semibold">This supplier account is switched off</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            None of your offers are visible to donors. Nothing has been deleted. Email
            khelkhud if this is not what you expected.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (profile.canPublish) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="eyebrow text-marigold">Live</p>
          <h2 className="mt-2 text-lg font-semibold">
            Your offers are visible to donors
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Anything you add is live the moment you save it — there is no second review. What
            a donor sees next to your price is the catalogue&rsquo;s indicative price and how
            long ago you last checked yours.
            {profile.approvedAt
              ? ` Approved on ${new Date(profile.approvedAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}.`
              : ""}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <p className="eyebrow text-marigold">Not visible to donors</p>
        <h2 className="mt-2 text-lg font-semibold">
          Nothing you publish reaches a donor yet
        </h2>
        <div className="mt-2 grid max-w-2xl gap-2 text-sm leading-relaxed text-muted-foreground">
          <p>
            An admin at khelkhud is reviewing this account. We are not going to give you a
            date, because we would only be guessing — but the decision is a person&rsquo;s,
            not a queue&rsquo;s, and you will be emailed either way.
          </p>
          <p>
            {profile.offers.length > 0
              ? "Your offers below are all still here, exactly as you wrote them. You can correct a price, replace a dead link or retire one at any time; none of it is visible to a donor until this is approved."
              : "Adding offers opens up once you are approved. An offer is, by definition, something a donor sees, so there is no draft version of one to write in the meantime."}
          </p>
          {profile.approvedAt ? (
            <p>
              Publishing was withdrawn on{" "}
              {new Date(profile.approvedAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
              . The reason was sent to {profile.user.email} — it is the thing that says what
              to fix.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Add an offer ─────────────────────────────────────────────────────────── */

function AddOffer({ canPublish }: { canPublish: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [item, setItem] = useState<CatalogueItem | null>(null);
  const [marketplace, setMarketplace] = useState<Marketplace>("AMAZON");
  const [url, setUrl] = useState("");
  const [rupees, setRupees] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Rupees at the edge, paise everywhere behind it. A supplier types 1800; nothing but this
  // line ever sees that number as anything other than 180000.
  const pricePaise = rupees.trim() === "" ? null : rupeesToPaise(Number(rupees));
  const over =
    item !== null &&
    pricePaise !== null &&
    Number.isFinite(pricePaise) &&
    isOverpriced(pricePaise, item.indicativePaise);

  function reset() {
    setItem(null);
    setMarketplace("AMAZON");
    setUrl("");
    setRupees("");
    setErrors({});
  }

  async function submit() {
    if (!item) {
      setErrors({ equipmentItemId: "Pick the catalogue item this is for." });
      return;
    }
    const parsed = supplierOfferCreateSchema.safeParse({
      equipmentItemId: item.id,
      marketplace,
      url: url.trim(),
      pricePaise,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setBusy(true);
    try {
      await apiClient("/api/suppliers/me/offers", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      toast.success(`${item.name} added — it is live for donors now`);
      reset();
      setOpen(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "DUPLICATE_OFFER") {
        setErrors({ form: err.message });
      } else {
        setErrors({ form: err instanceof Error ? err.message : "Could not add the offer" });
      }
    } finally {
      setBusy(false);
    }
  }

  if (!canPublish) {
    return (
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold">Add an offer</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Not open yet. Publishing is the one thing approval gates, and an offer is a thing
            a donor sees — so there is nothing to write here until an admin has decided.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        {!open ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Add an offer</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                A catalogue item, a working link, and what you are selling it for.
              </p>
            </div>
            <Button onClick={() => setOpen(true)}>Add an offer</Button>
          </div>
        ) : (
          <div className="grid gap-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Add an offer</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This goes in front of donors as soon as you save it.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  reset();
                  setOpen(false);
                }}
              >
                Cancel
              </Button>
            </div>

            {item ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[item.sport?.name, item.spec].filter(Boolean).join(" · ") || "Catalogue item"}{" "}
                    · indicative{" "}
                    <span data-numeric>{formatPaise(item.indicativePaise)}</span>
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setItem(null)}>
                  Change
                </Button>
              </div>
            ) : (
              <>
                <EquipmentPicker
                  label="Which catalogue item is this for?"
                  onPick={(picked) => {
                    setItem(picked);
                    setErrors((e) => ({ ...e, equipmentItemId: "" }));
                  }}
                />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Only catalogue items, and only ones an admin has added. The catalogue is
                  the shared vocabulary — if every supplier invented their own names for a
                  size 6 bat, a donor could not compare two prices at all. Ask an admin to add
                  anything that is genuinely missing.
                </p>
                {errors.equipmentItemId ? (
                  <p className="text-xs text-destructive">{errors.equipmentItemId}</p>
                ) : null}
              </>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="offer-marketplace">Where it is sold</Label>
                <Select
                  value={marketplace}
                  onValueChange={(v) => setMarketplace(v as Marketplace)}
                >
                  <SelectTrigger id="offer-marketplace">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MARKETPLACES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {MARKETPLACE_LABEL[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="offer-price">Price in rupees</Label>
                <Input
                  id="offer-price"
                  value={rupees}
                  onChange={(e) => setRupees(e.target.value)}
                  placeholder="1800"
                  inputMode="decimal"
                  data-numeric
                />
                {errors.pricePaise ? (
                  <p className="text-xs text-destructive">{errors.pricePaise}</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="offer-url">Link to buy it</Label>
              <Input
                id="offer-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.amazon.in/dp/…"
                inputMode="url"
              />
              <p className="text-xs text-muted-foreground">
                The donor buys from this link themselves. khelkhud never handles the money or
                the goods, so a dead link is the one failure nobody else can catch for you.
              </p>
              {errors.url ? <p className="text-xs text-destructive">{errors.url}</p> : null}
            </div>

            {over && item ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                <span className="font-medium text-marigold">
                  Above the indicative price of{" "}
                  <span data-numeric>{formatPaise(item.indicativePaise)}</span>.
                </span>{" "}
                Donors will see it marked as such and ranked below cheaper links. You can
                still list it — the indicative price is a guard, not a rule, and there are
                real reasons to be above it (genuine willow, delivery included, a price an
                admin set too low).
              </p>
            ) : null}

            {errors.form ? <p className="text-sm text-destructive">{errors.form}</p> : null}

            <div>
              <Button onClick={() => void submit()} disabled={busy}>
                {busy ? "Adding…" : "Add offer"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── The catalogue ────────────────────────────────────────────────────────── */

function OfferRow({
  offer,
  canPublish,
  busy,
  onRecheck,
  onEdit,
  onToggleActive,
}: {
  offer: SupplierOffer;
  canPublish: boolean;
  busy: boolean;
  onRecheck: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
}) {
  const over = isOverpriced(offer.pricePaise, offer.equipmentItem.indicativePaise);
  const checked = checkedLabel(offer.checkedAt);

  return (
    <Card className={offer.isActive ? undefined : "opacity-75"}>
      <CardContent className="grid gap-3 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{offer.equipmentItem.name}</span>
              <Badge variant="outline">{MARKETPLACE_LABEL[offer.marketplace]}</Badge>
              {!offer.isActive ? <Badge variant="outline">Retired</Badge> : null}
              {offer.isActive && !canPublish ? (
                <Badge variant="outline" className="text-marigold">
                  Hidden from donors
                </Badge>
              ) : null}
            </div>
            <a
              href={offer.url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 block truncate text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {offer.url}
            </a>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lg font-semibold" data-numeric>
              {formatPaise(offer.pricePaise)}
            </p>
            <p className="text-xs text-muted-foreground">
              indicative{" "}
              <span data-numeric>{formatPaise(offer.equipmentItem.indicativePaise)}</span>
            </p>
          </div>
        </div>

        {over ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-marigold">Above the indicative price.</span>{" "}
            Sponsors see this flagged and ranked below cheaper links for the same item. That
            is all it does — it is not hidden, and if your price is right for what you are
            selling, leaving it is a reasonable choice.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={`text-xs ${checked.stale ? "text-marigold" : "text-muted-foreground"}`}>
            {checked.text}
            {checked.stale ? " — donors see that age next to your price." : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onRecheck} disabled={busy}>
              Still accurate
            </Button>
            <Button size="sm" variant="outline" onClick={onEdit} disabled={busy}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={onToggleActive} disabled={busy}>
              {offer.isActive ? "Retire" : "Restore"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── The whole surface ────────────────────────────────────────────────────── */

export function SupplierManager({
  profile,
  viewerRole,
}: {
  profile: SupplierMe | null;
  viewerRole: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<SupplierOffer | null>(null);
  const [editForm, setEditForm] = useState({ rupees: "", url: "" });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  async function patchOffer(offer: SupplierOffer, body: Record<string, unknown>, done: string) {
    setBusy(true);
    try {
      await apiClient(`/api/suppliers/me/offers/${offer.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      toast.success(done);
      setEditing(null);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update the offer";
      if (editing) setEditErrors({ form: message });
      else toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  if (!profile) {
    // An admin has no SupplierProfile and must not be handed a registration form: /register
    // refuses a user who already holds a role, so the form could only ever 409 at them.
    if (viewerRole === "ADMIN") {
      return (
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold">No supplier account here</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              You are signed in as an admin, and this page only ever shows the signed-in
              account&rsquo;s own catalogue. Approvals and supplier details live under{" "}
              <span className="font-medium">Admin &rarr; Suppliers</span>.
            </p>
          </CardContent>
        </Card>
      );
    }
    return <RegisterForm />;
  }

  const offers = profile.offers;
  const live = offers.filter((o) => o.isActive).length;
  const overpriced = offers.filter(
    (o) => o.isActive && isOverpriced(o.pricePaise, o.equipmentItem.indicativePaise),
  ).length;

  return (
    <div className="grid gap-6">
      <ApprovalState profile={profile} />
      <AddOffer canPublish={profile.canPublish && profile.isActive} />

      <section className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Your catalogue</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <span data-numeric>{live}</span> live, <span data-numeric>{offers.length}</span>{" "}
              in total
              {overpriced > 0 ? (
                <>
                  {" · "}
                  <span data-numeric>{overpriced}</span> above the indicative price
                </>
              ) : null}
            </p>
          </div>
        </div>

        {offers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
            No offers yet.
          </div>
        ) : (
          <div className="grid gap-4">
            {offers.map((offer) => (
              <OfferRow
                key={offer.id}
                offer={offer}
                canPublish={profile.canPublish && profile.isActive}
                busy={busy}
                onRecheck={() =>
                  void patchOffer(
                    offer,
                    // `checked` alone, deliberately: it restates "someone looked at this
                    // link and this price today" without touching the price. Editing only
                    // the URL would not do this, so a stale price cannot be laundered into
                    // a fresh-looking one.
                    { checked: true },
                    "Marked as checked today",
                  )
                }
                onEdit={() => {
                  setEditing(offer);
                  setEditForm({
                    rupees: String(offer.pricePaise / 100),
                    url: offer.url,
                  });
                  setEditErrors({});
                }}
                onToggleActive={() =>
                  void patchOffer(
                    offer,
                    { isActive: !offer.isActive },
                    offer.isActive
                      ? "Retired. Nothing was deleted — restore it whenever the link works again."
                      : "Back in your live catalogue",
                  )
                }
              />
            ))}
          </div>
        )}

        <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
          Prices and links rot, and we do not go and check them for you — scraping
          marketplaces is brittle and adversarial. So donors are shown how long ago you last
          confirmed each one. &ldquo;Still accurate&rdquo; is how you say &ldquo;I looked
          today, this is right&rdquo; without changing anything.
        </p>
      </section>

      {/* ── Edit an offer ───────────────────────────────────────────────────── */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.equipmentItem.name}</DialogTitle>
            <DialogDescription>
              Changing the price also marks it checked today — you cannot restate a price
              without having just looked at it.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-price">Price in rupees</Label>
              <Input
                id="edit-price"
                value={editForm.rupees}
                onChange={(e) => setEditForm((f) => ({ ...f, rupees: e.target.value }))}
                inputMode="decimal"
                data-numeric
              />
              {editing ? (
                <p className="text-xs text-muted-foreground">
                  Indicative price for this item:{" "}
                  <span data-numeric>
                    {formatPaise(editing.equipmentItem.indicativePaise)}
                  </span>
                  .
                </p>
              ) : null}
              {editErrors.pricePaise ? (
                <p className="text-xs text-destructive">{editErrors.pricePaise}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-url">Link to buy it</Label>
              <Input
                id="edit-url"
                value={editForm.url}
                onChange={(e) => setEditForm((f) => ({ ...f, url: e.target.value }))}
                inputMode="url"
              />
              <p className="text-xs text-muted-foreground">
                Replacing a dead link does not change how old the price is — those are two
                different claims.
              </p>
              {editErrors.url ? (
                <p className="text-xs text-destructive">{editErrors.url}</p>
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
            <Button
              onClick={() => {
                if (!editing) return;
                const nextPaise = rupeesToPaise(Number(editForm.rupees));
                if (!Number.isFinite(nextPaise) || nextPaise <= 0) {
                  setEditErrors({ pricePaise: "Enter the price in rupees, e.g. 1800" });
                  return;
                }
                const body: Record<string, unknown> = { url: editForm.url.trim() };
                // Only send the price when it actually moved. Sending the same number back
                // would refresh checkedAt as a side effect of a URL fix, which is exactly
                // the laundering the API's rule is written to prevent.
                if (nextPaise !== editing.pricePaise) body.pricePaise = nextPaise;
                void patchOffer(editing, body, "Offer updated");
              }}
              disabled={busy}
            >
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
