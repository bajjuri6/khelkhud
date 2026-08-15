"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatPaise } from "@khelkhud/shared";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_URL } from "@/lib/api";

/**
 * Picking a thing out of the catalogue.
 *
 * The catalogue exists so a coordinator in Ammapur and a donor in New Jersey mean the same
 * object, and so the donor has a number to judge a price against. Picking from it is how
 * a request inherits both.
 *
 * It deliberately does NOT force a choice. An equipment request for something genuinely
 * not catalogued must stay raisable — blocking it would mean a coordinator waits on an
 * admin to add a row before a child can ask for a pair of shoes. So the free-text escape
 * is a first-class path, not a fallback buried behind an error.
 */

export type CatalogueItem = {
  id: string;
  slug: string;
  name: string;
  spec: string | null;
  category: string;
  indicativePaise: number;
  sport: { id: string; name: string } | null;
  offerCount?: number;
};

export function EquipmentPicker({
  onPick,
  onFreeText,
  autoFocus,
  label = "Find it in the catalogue",
}: {
  onPick: (item: CatalogueItem) => void;
  /** Chosen when nothing matches. The caller gets a plain label and asks for a price. */
  onFreeText?: (label: string) => void;
  autoFocus?: boolean;
  label?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CatalogueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  // Same guard as the village picker: a slow response for "bat" must not overwrite results
  // for "batting pads" typed after it.
  const seq = useRef(0);

  const search = useCallback(async (term: string) => {
    if (term.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    const mine = ++seq.current;
    setLoading(true);
    try {
      const url = new URL(`${API_URL}/api/catalogue`, window.location.origin);
      url.searchParams.set("q", term.trim());
      url.searchParams.set("pageSize", "8");
      const res = await fetch(url.toString(), { credentials: "include" });
      const json = await res.json();
      if (mine !== seq.current) return;
      setResults(res.ok ? (json.data ?? []) : []);
      setSearched(true);
    } catch {
      if (mine === seq.current) {
        setResults([]);
        setSearched(true);
      }
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void search(q), 300);
    return () => clearTimeout(t);
  }, [q, search]);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="equipment-q">{label}</Label>
        <Input
          id="equipment-q"
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cricket bat, running spikes, volleyball net…"
          className="h-11"
          autoComplete="off"
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Picking from the catalogue fills in a typical price, so a sponsor knows what the
          item should cost.
        </p>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Searching…</p> : null}

      {results.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
          {results.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onPick(item)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{item.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[item.sport?.name, item.spec].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium" data-numeric>
                  {formatPaise(item.indicativePaise)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Not an error state. Something the catalogue has never heard of is a normal thing
          for a village to need, and the ask must not wait on an admin adding a row. */}
      {!loading && searched && results.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/60 p-4">
          <p className="text-sm font-medium">Nothing in the catalogue matches.</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            That is fine — ask for it anyway and set your own estimate. A sponsor will not
            see a suggested price for it, so say clearly what is needed.
          </p>
          {onFreeText ? (
            <button
              type="button"
              onClick={() => onFreeText(q.trim())}
              className="mt-3 text-xs font-medium text-marigold hover:underline"
            >
              Ask for &ldquo;{q.trim()}&rdquo; anyway &rarr;
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
