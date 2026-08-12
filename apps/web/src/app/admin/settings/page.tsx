import { apiServer } from "@/lib/api-server";
import type { Location, Sport } from "@/lib/types";
import { SettingsManager } from "./settings-manager";

export const metadata = { title: "Sports & Locations" };

type AdminSport = Sport & { isActive?: boolean };

export default async function AdminSettingsPage() {
  const [sportsRes, locationsRes] = await Promise.all([
    apiServer<{ data: AdminSport[] }>("/api/meta/sports"),
    apiServer<{ data: Location[] }>("/api/meta/locations"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Sports &amp; Locations</h1>
      <SettingsManager sports={sportsRes?.data ?? []} locations={locationsRes?.data ?? []} />
    </div>
  );
}
