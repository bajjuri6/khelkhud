import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AthleteCard, type AthleteCardData } from "@/components/athlete-card";
import { apiServer } from "@/lib/api-server";

const HOW_IT_WORKS = [
  {
    title: "Discover",
    text: "Find promising athletes by sport, location and what they need.",
  },
  {
    title: "Sponsor",
    text: "Support an athlete's specific requirement — equipment, fees, travel.",
  },
  {
    title: "Track",
    text: "See exactly how your money was used, with receipts and updates.",
  },
  {
    title: "Impact",
    text: "Follow the athlete's progress and celebrate their achievements.",
  },
];

export default async function HomePage() {
  const featuredRes = await apiServer<{ data: AthleteCardData[] }>("/api/players?pageSize=3");
  const featured = featuredRes?.data ?? [];

  return (
    <>
      <section className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-20 text-center sm:py-28">
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
          Support Talent. <span className="text-primary">Build Futures.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          Discover promising local athletes, support their journey, and see the impact of your
          sponsorship.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Button asChild size="lg">
            <Link href="/athletes">Find Athletes</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">Create Player Profile</Link>
          </Button>
        </div>
      </section>

      <section className="border-y bg-muted/40">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-16 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map((step, i) => (
            <div key={step.title}>
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                  {i + 1}
                </span>
                <h2 className="font-semibold">{step.title}</h2>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      {featured.length > 0 ? (
        <section className="mx-auto w-full max-w-6xl px-4 py-16">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">Athletes seeking support</h2>
            <Button asChild variant="ghost">
              <Link href="/athletes">View all →</Link>
            </Button>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((a) => (
              <AthleteCard key={a.id} athlete={a} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
