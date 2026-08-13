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

export const metadata = { title: "Sponsorships (Admin)" };

type Row = {
  id: string;
  code: string;
  amountPaise: number;
  purpose: string;
  status: string;
  paymentStatus: string;
  utilizationStatus: string;
  createdAt: string;
  isAnonymous: boolean;
  athlete: { user: { name: string } };
  sponsor: { displayName: string | null; user: { name: string } };
};

export default async function AdminSponsorshipsPage() {
  const res = await apiServer<{ data: Row[]; meta: { total: number } }>(
    "/api/admin/sponsorships?pageSize=50",
  );
  const rows = res?.data ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Sponsorships</h1>
      <p className="mt-1 text-sm text-muted-foreground">{res?.meta.total ?? 0} total</p>
      <div className="mt-6 overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Sponsor</TableHead>
              <TableHead>Athlete</TableHead>
              <TableHead>Purpose</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Utilization</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.code}</TableCell>
                <TableCell>
                  {r.sponsor.displayName ?? r.sponsor.user.name}
                  {r.isAnonymous ? " 🕶" : ""}
                </TableCell>
                <TableCell>{r.athlete.user.name}</TableCell>
                <TableCell className="max-w-48 truncate">{r.purpose}</TableCell>
                <TableCell className="text-right">{formatPaise(r.amountPaise)}</TableCell>
                <TableCell>
                  <Badge variant={r.paymentStatus === "PAID" ? "default" : "outline"}>
                    {r.paymentStatus}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {r.utilizationStatus.replace("_", " ").toLowerCase()}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(r.createdAt).toLocaleDateString("en-IN")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
