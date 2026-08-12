import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMe } from "@/lib/api-server";

export const metadata = { title: "Sponsor Dashboard" };

export default async function SponsorDashboardPage() {
  const me = await getMe();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Welcome, {me?.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Discover athletes and track the impact of your support.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Find athletes</CardTitle>
            <CardDescription>
              Search by sport, location, category and funding requirement.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm">
              <Link href="/athletes">Browse athletes</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your profile</CardTitle>
            <CardDescription>
              Set your preferences so we can match you with relevant athletes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/sponsor/profile">Edit profile</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your sponsorships</CardTitle>
            <CardDescription>Track how your support is being used.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/sponsor/sponsorships">View sponsorships</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
