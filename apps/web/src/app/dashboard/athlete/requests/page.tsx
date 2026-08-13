import { apiServer } from "@/lib/api-server";
import { RequestsManager, type AthleteRequest } from "./requests-manager";

export const metadata = { title: "Requests" };

/** Only what this screen needs: the village it will be raised in, and what is already open. */
type ProfileForRequests = {
  location: { name: string; level: string; displayPath: string | null } | null;
  requests: AthleteRequest[];
};

export default async function RequestsPage() {
  const profileRes = await apiServer<{ data: ProfileForRequests }>("/api/athletes/me");
  if (!profileRes) {
    return <p className="text-slate">Could not load your requests. Try again.</p>;
  }

  const { location, requests } = profileRes.data;
  // A district or a city is not somewhere a request can be raised — it has no coordinator
  // and no sponsors following it — so the form treats it the same as having nothing set.
  const villageLabel =
    location && location.level === "VILLAGE" ? (location.displayPath ?? location.name) : null;

  return (
    <div>
      <h1 className="font-display text-h2 font-semibold">Requests</h1>
      <p className="mt-2 max-w-prose text-sm text-slate">
        Ask for equipment a sponsor can buy and send you, or for cash toward travel, coaching
        and entry fees. Either way your village coordinator sees it first.
      </p>
      <RequestsManager requests={requests} villageLabel={villageLabel} />
    </div>
  );
}
