import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { apiServer, getMe } from "@/lib/api-server";
import { RaiseRequest, type Beneficiaries, type RaisedRequest } from "./raise-request";

export const metadata: Metadata = { title: "Raise a request" };

type Village = { id: string; name: string; displayPath: string | null };

type CoordinatorMe = {
  data: { id: string; designation: string; villages: Village[] };
};

type AthleteRow = {
  id: string;
  name: string;
  sport: { id: string; name: string } | null;
  verificationStatus: string;
};

type InstitutionRow = { id: string; name: string; kind: string };

export default async function CoordinatorRequestsPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "COORDINATOR" && me.role !== "ADMIN") redirect("/");

  const profile = await apiServer<CoordinatorMe>("/api/coordinators/me");
  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-16">
        <h1 className="text-h1 font-semibold">Not a coordinator</h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          Raising a request on someone&rsquo;s behalf is a coordinator&rsquo;s privilege. An
          admin needs to appoint you and assign your villages first.
        </p>
      </div>
    );
  }

  const villages = profile.data.villages;

  // Candidates are fetched per village rather than once unfiltered: both endpoints are
  // public and unscoped, so asking for everything would offer this coordinator people and
  // places they have no authority over — and the API would then 403 the submit, which is a
  // worse way to learn it. Village counts are single digits.
  const perVillage = await Promise.all(
    villages.map(async (v) => {
      const [athletes, institutions] = await Promise.all([
        // verifiedOnly=false on purpose: an unverified athlete is exactly who most needs a
        // coordinator to raise for them, and raising it is what vouches for them.
        apiServer<{ data: AthleteRow[] }>(
          `/api/athletes?locationId=${v.id}&verifiedOnly=false&pageSize=24`,
        ),
        apiServer<{ data: InstitutionRow[] }>(`/api/institutions?villageId=${v.id}`),
      ]);
      return [
        v.id,
        {
          athletes: (athletes?.data ?? []).map((a) => ({
            id: a.id,
            name: a.name,
            sportName: a.sport?.name ?? null,
            verificationStatus: a.verificationStatus,
          })),
          institutions: institutions?.data ?? [],
        },
      ] as const;
    }),
  );
  const beneficiaries: Beneficiaries = Object.fromEntries(perVillage);

  const raised = await apiServer<{ data: RaisedRequest[] }>("/api/coordinators/me/requests");

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <p className="eyebrow text-muted-foreground">Village coordinator</p>
      <h1 className="mt-3 text-h1 font-semibold">Raise a request</h1>
      <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
        For an athlete who cannot do it themselves, or for a school or ground that has no
        account at all. You are the validator in your villages, so what you raise here does
        not wait for anyone.
      </p>

      <div className="mt-10">
        <RaiseRequest
          villages={villages}
          beneficiaries={beneficiaries}
          designation={profile.data.designation}
          raised={raised?.data ?? []}
        />
      </div>
    </div>
  );
}
