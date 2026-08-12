"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatPaise } from "@khelkhud/shared";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api";
import { documentUrl, uploadFile } from "@/lib/upload";
import type { Allocation, SponsorshipDetail } from "@/lib/types";

const STATUS_BADGES: Record<Allocation["status"], "secondary" | "default" | "outline"> = {
  PLANNED: "outline",
  PURCHASED: "secondary",
  COMPLETED: "default",
};

export function TrackingManager({ sponsorship }: { sponsorship: SponsorshipDetail }) {
  const router = useRouter();
  const s = sponsorship;
  const allocated = s.allocations.reduce((sum, a) => sum + a.amountPaise, 0);

  const [allocForm, setAllocForm] = useState({ label: "", amount: "" });
  const [updateForm, setUpdateForm] = useState({ title: "", body: "" });
  const [updateFiles, setUpdateFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const receiptTarget = useRef<string | null>(null);
  const receiptInput = useRef<HTMLInputElement>(null);

  async function addAllocation() {
    const amountPaise = Math.round(Number(allocForm.amount) * 100);
    if (!allocForm.label.trim() || !amountPaise) {
      toast.error("Add a label and amount");
      return;
    }
    setBusy(true);
    try {
      await apiClient(`/api/sponsorships/${s.id}/allocations`, {
        method: "POST",
        body: JSON.stringify({ label: allocForm.label.trim(), amountPaise }),
      });
      setAllocForm({ label: "", amount: "" });
      toast.success("Allocation added");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add allocation");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(allocationId: string, status: Allocation["status"]) {
    try {
      await apiClient(`/api/sponsorships/${s.id}/allocations/${allocationId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      toast.success("Status updated — your sponsor has been notified");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update status");
    }
  }

  async function onReceiptPicked(file: File | undefined) {
    const allocationId = receiptTarget.current;
    if (!file || !allocationId) return;
    try {
      const doc = await uploadFile(file, "RECEIPT", { sponsorshipId: s.id });
      await apiClient(`/api/sponsorships/${s.id}/allocations/${allocationId}`, {
        method: "PATCH",
        body: JSON.stringify({ receiptDocumentId: doc.id }),
      });
      toast.success("Receipt attached");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Receipt upload failed");
    }
  }

  async function postUpdate() {
    if (!updateForm.title.trim() || !updateForm.body.trim()) {
      toast.error("Add a title and message");
      return;
    }
    setBusy(true);
    try {
      const documentIds: string[] = [];
      for (const file of updateFiles) {
        const kind = file.type === "application/pdf" ? "OTHER" : "UPDATE_MEDIA";
        const doc = await uploadFile(file, kind, { sponsorshipId: s.id });
        documentIds.push(doc.id);
      }
      await apiClient("/api/updates", {
        method: "POST",
        body: JSON.stringify({
          title: updateForm.title.trim(),
          body: updateForm.body.trim(),
          sponsorshipId: s.id,
          documentIds,
        }),
      });
      setUpdateForm({ title: "", body: "" });
      setUpdateFiles([]);
      toast.success("Update posted — your sponsor can see it now");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not post update");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{formatPaise(s.amountPaise)}</h1>
          <span className="font-mono text-sm text-muted-foreground">{s.code}</span>
          <Badge variant="outline">{s.utilizationStatus.replace("_", " ").toLowerCase()}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          From {s.sponsor.displayName ?? s.sponsor.user.name} · {s.purpose}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            How you&apos;re using it — {formatPaise(allocated)} of {formatPaise(s.amountPaise)}{" "}
            allocated
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {s.allocations.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Purpose</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Receipt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.allocations.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.label}</TableCell>
                      <TableCell className="text-right">{formatPaise(a.amountPaise)}</TableCell>
                      <TableCell>
                        <Select
                          value={a.status}
                          onValueChange={(v) => void setStatus(a.id, v as Allocation["status"])}
                        >
                          <SelectTrigger className="h-8 w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PLANNED">Planned</SelectItem>
                            <SelectItem value="PURCHASED">Purchased</SelectItem>
                            <SelectItem value="COMPLETED">Completed</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {a.receiptDocumentId ? (
                          <a
                            href={documentUrl(a.receiptDocumentId)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm underline"
                          >
                            View
                          </a>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              receiptTarget.current = a.id;
                              receiptInput.current?.click();
                            }}
                          >
                            Attach
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Break the sponsorship into line items so your sponsor can see how the money is used.
            </p>
          )}
          <input
            ref={receiptInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => {
              void onReceiptPicked(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid flex-1 gap-1">
              <Label>Item</Label>
              <Input
                placeholder="e.g. Cricket bat"
                value={allocForm.label}
                onChange={(e) => setAllocForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>
            <div className="grid w-32 gap-1">
              <Label>Amount (₹)</Label>
              <Input
                type="number"
                min="1"
                value={allocForm.amount}
                onChange={(e) => setAllocForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <Button onClick={() => void addAllocation()} disabled={busy}>
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Post an update for your sponsor</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Input
            placeholder="Title, e.g. Purchased cricket bat and shoes"
            value={updateForm.title}
            onChange={(e) => setUpdateForm((f) => ({ ...f, title: e.target.value }))}
          />
          <Textarea
            rows={3}
            placeholder="What happened? How did the support help?"
            value={updateForm.body}
            onChange={(e) => setUpdateForm((f) => ({ ...f, body: e.target.value }))}
          />
          <div className="flex items-center gap-3">
            <Input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="max-w-xs"
              onChange={(e) => setUpdateFiles(Array.from(e.target.files ?? []))}
            />
            <Button onClick={() => void postUpdate()} disabled={busy}>
              {busy ? "Posting…" : "Post update"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {s.updates.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Updates</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {s.updates.map((u) => (
              <div key={u.id} className="border-l-2 pl-4">
                <p className="font-medium">{u.title}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(u.createdAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
                <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{u.body}</p>
                {u.attachments.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {u.attachments.map((att) => (
                      <a
                        key={att.id}
                        href={documentUrl(att.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs underline"
                      >
                        📎 {att.fileName}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
