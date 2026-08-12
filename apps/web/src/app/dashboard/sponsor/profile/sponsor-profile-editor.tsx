"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api";
import type { Location, Sport } from "@/lib/types";

export type SponsorProfileData = {
  id: string;
  sponsorType: "INDIVIDUAL" | "COMPANY" | "ORGANIZATION";
  displayName: string | null;
  orgName: string | null;
  locationId: string | null;
  bio: string | null;
  isAnonymousByDefault: boolean;
  verificationStatus: string;
  user: { name: string; email: string; avatarUrl: string | null };
  preferredSports: { id: string; name: string }[];
};

const TYPE_LABELS = {
  INDIVIDUAL: "Individual",
  COMPANY: "Company",
  ORGANIZATION: "Organization",
} as const;

export function SponsorProfileEditor({
  profile,
  sports,
  locations,
}: {
  profile: SponsorProfileData;
  sports: Sport[];
  locations: Location[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const byId = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const initialCity = profile.locationId ? byId.get(profile.locationId) : undefined;
  const initialDistrict = initialCity?.parentId ? byId.get(initialCity.parentId) : undefined;
  const initialState = initialDistrict?.parentId ? byId.get(initialDistrict.parentId) : undefined;

  const [stateId, setStateId] = useState(initialState?.id ?? "");
  const [districtId, setDistrictId] = useState(initialDistrict?.id ?? "");
  const [cityId, setCityId] = useState(initialCity?.id ?? "");

  const [form, setForm] = useState({
    sponsorType: profile.sponsorType,
    displayName: profile.displayName ?? profile.user.name,
    orgName: profile.orgName ?? "",
    bio: profile.bio ?? "",
    isAnonymousByDefault: profile.isAnonymousByDefault,
  });
  const [preferredIds, setPreferredIds] = useState<Set<string>>(
    new Set(profile.preferredSports.map((s) => s.id)),
  );

  const states = locations.filter((l) => l.level === "STATE");
  const districts = locations.filter((l) => l.level === "DISTRICT" && l.parentId === stateId);
  const cities = locations.filter((l) => l.level === "CITY" && l.parentId === districtId);

  function togglePreferred(id: string) {
    setPreferredIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      await apiClient("/api/sponsors/me", {
        method: "PUT",
        body: JSON.stringify({
          sponsorType: form.sponsorType,
          displayName: form.displayName || null,
          orgName: form.sponsorType === "INDIVIDUAL" ? null : form.orgName || null,
          locationId: cityId || null,
          bio: form.bio || null,
          isAnonymousByDefault: form.isAnonymousByDefault,
          preferredSportIds: [...preferredIds],
        }),
      });
      toast.success("Profile saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mt-6">
      <CardContent className="grid gap-6 pt-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Sponsor type</Label>
            <Select
              value={form.sponsorType}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, sponsorType: v as SponsorProfileData["sponsorType"] }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Display name</Label>
            <Input
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            />
          </div>
          {form.sponsorType !== "INDIVIDUAL" ? (
            <div className="grid gap-2 sm:col-span-2">
              <Label>{form.sponsorType === "COMPANY" ? "Company" : "Organization"} name</Label>
              <Input
                value={form.orgName}
                onChange={(e) => setForm((f) => ({ ...f, orgName: e.target.value }))}
              />
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label>State</Label>
            <Select
              value={stateId}
              onValueChange={(v) => {
                setStateId(v);
                setDistrictId("");
                setCityId("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="State" />
              </SelectTrigger>
              <SelectContent>
                {states.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>District</Label>
            <Select
              value={districtId}
              onValueChange={(v) => {
                setDistrictId(v);
                setCityId("");
              }}
              disabled={!stateId}
            >
              <SelectTrigger>
                <SelectValue placeholder="District" />
              </SelectTrigger>
              <SelectContent>
                {districts.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>City</Label>
            <Select value={cityId} onValueChange={setCityId} disabled={!districtId}>
              <SelectTrigger>
                <SelectValue placeholder="City" />
              </SelectTrigger>
              <SelectContent>
                {cities.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-2">
          <Label>About you / your organization</Label>
          <Textarea
            rows={3}
            value={form.bio}
            onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
          />
        </div>

        <div className="grid gap-2">
          <Label>Preferred sports</Label>
          <div className="flex flex-wrap gap-2">
            {sports.map((s) => {
              const active = preferredIds.has(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => togglePreferred(s.id)}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={form.isAnonymousByDefault}
            onChange={(e) => setForm((f) => ({ ...f, isAnonymousByDefault: e.target.checked }))}
          />
          Keep my sponsorships anonymous by default
        </label>

        <div>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
