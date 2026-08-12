import { getMe } from "@/lib/api-server";

export const metadata = { title: "Sponsor Dashboard" };

export default async function SponsorDashboardPage() {
  const me = await getMe();
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Welcome, {me?.name}</h1>
      <p className="mt-2 text-muted-foreground">
        Your sponsor dashboard. Athlete discovery and sponsorship tracking arrive in the next
        phases.
      </p>
    </div>
  );
}
