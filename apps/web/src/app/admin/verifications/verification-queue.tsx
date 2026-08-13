"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api";
import { documentUrl } from "@/lib/upload";

type QueueProfile = {
  id: string;
  verificationStatus: string;
  createdAt: string;
  user: { name: string; email: string; avatarUrl: string | null };
  sport?: { name: string } | null;
  sponsorType?: string;
  orgName?: string | null;
  documents: { id: string; fileName: string; kind: string }[];
  verificationRecords: { decision: string; note: string | null; createdAt: string }[];
};

export type QueueData = { athletes: QueueProfile[]; sponsors: QueueProfile[] };

type Decision = "VERIFIED" | "REJECTED" | "INFO_REQUESTED";

const STATUS_FILTERS = [
  { value: "", label: "Needs review" },
  { value: "VERIFIED", label: "Verified" },
  { value: "REJECTED", label: "Rejected" },
];

export function VerificationQueue({
  data,
  currentStatus,
}: {
  data: QueueData;
  currentStatus: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [dialog, setDialog] = useState<{
    profile: QueueProfile;
    type: "athlete" | "sponsor";
    decision: Decision;
  } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitDecision() {
    if (!dialog) return;
    setBusy(true);
    try {
      await apiClient(`/api/admin/verifications/${dialog.type}/${dialog.profile.id}`, {
        method: "POST",
        body: JSON.stringify({ decision: dialog.decision, note: note || null }),
      });
      toast.success(`Profile ${dialog.decision.toLowerCase().replace("_", " ")}`);
      setDialog(null);
      setNote("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Decision failed");
    } finally {
      setBusy(false);
    }
  }

  function Row({ profile, type }: { profile: QueueProfile; type: "athlete" | "sponsor" }) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <div className="flex items-center gap-3">
            <Avatar className="size-10">
              {profile.user.avatarUrl ? (
                <AvatarImage src={profile.user.avatarUrl} alt="" />
              ) : null}
              <AvatarFallback>{profile.user.name[0]}</AvatarFallback>
            </Avatar>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{profile.user.name}</span>
                <Badge variant="outline">{type}</Badge>
                <Badge variant="secondary">{profile.verificationStatus}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {[profile.user.email, profile.sport?.name, profile.orgName]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {profile.documents.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-2">
                  {profile.documents.map((d) => (
                    <a
                      key={d.id}
                      href={documentUrl(d.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs underline"
                    >
                      📎 {d.fileName}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">No documents uploaded</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => setDialog({ profile, type, decision: "VERIFIED" })}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDialog({ profile, type, decision: "INFO_REQUESTED" })}
            >
              Request info
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setDialog({ profile, type, decision: "REJECTED" })}
            >
              Reject
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isEmpty = data.athletes.length === 0 && data.sponsors.length === 0;

  return (
    <div className="mt-6 grid gap-4">
      <div className="w-48">
        <Select
          value={currentStatus || "__default__"}
          onValueChange={(v) =>
            router.push(v === "__default__" ? pathname : `${pathname}?status=${v}`)
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((f) => (
              <SelectItem key={f.value || "__default__"} value={f.value || "__default__"}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isEmpty ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          Nothing in this queue. 🎉
        </div>
      ) : (
        <>
          {data.athletes.map((p) => (
            <Row key={p.id} profile={p} type="athlete" />
          ))}
          {data.sponsors.map((p) => (
            <Row key={p.id} profile={p} type="sponsor" />
          ))}
        </>
      )}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.decision === "VERIFIED"
                ? "Approve profile"
                : dialog?.decision === "REJECTED"
                  ? "Reject profile"
                  : "Request more information"}
            </DialogTitle>
            <DialogDescription>
              {dialog?.profile.user.name} ({dialog?.type}).{" "}
              {dialog?.decision === "VERIFIED"
                ? "The profile will show a verified badge."
                : "The note below is sent to the user."}
            </DialogDescription>
          </DialogHeader>
          {dialog?.decision !== "VERIFIED" ? (
            <Textarea
              rows={3}
              placeholder={
                dialog?.decision === "REJECTED"
                  ? "Reason for rejection"
                  : "What additional information is needed?"
              }
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button onClick={() => void submitDecision()} disabled={busy}>
              {busy ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
