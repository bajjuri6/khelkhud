import { apiServer } from "@/lib/api-server";
import { VerificationQueue, type QueueData } from "./verification-queue";

export const metadata = { title: "Verification Queue" };

export default async function VerificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await apiServer<{ data: QueueData }>(`/api/admin/verifications${query}`);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Verification queue</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Review profiles and their documents, then approve, reject, or request more information.
      </p>
      <VerificationQueue
        data={res?.data ?? { athletes: [], sponsors: [] }}
        currentStatus={status ?? ""}
      />
    </div>
  );
}
