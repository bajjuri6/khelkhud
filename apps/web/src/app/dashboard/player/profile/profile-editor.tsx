"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api";
import { profilePhotoUrl, uploadFile } from "@/lib/upload";
import {
  CATEGORY_LABELS,
  LEVEL_LABELS,
  type Location,
  type PlayerProfileMe,
  type Sport,
} from "@/lib/types";
import { AchievementsTab } from "./achievements-tab";
import { EventsTab } from "./events-tab";

export function ProfileEditor({
  profile,
  sports,
  locations,
}: {
  profile: PlayerProfileMe;
  sports: Sport[];
  locations: Location[];
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [photoKey, setPhotoKey] = useState(profile.photoKey);

  // Reconstruct the state -> district -> city chain from the flat location list.
  const byId = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const initialCity = profile.locationId ? byId.get(profile.locationId) : undefined;
  const initialDistrict = initialCity?.parentId ? byId.get(initialCity.parentId) : undefined;
  const initialState = initialDistrict?.parentId ? byId.get(initialDistrict.parentId) : undefined;

  const [stateId, setStateId] = useState(initialState?.id ?? "");
  const [districtId, setDistrictId] = useState(initialDistrict?.id ?? "");
  const [cityId, setCityId] = useState(initialCity?.id ?? "");

  const [form, setForm] = useState({
    sportId: profile.sportId ?? "",
    dateOfBirth: profile.dateOfBirth ? profile.dateOfBirth.slice(0, 10) : "",
    category: profile.category ?? "",
    experienceLevel: profile.experienceLevel ?? "",
    bio: profile.bio ?? "",
    coachName: profile.coachName ?? "",
    coachContact: profile.coachContact ?? "",
    academyName: profile.academyName ?? "",
  });

  const states = locations.filter((l) => l.level === "STATE");
  const districts = locations.filter((l) => l.level === "DISTRICT" && l.parentId === stateId);
  const cities = locations.filter((l) => l.level === "CITY" && l.parentId === districtId);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onPhotoPicked(file: File | undefined) {
    if (!file) return;
    try {
      const doc = await uploadFile(file, "PROFILE_PHOTO", { playerProfileId: profile.id });
      setPhotoKey(doc.storageKey);
      await apiClient("/api/players/me", {
        method: "PUT",
        body: JSON.stringify({ photoKey: doc.storageKey }),
      });
      toast.success("Photo updated");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Photo upload failed");
    }
  }

  async function save() {
    setSaving(true);
    try {
      await apiClient("/api/players/me", {
        method: "PUT",
        body: JSON.stringify({
          sportId: form.sportId || null,
          locationId: cityId || null,
          dateOfBirth: form.dateOfBirth ? new Date(form.dateOfBirth).toISOString() : null,
          category: form.category || null,
          experienceLevel: form.experienceLevel || null,
          bio: form.bio || null,
          coachName: form.coachName || null,
          coachContact: form.coachContact || null,
          academyName: form.academyName || null,
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

  const photoUrl = profilePhotoUrl(photoKey) ?? profile.user.avatarUrl;

  return (
    <Tabs defaultValue="basics" className="mt-6">
      <TabsList>
        <TabsTrigger value="basics">Basics</TabsTrigger>
        <TabsTrigger value="achievements">Achievements</TabsTrigger>
        <TabsTrigger value="events">Events</TabsTrigger>
      </TabsList>

      <TabsContent value="basics">
        <Card>
          <CardContent className="grid gap-6 pt-6">
            <div className="flex items-center gap-4">
              <Avatar className="size-20">
                {photoUrl ? <AvatarImage src={photoUrl} alt="" /> : null}
                <AvatarFallback>{profile.user.name[0]}</AvatarFallback>
              </Avatar>
              <div>
                <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                  Upload photo
                </Button>
                <p className="mt-1 text-xs text-muted-foreground">JPG, PNG or WebP, max 5MB</p>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => void onPhotoPicked(e.target.files?.[0])}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Sport</Label>
                <Select value={form.sportId} onValueChange={(v) => set("sportId", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select sport" />
                  </SelectTrigger>
                  <SelectContent>
                    {sports.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Date of birth</Label>
                <Input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => set("dateOfBirth", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => set("category", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Experience level</Label>
                <Select
                  value={form.experienceLevel}
                  onValueChange={(v) => set("experienceLevel", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(LEVEL_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
              <Label>Bio / sporting journey</Label>
              <Textarea
                rows={4}
                placeholder="Tell sponsors about your journey, goals and dedication…"
                value={form.bio}
                onChange={(e) => set("bio", e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label>Coach name</Label>
                <Input value={form.coachName} onChange={(e) => set("coachName", e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Coach contact (private)</Label>
                <Input
                  value={form.coachContact}
                  onChange={(e) => set("coachContact", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Academy</Label>
                <Input
                  value={form.academyName}
                  onChange={(e) => set("academyName", e.target.value)}
                />
              </div>
            </div>

            <div>
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? "Saving…" : "Save profile"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="achievements">
        <AchievementsTab achievements={profile.achievements} />
      </TabsContent>

      <TabsContent value="events">
        <EventsTab events={profile.events} />
      </TabsContent>
    </Tabs>
  );
}
