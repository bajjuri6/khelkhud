"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";
import type { PlayerEvent } from "@/lib/types";

export function EventsTab({ events }: { events: PlayerEvent[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", date: "", venue: "", expense: "" });

  async function add() {
    if (!form.name.trim()) {
      toast.error("Event name is required");
      return;
    }
    setSaving(true);
    try {
      await apiClient("/api/players/me/events", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          date: form.date ? new Date(form.date).toISOString() : null,
          venue: form.venue || null,
          estimatedExpensePaise: form.expense ? Math.round(Number(form.expense) * 100) : null,
          isUpcoming: !form.date || new Date(form.date) >= new Date(),
        }),
      });
      setForm({ name: "", date: "", venue: "", expense: "" });
      toast.success("Event added");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add event");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await apiClient(`/api/players/me/events/${id}`, { method: "DELETE" });
      toast.success("Event removed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove event");
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-4">
          <div className="grid gap-2 sm:col-span-2">
            <Label>Event name</Label>
            <Input
              placeholder="e.g. State U-19 Championship"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Date</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Venue</Label>
            <Input
              value={form.venue}
              onChange={(e) => setForm((f) => ({ ...f, venue: e.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Estimated expenses (₹)</Label>
            <Input
              type="number"
              min="0"
              value={form.expense}
              onChange={(e) => setForm((f) => ({ ...f, expense: e.target.value }))}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={() => void add()} disabled={saving}>
              {saving ? "Adding…" : "Add event"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events added yet.</p>
      ) : (
        <div className="grid gap-3">
          {events.map((ev) => (
            <Card key={ev.id}>
              <CardContent className="flex items-start justify-between gap-4 pt-6">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{ev.name}</span>
                    {ev.isUpcoming ? <Badge>Upcoming</Badge> : <Badge variant="secondary">Past</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[
                      ev.date ? new Date(ev.date).toLocaleDateString("en-IN") : null,
                      ev.venue,
                      ev.estimatedExpensePaise
                        ? `Est. ₹${(ev.estimatedExpensePaise / 100).toLocaleString("en-IN")}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => void remove(ev.id)}>
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
