import { formatPaise } from "@khelkhud/shared";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiServer } from "@/lib/api-server";

export const metadata = { title: "Transactions (Admin)" };

type Row = {
  id: string;
  status: string;
  amountPaise: number;
  provider: string;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  occurredAt: string;
  sponsorship: { code: string };
};

export default async function AdminTransactionsPage() {
  const res = await apiServer<{ data: Row[]; meta: { total: number } }>(
    "/api/admin/transactions?pageSize=50",
  );
  const rows = res?.data ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Append-only payment ledger ({res?.meta.total ?? 0} entries)
      </p>
      <div className="mt-6 overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Sponsorship</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Payment ref</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs">
                  {new Date(r.occurredAt).toLocaleString("en-IN")}
                </TableCell>
                <TableCell className="font-mono text-xs">{r.sponsorship.code}</TableCell>
                <TableCell>
                  <Badge variant={r.status === "PAID" ? "default" : "outline"}>{r.status}</Badge>
                </TableCell>
                <TableCell className="text-right">{formatPaise(r.amountPaise)}</TableCell>
                <TableCell className="text-xs">{r.provider}</TableCell>
                <TableCell className="font-mono text-xs">{r.providerPaymentId ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
