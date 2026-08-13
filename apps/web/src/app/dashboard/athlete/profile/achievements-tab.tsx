"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { LEVEL_LABELS, type Achievement } from "@/lib/types";

export function AchievementsTab({ achievements }: { achievements: Achievement[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", level: "", year: "", description: "" });

  async function add() {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      await apiClient("/api/athletes/me/achievements", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          level: form.level || null,
          year: form.year ? Number(form.year) : null,
          description: form.description || null,
        }),
      });
      setForm({ title: "", level: "", year: "", description: "" });
      toast.success("Achievement added");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add achievement");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await apiClient(`/api/athletes/me/achievements/${id}`, { method: "DELETE" });
      toast.success("Achievement removed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove achievement");
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-4">
          <div className="grid gap-2 sm:col-span-2">
            <Label>Title</Label>
            <Input
              placeholder="e.g. District U-19 Champion"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Level</Label>
            <Select
              value={form.level}
              onValueChange={(v) => setForm((f) => ({ ...f, level: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Level" />
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
          <div className="grid gap-2">
            <Label>Year</Label>
            <Input
              type="number"
              placeholder="2025"
              value={form.year}
              onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
            />
          </div>
          <div className="grid gap-2 sm:col-span-3">
            <Label>Description</Label>
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={() => void add()} disabled={saving}>
              {saving ? "Adding…" : "Add achievement"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {achievements.length === 0 ? (
        <p className="text-sm text-muted-foreground">No achievements added yet.</p>
      ) : (
        <div className="grid gap-3">
          {achievements.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex items-start justify-between gap-4 pt-6">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{a.title}</span>
                    {a.level ? <Badge variant="secondary">{LEVEL_LABELS[a.level]}</Badge> : null}
                    {a.year ? <span className="text-sm text-muted-foreground">{a.year}</span> : null}
                  </div>
                  {a.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>
                  ) : null}
                </div>
                <Button variant="ghost" size="sm" onClick={() => void remove(a.id)}>
                  Remove
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
