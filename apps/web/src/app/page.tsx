import Link from "next/link";
import { formatPaise } from "@khelkhud/shared";
import { Button } from "@/components/ui/button";
import { AthleteCard, type AthleteCardData } from "@/components/athlete-card";
import { DawnTrack } from "@/components/landing/dawn-track";
import { Horizon } from "@/components/horizon";
import { Reveal } from "@/components/reveal";
import { apiServer } from "@/lib/api-server";

// The landing page is staged as ONE MORNING (docs/brand-guidelines.md §2). The visitor
// scrolls out of night and into day: nightfall hero -> predawn thesis -> the marigold
// moment where someone says yes -> cream daylight for how it works, the receipts, and the
// athletes -> back to predawn for the close, because tomorrow at 5am she is there again.
//
// Do not insert a cream section above a predawn one anywhere except that final band. The
// arc is the design; breaking it is what made the previous version read as a template.
//
// The narrative uses ONE composite athlete — a javelin thrower from Nizamabad with an
// ₹18,400 requirement — carried from the hero through to the receipts, so the abstract
// claim ("we track every rupee") is answered by a concrete number the reader already met.
// She is explicitly labelled as illustrative wherever a figure is shown.

const TICKER = [
  "Athletics", "Kabaddi", "Boxing", "Badminton", "Wrestling", "Shooting",
  "Weightlifting", "Hockey", "Nizamabad", "Warangal", "Karimnagar", "Khammam",
  "Adilabad", "Mahbubnagar", "Hyderabad",
];

const STEPS = [
  {
    n: "01",
    title: "Discover",
    body: "Browse athletes by sport, district, age group and what they actually need. Every profile is checked by a person — ID, achievements, coach — before it goes live.",
  },
  {
    n: "02",
    title: "Sponsor",
    body: "Fund one specific line item, not a vague cause. ₹2,000 for a month of coaching is a real sponsorship here, and it goes to a named requirement.",
  },
  {
    n: "03",
    title: "Track",
    body: "Watch the money get spent. Each allocation moves from planned to purchased to completed, and the receipt is attached to the one it paid for.",
  },
  {
    n: "04",
    title: "Impact",
    body: "Get the athlete's own updates — the meet, the timing, the result, the photo. You will know whether it worked, which is the part nobody usually tells you.",
  },
];

// The worked example. Figures are illustrative and labelled as such on the page.
const LEDGER = [
  { label: "Competition javelin (700g)", paise: 780000, status: "COMPLETED" },
  { label: "Spikes, correct size", paise: 420000, status: "COMPLETED" },
  { label: "Coaching — 3 months", paise: 450000, status: "PURCHASED" },
  { label: "Travel to Nationals, Ranchi", paise: 190000, status: "PLANNED" },
];
const LEDGER_TOTAL = LEDGER.reduce((sum, row) => sum + row.paise, 0);

const STATUS_STYLE: Record<string, string> = {
  COMPLETED: "bg-ground/10 text-ground",
  PURCHASED: "bg-marigold/15 text-[#8A4E12]",
  PLANNED: "bg-sweat/12 text-slate",
};
const STATUS_LABEL: Record<string, string> = {
  COMPLETED: "Receipt filed",
  PURCHASED: "Purchased",
  PLANNED: "Planned",
};

