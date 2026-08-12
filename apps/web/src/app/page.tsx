import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-24 text-center">
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
      <div className="mt-20 grid w-full max-w-4xl grid-cols-2 gap-4 text-sm font-medium text-muted-foreground sm:grid-cols-4">
        {["Athlete", "Sponsorship", "Progress", "Achievement"].map((step, i) => (
          <div key={step} className="flex items-center justify-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              {i + 1}
            </span>
            {step}
          </div>
        ))}
      </div>
    </section>
  );
}
