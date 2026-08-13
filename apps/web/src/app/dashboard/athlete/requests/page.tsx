import { apiServer } from "@/lib/api-server";
import type { AthleteProfileMe } from "@/lib/types";
import { RequestsManager } from "./requests-manager";

export const metadata = { title: "Sponsorship Requests" };

export default async function RequestsPage() {
  const profileRes = await apiServer<{ data: AthleteProfileMe }>("/api/athletes/me");
  if (!profileRes) {
    return <p className="text-muted-foreground">Could not load requests. Try again.</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Sponsorship Requests</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tell sponsors exactly what you need and how the money will be used.
      </p>
      <RequestsManager requests={profileRes.data.requests} />
    </div>
  );
}
