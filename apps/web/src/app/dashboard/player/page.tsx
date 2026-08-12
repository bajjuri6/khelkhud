import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiServer, getMe } from "@/lib/api-server";
import type { PlayerProfileMe } from "@/lib/types";

export const metadata = { title: "Player Dashboard" };

export default async function PlayerDashboardPage() {
  const [me, profileRes] = await Promise.all([
    getMe(),
    apiServer<{ data: PlayerProfileMe }>("/api/players/me"),
  ]);
  const profile = profileRes?.data;
  const profileComplete = Boolean(profile?.sportId && profile?.locationId && profile?.bio);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Welcome, {me?.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Verification status: <span className="font-medium">{profile?.verificationStatus}</span>
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your profile</CardTitle>
            <CardDescription>
              {profileComplete
                ? "Profile looks good. Keep it updated for sponsors."
                : "Complete your profile so sponsors can discover you."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/player/profile">Edit profile</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Requirements</CardTitle>
            <CardDescription>
              {profile?.requirements.length
                ? `${profile.requirements.length} requirement(s) listed.`
                : "List what you need — equipment, fees, travel, coaching."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/player/requirements">Manage requirements</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Public profile</CardTitle>
            <CardDescription>See what sponsors see.</CardDescription>
          </CardHeader>
          <CardContent>
            {profile ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/athletes/${profile.id}`}>View public page</Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
