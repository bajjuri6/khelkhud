import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPaise } from "@khelkhud/shared";
import { apiServer } from "@/lib/api-server";
import { BreadcrumbJsonLd } from "@/components/seo/breadcrumb-jsonld";
import { absoluteUrl } from "@/lib/seo";
import { cn } from "@/lib/utils";

type Offer = {
  id: string;
  marketplace: string;
  url: string;
  pricePaise: number;
  checkedAt: string;
  isOverpriced: boolean;
  supplier: { name: string } | null;
};

type Item = {
  id: string;
  slug: string;
  name: string;
  spec: string | null;
  category: string;
  indicativePaise: number;
  sport: { id: string; name: string } | null;
  offers: Offer[];
};

const MARKETPLACE_LABEL: Record<string, string> = {
  AMAZON: "Amazon",
  FLIPKART: "Flipkart",
  MEESHO: "Meesho",
  DIRECT: "Direct from supplier",
};

async function getItem(slug: string): Promise<Item | null> {
  const res = await apiServer<{ data: Item }>(`/api/catalogue/${encodeURIComponent(slug)}`);
  return res?.data ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = await getItem(slug);
  if (!item) return { title: "Not found", robots: { index: false, follow: false } };

  const description = `${item.name} costs around ${formatPaise(item.indicativePaise)} in India. ${
    item.spec ? `${item.spec} ` : ""
  }See where to buy it, and fund one for an athlete who needs it.`;

  return {
    title: `${item.name} — what it costs`,
    description,
    alternates: { canonical: `/equipment/${item.slug}` },
    openGraph: {
      title: `${item.name} — khelkhud`,
      description,
      url: absoluteUrl(`/equipment/${item.slug}`),
    },
  };
}

/** How old a price is, in the plainest words available. */
function checkedAge(iso: string): { label: string; stale: boolean } {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return { label: "checked today", stale: false };
  if (days === 1) return { label: "checked yesterday", stale: false };
  if (days < 90) return { label: `checked ${days} days ago`, stale: false };
  const months = Math.round(days / 30);
  return { label: `checked about ${months} months ago`, stale: true };
}

export default async function EquipmentItemPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = await getItem(slug);
  if (!item) notFound();

  const offers = item.offers ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-14">
      <BreadcrumbJsonLd
        items={[
          { name: "khelkhud", path: "/" },
          { name: "Equipment", path: "/equipment" },
          { name: item.name, path: `/equipment/${item.slug}` },
        ]}
      />

      <Link href="/equipment" className="text-sm text-slate hover:underline">
        &larr; All equipment
      </Link>

      <h1 className="mt-5 font-display text-h1 font-semibold">{item.name}</h1>
      {item.spec ? <p className="mt-3 leading-relaxed text-slate">{item.spec}</p> : null}

      <div className="mt-8 rounded-xl border border-ink/12 bg-cream-2/50 p-6">
        <p className="eyebrow text-marigold">Typical price</p>
        <p className="mt-2 font-display text-h2 font-semibold" data-numeric>
          {formatPaise(item.indicativePaise)}
        </p>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate">
          What this should cost in India. It is a guide, not a quote — khelkhud does not sell
          it and takes no cut. If somewhere is charging a lot more than this, that is worth
          knowing before you pay.
        </p>
      </div>

      <h2 className="mt-12 font-display text-h3 font-semibold">Where to buy it</h2>
      {offers.length === 0 ? (
        <p className="mt-3 leading-relaxed text-slate">
          No links yet for this one. The typical price above still applies — any reputable
          sports retailer will have it.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm leading-relaxed text-slate">
            Links go straight to the seller. khelkhud is not part of the purchase and earns
            nothing from it.
          </p>
          <ul className="mt-5 space-y-3">
            {offers.map((offer) => {
              const age = checkedAge(offer.checkedAt);
              return (
                <li
                  key={offer.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-ink/12 p-5"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {MARKETPLACE_LABEL[offer.marketplace] ?? offer.marketplace}
                      {offer.supplier ? (
                        <span className="text-slate"> · {offer.supplier.name}</span>
                      ) : null}
                    </p>
                    <p className={cn("mt-1 text-xs", age.stale ? "text-sweat" : "text-slate")}>
                      {age.label}
                      {age.stale ? " — it may have moved" : ""}
                    </p>
                    {/* Shown, never hidden. Suppressing an expensive listing would be a
                        silent judgement on a number an admin may simply have set wrong. */}
                    {offer.isOverpriced ? (
                      <p className="mt-1 text-xs font-medium text-marigold">
                        Above the typical price
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <span className="font-display text-lg font-semibold" data-numeric>
                      {formatPaise(offer.pricePaise)}
                    </span>
                    <a
                      href={offer.url}
                      target="_blank"
                      // noopener for the obvious reason; nofollow because these are
                      // commercial outbound links we do not vouch for and did not vet.
                      rel="noopener noreferrer nofollow"
                      className="rounded-full border border-ink/20 px-4 py-1.5 text-sm font-medium transition-colors hover:border-ink/45"
                    >
                      Open
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="mt-14 rounded-xl border border-ink/12 bg-cream-2/40 p-6">
        <h2 className="font-display text-h3 font-semibold">
          Someone is asking for this right now
        </h2>
        <p className="mt-3 max-w-xl leading-relaxed text-slate">
          Athletes and village schools across Telangana raise requests for exactly these
          items. You buy it, it ships to their village coordinator, and they confirm it
          arrived with a photograph.
        </p>
        <Link
          href="/athletes"
          className="mt-5 inline-block rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-cream transition-opacity hover:opacity-90"
        >
          See who needs equipment
        </Link>
      </div>
    </div>
  );
}
