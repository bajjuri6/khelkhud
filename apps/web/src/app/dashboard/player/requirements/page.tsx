import { apiServer } from "@/lib/api-server";
import type { PlayerProfileMe } from "@/lib/types";
import { RequirementsManager } from "./requirements-manager";

export const metadata = { title: "Sponsorship Requirements" };

export default async function RequirementsPage() {
  const profileRes = await apiServer<{ data: PlayerProfileMe }>("/api/players/me");
  if (!profileRes) {
    return <p className="text-muted-foreground">Could not load requirements. Try again.</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Sponsorship Requirements</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tell sponsors exactly what you need and how the money will be used.
      </p>
      <RequirementsManager requirements={profileRes.data.requirements} />
    </div>
  );
}
