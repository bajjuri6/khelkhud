import type { Metadata } from "next";
import { EQUIPMENT_CATEGORIES } from "@khelkhud/shared";
import { Card, CardContent } from "@/components/ui/card";
import { apiServer } from "@/lib/api-server";
import type { Sport } from "@/lib/types";
import { CatalogueManager, type EquipmentItem } from "./catalogue-manager";
import { ImportPanel } from "./import-panel";

export const metadata: Metadata = { title: "Catalogue" };

type CataloguePage = {
  data: EquipmentItem[];
  meta: { page: number; pageSize: number; total: number };
};

/** `catalogueQuerySchema` caps pageSize at 50, so a full catalogue needs several calls. */
const PAGE_SIZE = 50;
/**
 * At pilot volume the catalogue is tens of rows, and the stats below are only honest if
 * they are computed over all of them. The cap stops a future thousand-row catalogue from
 * turning one page render into twenty API calls; when it bites, the page says so rather
 * than quietly reporting a partial count as the total.
 */
const MAX_PAGES = 8;

async function loadCatalogue() {
  const first = await apiServer<CataloguePage>(`/api/admin/catalogue?pageSize=${PAGE_SIZE}`);
  if (!first) return null;

  const items = [...first.data];
  const total = first.meta.total;
  for (let page = 2; items.length < total && page <= MAX_PAGES; page++) {
    const next = await apiServer<CataloguePage>(
      `/api/admin/catalogue?pageSize=${PAGE_SIZE}&page=${page}`,
    );
    if (!next || next.data.length === 0) break;
    items.push(...next.data);
  }

  return { items, total, partial: items.length < total };
}

export default async function AdminCataloguePage() {
  const [catalogue, sportsRes] = await Promise.all([
    loadCatalogue(),
    apiServer<{ data: Sport[] }>("/api/meta/sports"),
  ]);

  if (!catalogue) {
    return <p className="text-muted-foreground">Could not load the catalogue.</p>;
  }

  const { items, total, partial } = catalogue;
  // An entry nobody can act on is the failure mode worth surfacing: the donor reads a
  // precise name, agrees to buy it, and then has nowhere to go. It is worse than an
  // absent row, because an absent row does not promise anything.
  const unbuyable = items.filter((i) => (i._count?.offers ?? 0) === 0).length;
  const categories = new Set(items.map((i) => i.category)).size;

  const tiles: { label: string; value: string; note?: string; alarming?: boolean }[] = [
    { label: "Items in the catalogue", value: String(total) },
    {
      label: "Nothing to buy",
      value: String(unbuyable),
      note: "Named, priced, and with no link a donor can follow.",
      alarming: unbuyable > 0,
    },
    {
      label: "Categories covered",
      value: `${categories} of ${EQUIPMENT_CATEGORIES.length}`,
    },
  ];

  return (
    <div className="grid gap-6">
      <div>
        <p className="eyebrow text-muted-foreground">Shared vocabulary</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Equipment catalogue</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          khelkhud never holds the money or the goods — a donor in New Jersey reads a line
          from this catalogue and buys the thing themselves. That only works if each entry
          names an object precisely enough to actually buy: &ldquo;bat&rdquo; is unbuyable,
          &ldquo;cricket bat, English willow, size 6, short handle&rdquo; is. A coordinator
          in Ammapur and that donor have to be able to mean the same object.
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          The indicative price is the donor&rsquo;s only defence against overpaying. It is
          what tells them ₹18,000 for that bat is wrong. We can prove an item was
          delivered; we cannot prove it was bought at a fair price, so the number set here
          is the whole guard — and it is admin-owned for exactly that reason. A supplier
          never sets it.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{t.label}</p>
              <p
                className={`mt-1 text-2xl font-bold ${t.alarming ? "text-destructive" : ""}`}
                data-numeric
              >
                {t.value}
              </p>
              {t.note ? (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.note}</p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      {partial ? (
        <p className="text-xs text-muted-foreground">
          Showing the first <span data-numeric>{items.length}</span> of{" "}
          <span data-numeric>{total}</span> items. The counts above cover only what is
          loaded here.
        </p>
      ) : null}

      <ImportPanel />

      <CatalogueManager items={items} sports={sportsRes?.data ?? []} />
    </div>
  );
}
