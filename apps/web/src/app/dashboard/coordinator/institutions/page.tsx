import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { apiServer, getMe } from "@/lib/api-server";
import { InstitutionsManager, type Institution } from "./institutions-manager";

export const metadata: Metadata = { title: "Places in your villages" };

type CoordinatorMe = {
  data: { villages: { id: string; name: string; displayPath: string | null }[] };
};

export default async function InstitutionsPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "COORDINATOR" && me.role !== "ADMIN") redirect("/");

  const profile = await apiServer<CoordinatorMe>("/api/coordinators/me");
  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-16">
        <h1 className="text-h1 font-semibold">Not a coordinator</h1>
        <p className="mt-4 leading-relaxed text-slate">
          An admin needs to appoint you and assign your villages first.
        </p>
      </div>
    );
  }

  const villages = profile.data.villages;

  // One call per village rather than a single unfiltered fetch: the endpoint is public and
  // unscoped, so asking for everything would pull in institutions this coordinator has no
  // business managing. Village counts are single digits, so the cost is trivial.
  const lists = await Promise.all(
    villages.map((v) =>
      apiServer<{ data: Institution[] }>(`/api/institutions?villageId=${v.id}`),
    ),
  );
  const institutions = lists.flatMap((l) => l?.data ?? []);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <p className="eyebrow text-slate">Village coordinator</p>
      <h1 className="mt-3 text-h1 font-semibold">Places in your villages</h1>
      <div className="mt-8">
        <InstitutionsManager institutions={institutions} villages={villages} />
      </div>
    </div>
  );
}
