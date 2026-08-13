import { apiServer } from "@/lib/api-server";
import type { Location, AthleteProfileMe, Sport } from "@/lib/types";
import { ProfileEditor } from "./profile-editor";

export const metadata = { title: "My Profile" };

export default async function AthleteProfilePage() {
  const [profileRes, sportsRes, locationsRes] = await Promise.all([
    apiServer<{ data: AthleteProfileMe }>("/api/athletes/me"),
    apiServer<{ data: Sport[] }>("/api/meta/sports"),
    apiServer<{ data: Location[] }>("/api/meta/locations"),
  ]);

  if (!profileRes) {
    return <p className="text-muted-foreground">Could not load your profile. Try again.</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        A complete profile helps sponsors trust and find you. Verification status:{" "}
        <span className="font-medium">{profileRes.data.verificationStatus}</span>
      </p>
      <ProfileEditor
        profile={profileRes.data}
        sports={sportsRes?.data ?? []}
        locations={locationsRes?.data ?? []}
      />
    </div>
  );
}
