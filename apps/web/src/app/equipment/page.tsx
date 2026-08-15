import type { Metadata } from "next";
import Link from "next/link";
import { EQUIPMENT_CATEGORIES, formatPaise } from "@khelkhud/shared";
import { apiServer } from "@/lib/api-server";
import { BreadcrumbJsonLd } from "@/components/seo/breadcrumb-jsonld";
import { JsonLd } from "@/components/seo/json-ld";
import { SITE_URL, absoluteUrl } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "What kit costs — the equipment catalogue",
  description:
    "What sports equipment actually costs in India, item by item: bats, spikes, mats, nets and kit. khelkhud publishes an indicative price for every item so a sponsor funding a village team knows what they should expect to pay.",
  alternates: { canonical: "/equipment" },
  openGraph: {
    title: "What kit costs — khelkhud equipment catalogue",
    description:
      "Indicative Indian prices for the equipment village athletes ask for, so nobody overpays.",
    url: absoluteUrl("/equipment"),
  },
};

type Item = {
  id: string;
  slug: string;
  name: string;
  spec: string | null;
  category: string;
  indicativePaise: number;
  sport: { id: string; name: string } | null;
  offerCount?: number;
};

const CATEGORY_LABEL: Record<string, string> = {
  BAT: "Bats",
  BALL: "Balls",
  SHOE: "Footwear",
  KIT: "Kit",
  PROTECTIVE: "Protective",
  MAT: "Mats",
  NET: "Nets",
  APPAREL: "Apparel",
  TRAINING: "Training",
  OTHER: "Other",
};

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const { category, q } = await searchParams;

  const params = new URLSearchParams({ pageSize: "50" });
  if (category && (EQUIPMENT_CATEGORIES as readonly string[]).includes(category)) {
    params.set("category", category);
  }
  if (q) params.set("q", q);

  const res = await apiServer<{ data: Item[]; meta: { total: number } }>(
    `/api/catalogue?${params}`,
  );
  const items = res?.data ?? [];
  const total = res?.meta?.total ?? 0;

  // Categories that actually have something in them. Offering a filter that returns an
  // empty page is a worse experience than a shorter list of filters.
  const present = new Set(items.map((i) => i.category));

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-14">
      <BreadcrumbJsonLd
        items={[
          { name: "khelkhud", path: "/" },
          { name: "Equipment", path: "/equipment" },
        ]}
      />
      {/*
        ItemList of names only — deliberately no Product or Offer markup.

        We are not the merchant, and our prices are indicative and go stale by design (see
        checkedAt). Emitting price structured data would push figures we have explicitly
        refused to guarantee into search results, where they would be read as current and
        authoritative. The honest AEO play is clear on-page content, not merchant markup we
        cannot stand behind.
      */}
      <JsonLd
        schema={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          "@id": `${SITE_URL}/equipment#catalogue`,
          name: "Sports equipment village athletes ask for",
          numberOfItems: items.length,
          itemListElement: items.slice(0, 50).map((item, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: item.name,
            url: absoluteUrl(`/equipment/${item.slug}`),
          })),
        }}
      />

      <p className="eyebrow text-marigold">The catalogue</p>
      <h1 className="mt-3 max-w-3xl font-display text-h1 font-semibold">
        What does a cricket bat actually cost?
      </h1>
      <div className="mt-5 max-w-2xl space-y-4 leading-relaxed text-slate">
        <p>
          When someone in a village asks for equipment, they ask for a specific thing. This
          is the list of those things, with what each one should cost in India today.
        </p>
        <p>
          khelkhud never holds the money or the goods — a sponsor buys the item themselves
          and it ships to the village. So the price here is the thing that protects them:
          it is what tells you a quote is wrong before you pay it.
        </p>
      </div>

      <div className="mt-10 flex flex-wrap gap-2">
        <Link
          href="/equipment"
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
            !category
              ? "border-ink bg-ink text-cream"
              : "border-ink/15 text-slate hover:border-ink/35",
          )}
        >
          Everything
        </Link>
        {EQUIPMENT_CATEGORIES.filter((c) => present.has(c) || c === category).map((c) => (
          <Link
            key={c}
            href={`/equipment?category=${c}`}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              category === c
                ? "border-ink bg-ink text-cream"
                : "border-ink/15 text-slate hover:border-ink/35",
            )}
          >
            {CATEGORY_LABEL[c] ?? c}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-ink/15 bg-cream-2/60 p-12 text-center">
          <p className="font-display text-h3">Nothing here yet.</p>
          <p className="mt-2 text-sm text-slate">
            {category ? "Try another category." : "The catalogue is still being built."}
          </p>
        </div>
      ) : (
        <>
          <p className="mt-10 text-sm text-slate">
            {total} item{total === 1 ? "" : "s"}
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/equipment/${item.slug}`}
                  className="flex h-full items-start justify-between gap-4 rounded-xl border border-ink/12 bg-cream-2/40 p-5 transition-colors hover:border-ink/30"
                >
                  <span className="min-w-0">
                    <span className="block font-medium">{item.name}</span>
                    {item.spec ? (
                      <span className="mt-1 block text-sm leading-relaxed text-slate">
                        {item.spec}
                      </span>
                    ) : null}
                    <span className="mt-2 block text-xs text-sweat">
                      {[item.sport?.name, CATEGORY_LABEL[item.category] ?? item.category]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-display text-lg font-semibold" data-numeric>
                      {formatPaise(item.indicativePaise)}
                    </span>
                    <span className="block text-xs text-sweat">typical</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
