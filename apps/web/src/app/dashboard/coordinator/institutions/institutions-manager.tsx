"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { institutionKinds } from "@khelkhud/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiClientError, apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";

export type Institution = {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  village: { id: string; name: string; displayPath: string | null };
  _count?: { requests: number };
};

type Village = { id: string; name: string; displayPath: string | null };

const KIND_LABEL: Record<string, string> = {
  SCHOOL: "School",
  PLAYGROUND: "Playground",
  CLUB: "Club",
  ANGANWADI: "Anganwadi",
  OTHER: "Other",
};

/**
 * Registering the places in a village that need equipment.
 *
 * The village is chosen from the coordinator's OWN villages rather than the general
 * picker: their authority is already bounded to those, the API enforces it, and offering a
 * free search would invite a 403 they cannot do anything about.
 */
export function InstitutionsManager({
  institutions,
  villages,
}: {
  institutions: Institution[];
  villages: Village[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [villageId, setVillageId] = useState(villages[0]?.id ?? "");
  const [kind, setKind] = useState<string>("SCHOOL");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function create() {
    if (!name.trim() || !villageId) {
      toast.error("Pick a village and give it a name");
      return;
    }
    setSaving(true);
    try {
      await apiClient("/api/institutions", {
        method: "POST",
        body: JSON.stringify({
          villageId,
          kind,
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      });
      toast.success(`${name.trim()} registered`);
      setName("");
      setDescription("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not reach the server");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          A school, ground or club can be the beneficiary of a request, the same as an
          athlete. Register the places in your villages so equipment can be requested for
          them — and delivered to you.
        </p>
        <Button variant="accent" onClick={() => setOpen((o) => !o)}>
          {open ? "Cancel" : "Register a place"}
        </Button>
      </div>

      {open ? (
        <div className="mt-6 space-y-4 rounded-xl border border-border bg-card p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inst-village">Village</Label>
              <Select value={villageId} onValueChange={setVillageId}>
                <SelectTrigger id="inst-village" className="h-10">
                  <SelectValue placeholder="Choose a village" />
                </SelectTrigger>
                <SelectContent>
                  {villages.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inst-kind">Type</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger id="inst-kind" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {institutionKinds.map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_LABEL[k] ?? k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inst-name">Name</Label>
            <Input
              id="inst-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ZPHS Ammapur"
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inst-desc">What is it used for? (optional)</Label>
            <Textarea
              id="inst-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Government high school. One shared set of equipment for 340 students."
            />
          </div>
          <Button variant="accent" onClick={() => void create()} disabled={saving}>
            {saving ? "Saving…" : "Register"}
          </Button>
        </div>
      ) : null}

      {institutions.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border bg-muted/60 p-12 text-center">
          <p className="font-display text-h3">Nothing registered yet.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Register the school or ground first, then raise a request for what it needs.
          </p>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {institutions.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">{i.name}</p>
                <p className="text-xs text-muted-foreground">
                  {KIND_LABEL[i.kind] ?? i.kind} &middot; {i.village.name}
                </p>
                {i.description ? (
                  <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
                    {i.description}
                  </p>
                ) : null}
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-0.5 text-xs",
                  (i._count?.requests ?? 0) > 0
                    ? "bg-marigold/15 text-[#8A4E12]"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {i._count?.requests ?? 0} request{(i._count?.requests ?? 0) === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
