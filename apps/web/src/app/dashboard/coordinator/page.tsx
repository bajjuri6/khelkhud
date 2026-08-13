import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { apiServer, getMe } from "@/lib/api-server";
import { StatTile } from "@/components/stat-tile";
import { ValidationQueue, type QueueRequest } from "./validation-queue";

export const metadata: Metadata = { title: "Coordinator" };

type QueueResponse = {
  data: { pending: QueueRequest[]; recent: RecentRequest[] };
  meta: {
    villages: { id: string; name: string; displayPath: string | null }[];
    pendingCount: number;
  };
};

type RecentRequest = {
  id: string;
  title: string;
  status: string;
  kind: string;
  village: { name: string };
  athlete: { user: { name: string } } | null;
  institution: { name: string } | null;
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Live",
  PARTIALLY_FULFILLED: "Part funded",
  FULFILLED: "Fulfilled",
  REJECTED: "Sent back",
  CLOSED: "Closed",
  DRAFT: "Draft",
};

export default async function CoordinatorPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "COORDINATOR" && me.role !== "ADMIN") redirect("/");

  const res = await apiServer<QueueResponse>("/api/coordinators/me/queue");

  // An ADMIN without a CoordinatorProfile gets a 403 from the API, which apiServer turns
  // into null. Say so plainly instead of rendering an empty queue that looks like "no work".
  if (!res) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-16">
        <h1 className="text-h1 font-semibold">Not a coordinator</h1>
        <p className="mt-4 leading-relaxed text-slate">
          This page is for village coordinators. If you should have access, an admin needs
          to appoint you and assign your villages.
        </p>
      </div>
    );
  }

  const { pending, recent } = res.data;
  const { villages } = res.meta;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <p className="eyebrow text-slate">Village coordinator</p>
      <h1 className="mt-3 text-h1 font-semibold">
        {pending.length > 0
          ? `${pending.length} request${pending.length === 1 ? "" : "s"} waiting on you.`
          : "Your villages are up to date."}
      </h1>
      <p className="mt-4 max-w-2xl leading-relaxed text-slate">
        You validate requests raised by athletes in{" "}
        {villages.length === 1 ? (
          <span className="font-medium text-foreground">{villages[0]!.name}</span>
        ) : (
          <span className="font-medium text-foreground">{villages.length} villages</span>
        )}
        . Anything you raise yourself goes live immediately — you are the validator.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <StatTile label="Waiting on you" value={String(pending.length)} />
        <StatTile label="Your villages" value={String(villages.length)} />
        <StatTile
          label="Recently decided"
          value={String(recent.length)}
          hint="Last 20 in your area"
        />
      </div>

      {villages.length > 0 ? (
        <div className="mt-6 flex flex-wrap gap-2">
          {villages.map((v) => (
            <span
              key={v.id}
              title={v.displayPath ?? undefined}
              className="rounded-full border border-border bg-cream-2 px-3 py-1 text-xs text-slate"
            >
              {v.name}
            </span>
          ))}
        </div>
      ) : null}

      <h2 className="mt-14 text-h2 font-semibold">Waiting for validation</h2>
      <div className="mt-6">
        <ValidationQueue pending={pending} />
      </div>

      {recent.length > 0 ? (
        <>
          <h2 className="mt-16 text-h2 font-semibold">Recently decided</h2>
          <ul className="mt-6 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{r.title}</span>
                  <span className="block text-xs text-slate">
                    {r.athlete?.user.name ?? r.institution?.name} &middot; {r.village.name}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-cream-2 px-2.5 py-0.5 text-xs text-slate">
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
