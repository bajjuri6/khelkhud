import { formatPaise } from "@khelkhud/shared";
import { cn } from "@/lib/utils";

/**
 * The horizon — khelkhud's signature progress motif (brand doc §5). Funding never renders
 * as a generic bar: it renders as a line of light filling from the left, with the figures
 * set in tabular numerals directly above it.
 *
 * This is the one piece of chrome shared by the landing page and the product, and it is
 * what makes a khelkhud screenshot recognisable. Use it everywhere a requirement's funding
 * state is shown; do not reach for <Progress>.
 */
export function Horizon({
  raisedPaise,
  totalPaise,
  label,
  tone = "light",
  className,
}: {
  raisedPaise: number;
  totalPaise: number;
  /** Optional caption on the left of the figures row, e.g. the requirement title. */
  label?: string;
  /** `light` = on cream. `dark` = on predawn/nightfall surfaces. */
  tone?: "light" | "dark";
  className?: string;
}) {
  const pct =
    totalPaise > 0 ? Math.min(100, Math.round((raisedPaise / totalPaise) * 100)) : 0;
  const dark = tone === "dark";

  return (
    <div className={cn("w-full", className)}>
      {/* line-clamp-2, not truncate. Requirement titles are written by athletes and run
          long ("Season kit and tournament travel"); clipping to one line loses the noun
          that tells a sponsor what they would be paying for. */}
      {label ? (
        <p
          className={cn(
            "line-clamp-2 text-sm font-medium",
            dark ? "text-cream" : "text-foreground",
          )}
        >
          {label}
        </p>
      ) : null}
      <div
        data-numeric
        className={cn(
          "mt-1 flex items-baseline justify-between gap-3 text-sm",
          dark ? "text-cream/70" : "text-muted-foreground",
        )}
      >
        <span>
          <span className={cn("font-semibold", dark ? "text-cream" : "text-foreground")}>
            {formatPaise(raisedPaise)}
          </span>
          <span className="mx-1.5 opacity-50">of</span>
          {formatPaise(totalPaise)}
        </span>
        {/* The "funded" colour flips on dark surfaces: maidan green at full saturation is
            nearly invisible against predawn. */}
        <span
          className={cn(
            "tabular-nums",
            pct >= 100 && (dark ? "font-medium text-marigold-light" : "text-ground"),
          )}
        >
          {pct}%
        </span>
      </div>
      <div
        className={cn("horizon mt-2", dark ? "text-cream" : "text-ink")}
        style={{ "--horizon-pct": `${pct}%` } as React.CSSProperties}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ? `${label} funding progress` : "Funding progress"}
      />
    </div>
  );
}
