import { absoluteUrl } from "@/lib/seo";
import { JsonLd } from "./json-ld";

export type Crumb = { name: string; path: string };

/**
 * BreadcrumbList JSON-LD — the trail shown under a search snippet, and the thing that
 * tells an answer engine where a page sits in the site rather than treating it as an
 * orphan.
 *
 * Takes paths and makes them absolute here: schema.org requires absolute URLs, and every
 * previous version of this on other projects had at least one relative one that silently
 * invalidated the block.
 */
export function BreadcrumbJsonLd({ items }: { items: readonly Crumb[] }) {
  return (
    <JsonLd
      schema={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((item, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: item.name,
          item: absoluteUrl(item.path),
        })),
      }}
    />
  );
}
