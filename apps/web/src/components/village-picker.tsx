"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_URL } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Village picker: PIN narrows, fuzzy name ranks, the person confirms.
 *
 * It NEVER auto-selects, even on a single exact match. "Venkatapur" is four different
 * villages in the pilot districts alone, and a silently-chosen wrong one scatters a
 * village's diaspora across duplicate records — the one failure the whole location model
 * exists to prevent. A confirmation click is cheap; an unnoticed mismatch is not.
 */

export type Village = {
  id: string;
  name: string;
  displayPath: string | null;
  pincode: string | null;
  level: string;
  source: string;
  isVerified: boolean;
  score: number;
};

export function VillagePicker({
  value,
  onChange,
  label = "Village",
  autoFocus,
}: {
  value: Village | null;
  onChange: (v: Village | null) => void;
  label?: string;
  autoFocus?: boolean;
}) {
  const [name, setName] = useState("");
  const [pincode, setPincode] = useState("");
  const [results, setResults] = useState<Village[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  // Guards against out-of-order responses: a slow request for "Chik" must not overwrite
  // results for "Chikkode" typed after it.
  const seq = useRef(0);

  const search = useCallback(async (q: string, pin: string) => {
    const validPin = /^\d{6}$/.test(pin);
    if (q.trim().length < 2 && !validPin) {
      setResults([]);
      setSearched(false);
      return;
    }
    const mine = ++seq.current;
    setLoading(true);
    try {
      const url = new URL(`${API_URL}/api/meta/villages/search`, window.location.origin);
      if (q.trim()) url.searchParams.set("q", q.trim());
      if (validPin) url.searchParams.set("pincode", pin);
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

  // Debounced: villages are typed a character at a time and each keystroke is a trigram
  // scan. 300ms is below the threshold where typing feels laggy.
  useEffect(() => {
    if (value) return;
    const t = setTimeout(() => void search(name, pincode), 300);
    return () => clearTimeout(t);
  }, [name, pincode, value, search]);

  if (value) {
    return (
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-cream-2 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium">{value.name}</p>
            <p className="truncate text-xs text-slate">{value.displayPath}</p>
            {value.pincode ? (
              <p className="mt-0.5 text-xs text-sweat" data-numeric>
                PIN {value.pincode}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setResults([]);
              setSearched(false);
            }}
            className="shrink-0 text-xs font-medium text-marigold hover:underline"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <div className="space-y-1.5">
          <Label htmlFor="village-name">{label}</Label>
          <Input
            id="village-name"
            value={name}
            autoFocus={autoFocus}
            onChange={(e) => setName(e.target.value)}
            placeholder="Start typing the village name"
            className="h-11"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="village-pin">PIN code</Label>
          <Input
            id="village-pin"
            value={pincode}
            onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="502321"
            inputMode="numeric"
            className="h-11"
            data-numeric
            autoComplete="postal-code"
          />
        </div>
      </div>

      <p className="text-xs leading-relaxed text-sweat">
        The PIN code matters: several villages share a name. Adding it usually narrows the
        list to one.
      </p>

      {loading ? <p className="text-sm text-slate">Searching…</p> : null}

      {!loading && searched && results.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-cream-2/60 p-4 text-sm">
          <p className="font-medium">No village matched.</p>
          <p className="mt-1 text-slate">
            Check the spelling, or try the PIN code on its own to see everything it covers.
            If it is genuinely missing, a coordinator or admin can add it.
          </p>
        </div>
      ) : null}

      {results.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
          {results.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => onChange(v)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-cream-2"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{v.name}</span>
                  <span className="block truncate text-xs text-slate">{v.displayPath}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {v.pincode ? (
                    <span className="text-xs text-sweat" data-numeric>
                      {v.pincode}
                    </span>
                  ) : null}
                  {/* An unreconciled row is usable but flagged, so nobody assumes it is
                      canonical just because it appeared in the list. */}
                  {!v.isVerified ? (
                    <span
                      title="Not yet reconciled against the government directory"
                      className="rounded-full bg-sweat/12 px-2 py-0.5 text-[0.625rem] text-slate"
                    >
                      unverified
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "text-[0.625rem] tabular-nums",
                      v.score >= 0.9 ? "text-ground" : "text-sweat",
                    )}
                  >
                    {Math.round(v.score * 100)}%
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
