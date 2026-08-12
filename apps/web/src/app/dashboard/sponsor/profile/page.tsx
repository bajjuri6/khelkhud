import { apiServer } from "@/lib/api-server";
import type { Location, Sport } from "@/lib/types";
import { SponsorProfileEditor, type SponsorProfileData } from "./sponsor-profile-editor";

export const metadata = { title: "Sponsor Profile" };

export default async function SponsorProfilePage() {
  const [profileRes, sportsRes, locationsRes] = await Promise.all([
    apiServer<{ data: SponsorProfileData }>("/api/sponsors/me"),
    apiServer<{ data: Sport[] }>("/api/meta/sports"),
    apiServer<{ data: Location[] }>("/api/meta/locations"),
  ]);

  if (!profileRes) {
    return <p className="text-muted-foreground">Could not load your profile. Try again.</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Sponsor Profile</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Verification status:{" "}
        <span className="font-medium">{profileRes.data.verificationStatus}</span>
      </p>
      <SponsorProfileEditor
        profile={profileRes.data}
        sports={sportsRes?.data ?? []}
        locations={locationsRes?.data ?? []}
      />
    </div>
  );
}
