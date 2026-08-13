import Link from "next/link";
import { foundation } from "@khelkhud/theme";
import { Wordmark } from "@/components/wordmark";

// Night again. The footer closing on nightfall is the permitted return in the scroll arc
// (brand doc §2): the day ends, and tomorrow at 5am someone is on the ground again.

const COLUMNS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: "Sponsor",
    links: [
      { label: "Find an athlete", href: "/athletes" },
      { label: "How tracking works", href: "/#proof" },
      { label: "Sponsor sign-in", href: "/login" },
    ],
  },
  {
    heading: "Athletes",
    links: [
      { label: "Create your profile", href: "/login" },
      { label: "What you'll need", href: "/#athletes" },
      { label: "Post a request", href: "/dashboard/athlete/requests" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="bg-nightfall text-cream/70">
      <div className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="grid gap-12 sm:grid-cols-[1.6fr_1fr_1fr]">
          <div className="max-w-sm">
            <Link href="/" className="inline-block">
              <Wordmark tone="dark" className="text-2xl" />
            </Link>
            <p className="mt-4 font-display text-lg leading-snug text-cream">
              Talent is everywhere. Support isn&rsquo;t.
            </p>
            <p className="mt-4 text-sm leading-relaxed">
              Closing the gap between what an athlete in Telangana can do and what they can
              afford &mdash; one specific request, one receipt, at a time.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <p className="eyebrow text-marigold">{col.heading}</p>
              <ul className="mt-4 space-y-3 text-sm">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="transition-colors hover:text-cream">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="rule-fade my-10" />

        <div className="flex flex-col gap-3 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {new Date().getFullYear()} khelkhud. Hyderabad, Telangana.
            <span className="mt-1 block text-cream/45 sm:mt-0 sm:ml-2 sm:inline">
              {foundation.prefix}{" "}
              <span className="text-cream/70">{foundation.name}</span>.
            </span>
          </p>
          <p className="text-cream/45">
            Payments by Razorpay. Every sponsorship is receipted and traceable.
          </p>
        </div>
      </div>
    </footer>
  );
}
