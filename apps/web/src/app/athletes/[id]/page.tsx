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
import { profilePhotoUrl } from "@/lib/upload";
import { CATEGORY_LABELS, LEVEL_LABELS, type PublicPlayer } from "@/lib/types";

export default async function AthletePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await apiServer<{ data: PublicPlayer }>(`/api/players/${id}`);
  if (!res) notFound();
  const p = res.data;
  const photo = profilePhotoUrl(p.photoKey) ?? p.avatarUrl;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
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

      {p.requirements.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Sponsorship requirements</h2>
          <div className="mt-3 grid gap-4">
            {p.requirements.map((r) => {
              const pct =
                r.totalAmountPaise > 0
                  ? Math.min(100, Math.round((r.raisedAmountPaise / r.totalAmountPaise) * 100))
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
                          {formatPaise(r.raisedAmountPaise)} / {formatPaise(r.totalAmountPaise)}{" "}
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
