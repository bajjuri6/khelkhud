import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPaise } from "@khelkhud/shared";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiServer } from "@/lib/api-server";
import { documentUrl, profilePhotoUrl } from "@/lib/upload";
import type { SponsorshipDetail } from "@/lib/types";

export const metadata = { title: "Sponsorship Tracking" };

const ALLOCATION_LABELS: Record<string, string> = {
  PLANNED: "Planned",
  PURCHASED: "Purchased",
  COMPLETED: "Completed",
};

export default async function SponsorSponsorshipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await apiServer<{ data: SponsorshipDetail }>(`/api/sponsorships/${id}`);
  if (!res) notFound();
  const s = res.data;
  const photo = profilePhotoUrl(s.athlete.photoKey) ?? s.athlete.avatarUrl;
  const utilizedPaise = s.allocations
    .filter((a) => a.status !== "PLANNED")
    .reduce((sum, a) => sum + a.amountPaise, 0);
  const pct =
    s.amountPaise > 0 ? Math.min(100, Math.round((utilizedPaise / s.amountPaise) * 100)) : 0;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar className="size-14">
            {photo ? <AvatarImage src={photo} alt={s.athlete.name} /> : null}
            <AvatarFallback>{s.athlete.name[0]}</AvatarFallback>
          </Avatar>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {formatPaise(s.amountPaise)} sponsored
              </h1>
              <span className="font-mono text-sm text-muted-foreground">{s.code}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {s.athlete.name} · {s.purpose} ·{" "}
              {new Date(s.createdAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge variant={s.paymentStatus === "PAID" ? "default" : "secondary"}>
            {s.paymentStatus}
          </Badge>
          <Badge variant="outline">{s.utilizationStatus.replace("_", " ").toLowerCase()}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Utilization</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span>
                {formatPaise(utilizedPaise)} of {formatPaise(s.amountPaise)} utilized
              </span>
              <span className="text-muted-foreground">{pct}%</span>
            </div>
            <Progress value={pct} />
          </div>
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
                        <Badge
                          variant={
                            a.status === "COMPLETED"
                              ? "default"
                              : a.status === "PURCHASED"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {ALLOCATION_LABELS[a.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {a.receiptDocumentId ? (
                          <a
                            href={documentUrl(a.receiptDocumentId)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm underline"
                          >
                            View receipt
                          </a>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              The athlete hasn&apos;t broken down utilization yet. You&apos;ll be notified when they
              do.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Updates from {s.athlete.name}</CardTitle>
        </CardHeader>
        <CardContent>
          {s.updates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No updates yet. You&apos;ll be notified when the athlete posts progress.
            </p>
          ) : (
            <div className="grid gap-4">
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
            </div>
          )}
        </CardContent>
      </Card>

      {s.transactions && s.transactions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment history</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{new Date(t.occurredAt).toLocaleString("en-IN")}</TableCell>
                    <TableCell>
                      <Badge variant={t.status === "PAID" ? "default" : "outline"}>
                        {t.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatPaise(t.amountPaise)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {t.providerPaymentId ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <div>
        <Button asChild variant="outline">
          <Link href={`/athletes/${s.athlete.id}`}>View {s.athlete.name}&apos;s profile</Link>
        </Button>
      </div>
    </div>
  );
}
