import { getMe } from "@/lib/api-server";

export const metadata = { title: "Player Dashboard" };

export default async function PlayerDashboardPage() {
  const me = await getMe();
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Welcome, {me?.name}</h1>
      <p className="mt-2 text-muted-foreground">
        Your player dashboard. Profile setup, requirements and sponsorships arrive in the next
        phases.
      </p>
    </div>
  );
}
