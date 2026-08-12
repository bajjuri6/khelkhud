"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/lib/api";
import type { Location, Sport } from "@/lib/types";

export function SettingsManager({
  sports,
  locations,
}: {
  sports: Sport[];
  locations: Location[];
}) {
  const router = useRouter();
  const [newSport, setNewSport] = useState("");
  const [locForm, setLocForm] = useState({ name: "", level: "STATE", parentId: "" });
  const [busy, setBusy] = useState(false);

  const states = locations.filter((l) => l.level === "STATE");
  const districts = locations.filter((l) => l.level === "DISTRICT");
  const parentOptions =
    locForm.level === "DISTRICT" ? states : locForm.level === "CITY" ? districts : [];

  async function addSport() {
    if (!newSport.trim()) return;
    setBusy(true);
    try {
      await apiClient("/api/admin/sports", {
        method: "POST",
        body: JSON.stringify({ name: newSport.trim() }),
      });
      setNewSport("");
      toast.success("Sport added");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add sport");
    } finally {
      setBusy(false);
    }
  }

  async function addLocation() {
    if (!locForm.name.trim()) return;
    if (locForm.level !== "STATE" && !locForm.parentId) {
      toast.error("Pick a parent location");
      return;
    }
    setBusy(true);
    try {
      await apiClient("/api/admin/locations", {
        method: "POST",
        body: JSON.stringify({
          name: locForm.name.trim(),
          level: locForm.level,
          parentId: locForm.parentId || null,
        }),
      });
      setLocForm((f) => ({ ...f, name: "" }));
      toast.success("Location added");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add location");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sports ({sports.length})</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            {sports.map((s) => (
              <Badge key={s.id} variant="secondary">
                {s.name}
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="New sport name"
              value={newSport}
              onChange={(e) => setNewSport(e.target.value)}
            />
            <Button onClick={() => void addSport()} disabled={busy}>
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Locations ({locations.length})</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid max-h-64 gap-1 overflow-y-auto text-sm">
            {states.map((st) => (
              <div key={st.id}>
                <p className="font-medium">{st.name}</p>
                {districts
                  .filter((d) => d.parentId === st.id)
                  .map((d) => (
                    <p key={d.id} className="pl-4 text-muted-foreground">
                      {d.name}:{" "}
                      {locations
                        .filter((c) => c.parentId === d.id)
                        .map((c) => c.name)
                        .join(", ") || "—"}
                    </p>
                  ))}
              </div>
            ))}
          </div>
          <div className="grid gap-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label>Level</Label>
                <Select
                  value={locForm.level}
                  onValueChange={(v) => setLocForm((f) => ({ ...f, level: v, parentId: "" }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STATE">State</SelectItem>
                    <SelectItem value="DISTRICT">District</SelectItem>
                    <SelectItem value="CITY">City</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {locForm.level !== "STATE" ? (
                <div className="grid gap-1">
                  <Label>Parent</Label>
                  <Select
                    value={locForm.parentId}
                    onValueChange={(v) => setLocForm((f) => ({ ...f, parentId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select parent" />
                    </SelectTrigger>
                    <SelectContent>
                      {parentOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Location name"
                value={locForm.name}
                onChange={(e) => setLocForm((f) => ({ ...f, name: e.target.value }))}
              />
              <Button onClick={() => void addLocation()} disabled={busy}>
                Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
