import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Horizon } from "@/components/horizon";
import { profilePhotoUrl } from "@/lib/upload";
import { CATEGORY_LABELS } from "@/lib/types";

export type AthleteCardData = {
  id: string;
  name: string;
  avatarUrl: string | null;
  photoKey: string | null;
  sport: { id: string; name: string } | null;
  category: string | null;
  locationLabel: string | null;
  verificationStatus: string;
  topAchievement: string | null;
  openRequest: {
    id: string;
    title: string;
    totalEstimatedPaise: number;
    raisedAmountPaise: number;
  } | null;
};

/**
 * The unit of the discovery surface. The whole card is one link — a card with a "View
 * profile" button inside it gives you two tap targets for one intent, and on mobile the
 * button is the smaller of the two.
 *
 * The request, not the athlete's face, is the bottom-anchored element: what someone
 * needs is the thing a sponsor is deciding about, and it must land in the same place on
 * every card in the grid so the row is scannable.
 */
export function AthleteCard({ athlete }: { athlete: AthleteCardData }) {
  const photo = profilePhotoUrl(athlete.photoKey) ?? athlete.avatarUrl;
  const req = athlete.openRequest;
  const meta = [
    athlete.sport?.name,
    athlete.category ? CATEGORY_LABELS[athlete.category] : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/athletes/${athlete.id}`}
      className="group flex h-full flex-col rounded-xl border border-border bg-card p-6 transition-all hover:-translate-y-0.5 hover:border-marigold/45 hover:shadow-lift focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {/* Nothing in this header truncates. In a three-up grid the display face at h3 clipped
          most real names to "Sneha Pa…", and a platform whose entire argument is that these
          are specific people cannot abbreviate them. Names wrap; the avatar is smaller to
          buy the width back. */}
      <div className="flex items-start gap-3.5">
        <Avatar className="size-12 shrink-0 rounded-md">
          {photo ? <AvatarImage src={photo} alt="" className="rounded-md" /> : null}
          <AvatarFallback className="rounded-md bg-cream-2 font-display text-lg text-ink">
            {athlete.name[0]}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex items-start gap-1.5">
            <span className="font-display text-[1.0625rem] font-semibold leading-snug">
              {athlete.name}
            </span>
            {athlete.verificationStatus === "VERIFIED" ? (
              <span
                title="Verified by khelkhud"
                aria-label="Verified"
                className="mt-0.5 shrink-0 text-ground"
              >
                <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden>
                  <path d="M8 0.8l1.9 1.4 2.3-.3.7 2.2 2 1.2-1 2.1 1 2.1-2 1.2-.7 2.2-2.3-.3L8 15.2l-1.9-1.4-2.3.3-.7-2.2-2-1.2 1-2.1-1-2.1 2-1.2.7-2.2 2.3.3L8 .8zm-.7 9.9l4-4-1.1-1.1-2.9 2.9-1.4-1.4L4.8 8.2l2.5 2.5z" />
                </svg>
              </span>
            ) : null}
          </div>
          {meta ? <p className="mt-0.5 text-sm text-muted-foreground">{meta}</p> : null}
          {/* The location is the one place truncation is acceptable: the API returns a
              three-level "City, District, State" label whose tail is the least useful part. */}
          {athlete.locationLabel ? (
            <p className="truncate text-xs text-sweat">{athlete.locationLabel}</p>
          ) : null}
        </div>
      </div>

      {athlete.topAchievement ? (
        <p className="mt-4 line-clamp-2 border-l-2 border-marigold/50 pl-3 text-sm leading-relaxed text-slate">
          {athlete.topAchievement}
        </p>
      ) : null}

      <div className="mt-6 flex-1" />

      {req ? (
        <Horizon
          raisedPaise={req.raisedAmountPaise}
          totalPaise={req.totalEstimatedPaise}
          label={req.title}
        />
      ) : (
        <p className="text-sm text-sweat">No open request right now</p>
      )}

      <span className="mt-5 text-sm font-medium text-foreground transition-colors group-hover:text-marigold">
        View profile <span aria-hidden>&rarr;</span>
      </span>
    </Link>
  );
}
