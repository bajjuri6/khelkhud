import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPaise } from "@khelkhud/shared";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { apiServer } from "@/lib/api-server";
import { BreadcrumbJsonLd } from "@/components/seo/breadcrumb-jsonld";
import { JsonLd } from "@/components/seo/json-ld";
import { SITE_URL, absoluteUrl, isIndexableAthlete } from "@/lib/seo";
import { documentUrl, profilePhotoUrl } from "@/lib/upload";
import {
  CATEGORY_LABELS,
  LEVEL_LABELS,
  type PublicAthlete,
  type SponsorshipUpdateEntry,
} from "@/lib/types";


/**
 * Per-athlete metadata, and the point where the indexing policy is enforced.
 *
 * `isIndexableAthlete` returns false for anyone under 18 — see the long note in lib/seo.ts.
 * The profile still renders in full for every human visitor; only crawlers are excluded.
 * The same predicate gates sitemap.ts, so the two can never disagree.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const res = await apiServer<{ data: PublicAthlete }>(`/api/athletes/${id}`);
  if (!res) return { title: "Athlete not found", robots: { index: false, follow: false } };

  const p = res.data;
  const indexable = isIndexableAthlete(p);
  const sport = p.sport?.name ?? "Athlete";
  const where = p.locationLabel ? ` from ${p.locationLabel}` : "";
  const need = p.requests?.find((r) => r.status !== "CLOSED");

  const description = need
    ? `${p.name}, ${sport.toLowerCase()}${where}, needs ${formatPaise(need.totalEstimatedPaise)} for ${need.title.toLowerCase()}. Fund one specific item and follow the receipts on khelkhud.`
    : `${p.name} is a ${sport.toLowerCase()} athlete${where} on khelkhud. See their achievements, requests and sponsorship history.`;

  return {
    title: `${p.name} — ${sport}`,
    description,
    alternates: { canonical: `/athletes/${id}` },
    robots: indexable ? undefined : { index: false, follow: false },
    openGraph: {
      type: "profile",
      title: `${p.name} — ${sport} | khelkhud`,
      description,
      url: absoluteUrl(`/athletes/${id}`),
    },
  };
}

export default async function AthletePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [res, updatesRes] = await Promise.all([
    apiServer<{ data: PublicAthlete }>(`/api/athletes/${id}`),
    apiServer<{ data: SponsorshipUpdateEntry[] }>(`/api/athletes/${id}/updates`),
  ]);
  if (!res) notFound();
  const p = res.data;
  const updates = updatesRes?.data ?? [];
  const photo = profilePhotoUrl(p.photoKey) ?? p.avatarUrl;

  const indexable = isIndexableAthlete(p);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      {/* Structured data only where indexing is permitted. Emitting a Person entity for a
          child — name, sport, locality, funding need — is the same disclosure the noindex
          above is there to prevent, just in a format machines read more eagerly. */}
      {indexable ? (
        <>
          <BreadcrumbJsonLd
            items={[
              { name: "khelkhud", path: "/" },
              { name: "Athletes", path: "/athletes" },
              { name: p.name, path: `/athletes/${p.id}` },
            ]}
          />
          <JsonLd
            schema={{
              "@context": "https://schema.org",
              "@type": "Person",
              "@id": `${SITE_URL}/athletes/${p.id}#person`,
              name: p.name,
              // No birthDate and no age, even for adults: precise enough to be useful to
              // nobody except someone building a profile of them.
              ...(p.sport ? { jobTitle: `${p.sport.name} athlete` } : {}),
              ...(p.locationLabel
                ? { homeLocation: { "@type": "Place", name: p.locationLabel } }
                : {}),
              ...(p.academyName
                ? { affiliation: { "@type": "SportsOrganization", name: p.academyName } }
                : {}),
              subjectOf: { "@id": `${SITE_URL}/#org` },
            }}
          />
        </>
      ) : null}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="size-24">
            {photo ? <AvatarImage src={photo} alt={p.name} /> : null}
            <AvatarFallback className="text-2xl">{p.name[0]}</AvatarFallback>
          </Avatar>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{p.name}</h1>
              {p.verificationStatus === "VERIFIED" ? (
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">✓ Verified</Badge>
              ) : (
                <Badge variant="secondary">Pending verification</Badge>
              )}
            </div>
            <p className="mt-1 text-muted-foreground">
              {[
                p.sport?.name,
                p.locationLabel,
                p.age ? `${p.age} yrs` : null,
                p.category ? CATEGORY_LABELS[p.category] : null,
                p.experienceLevel ? `${LEVEL_LABELS[p.experienceLevel]} level` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {p.academyName || p.coachName ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {[p.academyName, p.coachName ? `Coach: ${p.coachName}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
          </div>
        </div>
        <Button asChild size="lg">
          <Link href={`/sponsor/${p.id}`}>Sponsor this athlete</Link>
        </Button>
      </div>

      {p.bio ? (
        <>
          <Separator className="my-6" />
          <section>
            <h2 className="text-lg font-semibold">About</h2>
            <p className="mt-2 whitespace-pre-line text-muted-foreground">{p.bio}</p>
          </section>
        </>
      ) : null}

      {p.requests.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Sponsorship requests</h2>
          <div className="mt-3 grid gap-4">
            {p.requests.map((r) => {
              const pct =
                r.totalEstimatedPaise > 0
                  ? Math.min(100, Math.round((r.raisedAmountPaise / r.totalEstimatedPaise) * 100))
                  : 0;
              return (
                <Card key={r.id}>
                  <CardHeader>
                    <CardTitle className="text-base">{r.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    {r.description ? (
                      <p className="text-sm text-muted-foreground">{r.description}</p>
                    ) : null}
                    <div>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="font-medium">
                          {formatPaise(r.raisedAmountPaise)} / {formatPaise(r.totalEstimatedPaise)}{" "}
                          sponsored
                        </span>
                        <span className="text-muted-foreground">{pct}%</span>
                      </div>
                      <Progress value={pct} />
                    </div>
                    {r.breakdown && r.breakdown.length > 0 ? (
                      <ul className="grid gap-1 text-sm text-muted-foreground">
                        {r.breakdown.map((b, i) => (
                          <li key={i} className="flex justify-between">
                            <span>{b.label}</span>
                            <span>{formatPaise(b.amountPaise)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}

      {p.achievements.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Achievements</h2>
          <div className="mt-3 grid gap-3">
            {p.achievements.map((a) => (
              <Card key={a.id}>
                <CardContent className="pt-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{a.title}</span>
                    {a.level ? <Badge variant="secondary">{LEVEL_LABELS[a.level]}</Badge> : null}
                    {a.year ? (
                      <span className="text-sm text-muted-foreground">{a.year}</span>
                    ) : null}
                  </div>
                  {a.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {updates.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Updates</h2>
          <div className="mt-3 grid gap-4">
            {updates.map((u) => (
              <Card key={u.id}>
                <CardContent className="pt-6">
                  <p className="font-medium">{u.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{u.body}</p>
                  {u.attachments.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {u.attachments.map((att) => (
                        <a
                          key={att.id}
                          href={documentUrl(att.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs underline"
                        >
                          📎 {att.fileName}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {p.events.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Events</h2>
          <div className="mt-3 grid gap-3">
            {p.events.map((ev) => (
              <Card key={ev.id}>
                <CardContent className="flex items-center justify-between gap-4 pt-6">
                  <div>
                    <span className="font-medium">{ev.name}</span>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[
                        ev.date ? new Date(ev.date).toLocaleDateString("en-IN") : null,
                        ev.venue,
                        ev.estimatedExpensePaise
                          ? `Est. expenses ${formatPaise(ev.estimatedExpensePaise)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {ev.isUpcoming ? <Badge>Upcoming</Badge> : <Badge variant="secondary">Past</Badge>}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
