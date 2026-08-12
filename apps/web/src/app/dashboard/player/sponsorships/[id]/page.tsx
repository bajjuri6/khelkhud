import { notFound } from "next/navigation";
import { apiServer } from "@/lib/api-server";
import type { SponsorshipDetail } from "@/lib/types";
import { TrackingManager } from "./tracking-manager";

export const metadata = { title: "Manage Sponsorship" };

export default async function PlayerSponsorshipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await apiServer<{ data: SponsorshipDetail }>(`/api/sponsorships/${id}`);
  if (!res) notFound();
  return <TrackingManager sponsorship={res.data} />;
}
