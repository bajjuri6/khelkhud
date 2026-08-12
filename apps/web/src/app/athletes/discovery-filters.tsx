"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_LABELS, type Location, type Sport } from "@/lib/types";

const ALL = "__all__";

export function DiscoveryFilters({
  sports,
  locations,
  fundingBuckets,
}: {
  sports: Sport[];
  locations: Location[];
  fundingBuckets: { value: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === null || value === "" || value === ALL) next.delete(key);
      else next.set(key, value);
      next.delete("page");
      router.push(`${pathname}?${next.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const locationId = searchParams.get("locationId") ?? "";
  const byId = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const selected = locationId ? byId.get(locationId) : undefined;
  // Resolve which state/district the current selection sits under, at any level.
  const selectedState =
    selected?.level === "STATE"
      ? selected
      : selected?.level === "DISTRICT"
        ? byId.get(selected.parentId ?? "")
        : selected?.level === "CITY"
          ? byId.get(byId.get(selected.parentId ?? "")?.parentId ?? "")
          : undefined;
  const selectedDistrict =
    selected?.level === "DISTRICT"
      ? selected
      : selected?.level === "CITY"
        ? byId.get(selected.parentId ?? "")
        : undefined;

  const states = locations.filter((l) => l.level === "STATE");
  const districts = locations.filter(
    (l) => l.level === "DISTRICT" && l.parentId === selectedState?.id,
  );
  const cities = locations.filter(
    (l) => l.level === "CITY" && l.parentId === selectedDistrict?.id,
  );

  return (
    <aside className="grid h-fit gap-4 rounded-lg border p-4">
      <div className="grid gap-2">
        <Label>Search by name</Label>
        <Input
          defaultValue={searchParams.get("q") ?? ""}
          placeholder="Athlete name"
          onKeyDown={(e) => {
            if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value);
          }}
        />
      </div>

      <div className="grid gap-2">
        <Label>Sport</Label>
        <Select
          value={searchParams.get("sportId") ?? ALL}
          onValueChange={(v) => setParam("sportId", v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="All sports" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All sports</SelectItem>
            {sports.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label>State</Label>
        <Select
          value={selectedState?.id ?? ALL}
          onValueChange={(v) => setParam("locationId", v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="All states" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All states</SelectItem>
            {states.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedState ? (
        <div className="grid gap-2">
          <Label>District</Label>
          <Select
            value={selectedDistrict?.id ?? ALL}
            onValueChange={(v) => setParam("locationId", v === ALL ? selectedState.id : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All districts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All districts</SelectItem>
              {districts.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {selectedDistrict ? (
        <div className="grid gap-2">
          <Label>City</Label>
          <Select
            value={selected?.level === "CITY" ? selected.id : ALL}
            onValueChange={(v) => setParam("locationId", v === ALL ? selectedDistrict.id : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All cities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All cities</SelectItem>
              {cities.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="grid gap-2">
        <Label>Category</Label>
        <Select
          value={searchParams.get("category") ?? ALL}
          onValueChange={(v) => setParam("category", v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label>Funding requirement</Label>
        <Select
          value={searchParams.get("funding") ?? ALL}
          onValueChange={(v) => setParam("funding", v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Any amount" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any amount</SelectItem>
            {fundingBuckets.map((b) => (
              <SelectItem key={b.value} value={b.value}>
                {b.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={searchParams.get("includeUnverified") === "true"}
          onChange={(e) => setParam("includeUnverified", e.target.checked ? "true" : null)}
        />
        Include unverified athletes
      </label>

      {searchParams.size > 0 ? (
        <Button variant="ghost" size="sm" onClick={() => router.push(pathname)}>
          Clear filters
        </Button>
      ) : null}
    </aside>
  );
}
