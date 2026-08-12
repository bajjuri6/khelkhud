import { cn } from "@/lib/utils";

/**
 * The identity (brand doc §7). Always lowercase, Bricolage Grotesque 700, tight tracking,
 * `khel` in ink (or cream on dark) and `khud` in marigold. There is no logo mark — the
 * two-tone wordmark is the whole identity, so it is a component rather than a string, and
 * nobody gets to hand-roll the two halves in a header somewhere.
 */
export function Wordmark({
  tone = "light",
  className,
}: {
  /** `light` = on cream surfaces. `dark` = on predawn/nightfall surfaces. */
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-display font-bold tracking-[-0.03em] lowercase",
        tone === "dark" ? "text-cream" : "text-ink",
        className,
      )}
    >
      khel<span className="text-marigold">khud</span>
    </span>
  );
}