export default async function HomePage() {
  const featuredRes = await apiServer<{ data: AthleteCardData[] }>("/api/players?pageSize=3");
  const featured = featuredRes?.data ?? [];

  return (
    <>
      {/* ── 05:12 · the hero ───────────────────────────────────────────────── */}
      <section className="dawn-sky relative isolate overflow-hidden">
        {/* PHOTOGRAPHY: swap DawnTrack for a full-bleed sunrise frame of a district ground
            when pilot photography exists. Keep `.scrim-bottom` so contrast never depends
            on the photo (brand doc §6). */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <DawnTrack />
        </div>
        {/* Scrim runs LEFT-to-right, not bottom-up. All the hero text is in the left
            column; a full-width bottom scrim also covered the sun and flattened it to a
            grey disc, which is the one thing in the composition that has to stay warm. */}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-nightfall/90 via-nightfall/45 to-transparent" />

        <div className="mx-auto flex min-h-[clamp(38rem,88svh,54rem)] w-full max-w-6xl flex-col px-6 pb-12 pt-28 sm:pt-32">
          <div className="max-w-3xl flex-1">
            <p className="eyebrow text-marigold-light">Telangana &middot; 5:12 am</p>
            <h1 className="mt-6 max-w-[15ch] text-display font-semibold text-cream [text-shadow:0_2px_28px_rgba(11,15,32,0.75)]">
              The ground is awake before the country is.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-cream/75">
              A sixteen-year-old in Nizamabad is finishing her fourth lap in spikes a size
              too small. She has been up since four. She is not waiting to be discovered
              &mdash; she is waiting for{" "}
              <span className="font-semibold text-cream" data-numeric>
                ₹18,400
              </span>
              .
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Button asChild size="hero" variant="accent">
                <Link href="/athletes">Find an athlete to back</Link>
              </Button>
              <Button asChild size="hero" variant="onDark" className="border">
                <Link href="/login">I&rsquo;m an athlete</Link>
              </Button>
            </div>
          </div>

          {/* Cover furniture — the three numbers that frame the whole argument. */}
          <div className="mt-16 grid max-w-3xl gap-6 sm:grid-cols-3">
            {[
              { k: "₹2,000", v: "is a real sponsorship here. Not a rounding error — a month of coaching." },
              { k: "100%", v: "of every sponsorship is itemised, and every item ends in a receipt." },
              { k: "33", v: "districts in Telangana. We start with all of them, not just the city." },
            ].map((s) => (
              <div key={s.k} className="border-t border-cream/15 pt-4">
                <p className="font-display text-2xl font-semibold text-cream" data-numeric>
                  {s.k}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-cream/55">{s.v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ticker — sports and districts, the breadth of the thing. */}
      <div className="border-y border-cream/10 bg-predawn py-4">
        {/* Wraps rather than truncating: at 1440px a single nowrap line loses the last
            three districts to an ellipsis, which is precisely the wrong impression. */}
        <ul className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-5 gap-y-1.5 px-6">
          {TICKER.map((item) => (
            <li key={item} className="eyebrow text-cream/40">
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* ── the gap · still dark ───────────────────────────────────────────── */}
      <section className="dawn-wash relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <Reveal>
            <p className="eyebrow text-marigold">The gap</p>
            <h2 className="mt-4 max-w-[18ch] text-h1 font-semibold text-cream">
              India does not have a talent problem.
            </h2>
          </Reveal>

          <Reveal delay={80}>
            <div className="mt-14 grid gap-12 border-t border-cream/12 pt-12 sm:grid-cols-2 sm:gap-20">
              <div>
                <p className="eyebrow text-cream/40">What there is plenty of</p>
                <p className="mt-4 font-display text-2xl leading-snug text-cream">Potential.</p>
                <p className="mt-4 max-w-md leading-relaxed text-cream/65">
                  Distributed evenly across every district, every income bracket, every
                  government school with a patch of ground behind it. It shows up at 5am
                  whether or not anyone is funding it.
                </p>
              </div>
              <div>
                <p className="eyebrow text-cream/40">What there isn&rsquo;t</p>
                <p className="mt-4 font-display text-2xl leading-snug text-marigold-light">
                  Resources.
                </p>
                <p className="mt-4 max-w-md leading-relaxed text-cream/65">
                  Which are not distributed evenly at all. A competition javelin costs more
                  than a month of household income in most of the districts our athletes
                  come from. Careers end over four-figure sums.
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <p className="mx-auto mt-20 max-w-3xl text-center font-display text-2xl leading-snug text-cream sm:text-3xl">
              khelkhud is not a fundraiser. It is the missing piece of infrastructure
              between the two.
            </p>
          </Reveal>

          {/* The requirement, itemised. The specificity is the argument. */}
          <Reveal delay={160}>
            <div className="mx-auto mt-16 max-w-2xl rounded-xl border border-cream/15 bg-predawn-lift/70 p-7 sm:p-9">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <p className="eyebrow text-marigold">One requirement</p>
                  <p className="mt-2 font-display text-xl text-cream">
                    Javelin, Under 19 &mdash; Nizamabad
                  </p>
                </div>
                <p className="text-sm text-cream/45">Nationals in 11 weeks</p>
              </div>
              <ul className="mt-7 space-y-3.5">
                {LEDGER.map((row) => (
                  <li
                    key={row.label}
                    className="flex items-baseline justify-between gap-4 border-b border-cream/10 pb-3.5 text-sm last:border-0"
                  >
                    <span className="text-cream/75">{row.label}</span>
                    <span className="shrink-0 font-medium text-cream" data-numeric>
                      {formatPaise(row.paise)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-7">
                <Horizon
                  raisedPaise={0}
                  totalPaise={LEDGER_TOTAL}
                  tone="dark"
                  label="Raised so far"
                />
              </div>
              <p className="mt-5 text-xs leading-relaxed text-cream/40">
                Illustrative example. Real requirements are written by the athlete and
                verified before they appear.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── first light · the marigold moment ──────────────────────────────── */}
      {/* Starts on predawnLift, exactly where `dawn-wash` above it ended, so the join is
          invisible and the sunrise reads as continuous rather than as a new section. */}
      <section className="dawn-first-light relative overflow-hidden">
        <div className="relative mx-auto max-w-3xl px-6 py-24 text-center sm:py-28">
          <Reveal>
            <p className="eyebrow text-cream/60">First light</p>
            <h2 className="mt-5 font-display text-h1 font-semibold text-cream">
              Then one person says yes.
            </h2>
            <p className="mx-auto mt-6 max-w-xl leading-relaxed text-cream/80">
              Fourteen minutes on a phone during a lunch break. Not a campaign, not a gala,
              not a form in triplicate &mdash; one sponsor picking one line item off one
              athlete&rsquo;s list and paying for it.
            </p>
            <div className="mx-auto mt-12 max-w-md">
              <Horizon
                raisedPaise={LEDGER_TOTAL}
                totalPaise={LEDGER_TOTAL}
                tone="dark"
                label="Fully funded"
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── daylight · how it works ────────────────────────────────────────── */}
      <section id="how-it-works" className="bg-cream-2">
        <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
          <Reveal>
            <p className="eyebrow text-slate">A sponsorship, end to end</p>
            <h2 className="mt-4 max-w-[20ch] text-h1 font-semibold">
              Four steps, and you can see all of them.
            </h2>
          </Reveal>
          <div className="mt-16 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <Reveal key={step.n} delay={i * 70}>
                <div className="border-t-2 border-ink/12 pt-5">
                  <p className="eyebrow text-marigold" data-numeric>
                    {step.n}
                  </p>
                  <h3 className="mt-3 font-display text-h3 font-semibold">{step.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate">{step.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── the proof · the receipts ───────────────────────────────────────── */}
      <section id="proof" className="bg-background">
        <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
          <div className="grid items-start gap-14 lg:grid-cols-[1fr_1.15fr] lg:gap-20">
            <Reveal>
              <p className="eyebrow text-slate">The proof</p>
              <h2 className="mt-4 text-h1 font-semibold">
                You will know where every rupee went.
              </h2>
              <p className="mt-6 max-w-md leading-relaxed text-slate">
                Most giving ends at the payment confirmation. Here it starts there. Your
                sponsorship is split into the items it was meant to buy, and each one moves
                through planned &rarr; purchased &rarr; completed with the receipt attached
                to it.
              </p>
              <p className="mt-4 max-w-md leading-relaxed text-slate">
                If an item stalls, you see that too. Transparency that only shows good news
                is marketing, not accounting.
              </p>
              <Button asChild size="hero" variant="accent" className="mt-9">
                <Link href="/athletes">Browse open requirements</Link>
              </Button>
            </Reveal>

            {/* The allocation ledger — the same ₹18,400 from the hero, now spent. */}
            <Reveal delay={90}>
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-long">
                <div className="flex items-baseline justify-between gap-4 border-b border-border px-6 py-5">
                  <div>
                    <p className="eyebrow text-slate">Sponsorship</p>
                    <p className="mt-1.5 font-mono text-sm text-foreground">KK-2026-0417</p>
                  </div>
                  <p className="font-display text-xl font-semibold" data-numeric>
                    {formatPaise(LEDGER_TOTAL)}
                  </p>
                </div>
                <ul>
                  {LEDGER.map((row) => (
                    <li
                      key={row.label}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-6 py-4 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{row.label}</p>
                        <span
                          className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[0.6875rem] font-medium ${STATUS_STYLE[row.status]}`}
                        >
                          {STATUS_LABEL[row.status]}
                        </span>
                      </div>
                      <p className="text-sm font-semibold" data-numeric>
                        {formatPaise(row.paise)}
                      </p>
                    </li>
                  ))}
                </ul>
                <div className="bg-cream-2 px-6 py-5">
                  <Horizon
                    raisedPaise={LEDGER.filter((r) => r.status === "COMPLETED").reduce(
                      (s, r) => s + r.paise,
                      0,
                    )}
                    totalPaise={LEDGER_TOTAL}
                    label="Spent and receipted"
                  />
                  <p className="mt-4 text-xs leading-relaxed text-sweat">
                    Illustrative. In a live sponsorship each row links to the uploaded
                    receipt and the athlete&rsquo;s update about it.
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── the athletes ───────────────────────────────────────────────────── */}
      {featured.length > 0 ? (
        <section className="border-y border-border bg-cream-2">
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
            <Reveal>
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <p className="eyebrow text-slate">Open right now</p>
                  <h2 className="mt-4 max-w-[18ch] text-h2 font-semibold">
                    Athletes waiting on one specific thing.
                  </h2>
                </div>
                <Button asChild variant="outline" size="lg">
                  <Link href="/athletes">See all athletes &rarr;</Link>
                </Button>
              </div>
            </Reveal>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((a, i) => (
                <Reveal key={a.id} delay={i * 70}>
                  <AthleteCard athlete={a} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ── for athletes ───────────────────────────────────────────────────── */}
      <section id="athletes" className="bg-background">
        <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
          <div className="grid gap-14 lg:grid-cols-[1fr_1fr] lg:gap-20">
            <Reveal>
              <p className="eyebrow text-slate">For athletes</p>
              <h2 className="mt-4 text-h1 font-semibold">
                If you&rsquo;re the one on the ground at five.
              </h2>
              <p className="mt-6 max-w-md leading-relaxed text-slate">
                You do not need a manager, a federation contact, or a viral video. You need
                a profile that is true, and a list of what is actually stopping you. Put a
                number on it. That is the whole ask.
              </p>
              <Button asChild size="hero" variant="accent" className="mt-9">
                <Link href="/login">Create your athlete profile</Link>
              </Button>
            </Reveal>
            <Reveal delay={90}>
              <ol className="space-y-7">
                {[
                  {
                    t: "Tell us who you are",
                    d: "Sport, age group, district, coach, and your achievements so far. Upload one ID proof and whatever certificates you have.",
                  },
                  {
                    t: "Get verified",
                    d: "A person reviews it. If something is missing we ask for it rather than rejecting you. Verified profiles are the only ones sponsors see.",
                  },
                  {
                    t: "Post what you need",
                    d: "Break it into real items with real prices — the shoes, the fees, the bus ticket. Vague asks do not get funded; itemised ones do.",
                  },
                  {
                    t: "Show what happened",
                    d: "Upload receipts as you spend, and post updates after the meet. Sponsors who see the result come back for the next requirement.",
                  },
                ].map((item, i) => (
                  <li key={item.t} className="flex gap-5 border-b border-border pb-7 last:border-0">
                    <span
                      className="mt-0.5 font-display text-lg font-semibold text-marigold"
                      data-numeric
                    >
                      0{i + 1}
                    </span>
                    <div>
                      <p className="font-display text-h3 font-semibold">{item.t}</p>
                      <p className="mt-2 text-sm leading-relaxed text-slate">{item.d}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── night again · the close ────────────────────────────────────────── */}
      <section className="dawn-dusk relative overflow-hidden">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center sm:py-32">
          <Reveal>
            <h2 className="font-display text-h1 font-semibold text-cream">
              Tomorrow morning, she will be on that ground again.
            </h2>
            <p className="mx-auto mt-6 max-w-xl leading-relaxed text-cream/70">
              That part is not in question and never was. Whether she is in shoes that fit
              is the part you can change.
            </p>
            <div className="mt-11 flex flex-wrap items-center justify-center gap-4">
              <Button asChild size="hero" variant="accent">
                <Link href="/athletes">Back an athlete</Link>
              </Button>
              <Button asChild size="hero" variant="onDark" className="border">
                <Link href="/login">I&rsquo;m an athlete</Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
