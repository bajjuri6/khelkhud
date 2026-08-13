"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatPaise } from "@khelkhud/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api";
import type { Request } from "@/lib/types";

type Row = { label: string; amount: string };

const STATUS_LABELS: Record<Request["status"], string> = {
  OPEN: "Open",
  PARTIALLY_FULFILLED: "Partially funded",
  FULFILLED: "Fully funded",
  CLOSED: "Closed",
};

export function RequestsManager({ requests }: { requests: Request[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<Row[]>([{ label: "", amount: "" }]);

  const totalPaise = rows.reduce(
    (sum, r) => sum + (Number(r.amount) > 0 ? Math.round(Number(r.amount) * 100) : 0),
    0,
  );

  function setRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function create() {
    const breakdown = rows
      .filter((r) => r.label.trim() && Number(r.amount) > 0)
      .map((r) => ({ label: r.label.trim(), amountPaise: Math.round(Number(r.amount) * 100) }));
    if (!title.trim() || breakdown.length === 0) {
      toast.error("Add a title and at least one breakdown item");
      return;
    }
    setSaving(true);
    try {
      await apiClient("/api/athletes/me/requests", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description || null,
          totalEstimatedPaise: breakdown.reduce((s, b) => s + b.amountPaise, 0),
          breakdown,
        }),
      });
      setTitle("");
      setDescription("");
      setRows([{ label: "", amount: "" }]);
      toast.success("Request created");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create request");
    } finally {
      setSaving(false);
    }
  }

  async function close(id: string) {
    try {
      await apiClient(`/api/athletes/me/requests/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status: "CLOSED" }),
      });
      toast.success("Request closed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not close request");
    }
  }

  return (
    <div className="mt-6 grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New request</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label>Title</Label>
            <Input
              placeholder="e.g. Season kit and tournament travel"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Description</Label>
            <Textarea
              rows={2}
              placeholder="Why you need this support"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>How will the money be used?</Label>
            {rows.map((row, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder="e.g. Cricket bat"
                  value={row.label}
                  onChange={(e) => setRow(i, { label: e.target.value })}
                />
                <Input
                  type="number"
                  min="0"
                  placeholder="₹ amount"
                  className="w-36"
                  value={row.amount}
                  onChange={(e) => setRow(i, { amount: e.target.value })}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  disabled={rows.length === 1}
                  onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                >
                  ✕
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRows((rs) => [...rs, { label: "", amount: "" }])}
              >
                Add item
              </Button>
              <span className="text-sm font-medium">
                Total: {totalPaise > 0 ? formatPaise(totalPaise) : "₹0"}
              </span>
            </div>
          </div>
          <div>
            <Button onClick={() => void create()} disabled={saving}>
              {saving ? "Creating…" : "Create request"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No requests yet.</p>
      ) : (
        <div className="grid gap-3">
          {requests.map((r) => {
            const pct =
              r.totalEstimatedPaise > 0
                ? Math.min(100, Math.round((r.raisedAmountPaise / r.totalEstimatedPaise) * 100))
                : 0;
            return (
              <Card key={r.id}>
                <CardContent className="grid gap-3 pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{r.title}</span>
                        <Badge variant={r.status === "OPEN" ? "default" : "secondary"}>
                          {STATUS_LABELS[r.status]}
                        </Badge>
                      </div>
                      {r.description ? (
                        <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
                      ) : null}
                    </div>
                    {r.status !== "CLOSED" ? (
                      <Button variant="ghost" size="sm" onClick={() => void close(r.id)}>
                        Close
                      </Button>
                    ) : null}
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>
                        {formatPaise(r.raisedAmountPaise)} / {formatPaise(r.totalEstimatedPaise)}{" "}
                        sponsored
                      </span>
                      <span className="text-muted-foreground">{pct}%</span>
                    </div>
                    <Progress value={pct} />
                  </div>
                  {r.breakdown && r.breakdown.length > 0 ? (
                    <ul className="grid gap-1 text-sm text-muted-foreground">
                      {r.breakdown.map((b, i) => (
                        <li key={i} className="flex justify-between">
                          <span>{b.label}</span>
                          <span>{formatPaise(b.amountPaise)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
