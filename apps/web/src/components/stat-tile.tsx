/**
 * A single number on a dashboard. Borders over shadows, display face on the figure,
 * tabular numerals so a row of tiles keeps its baseline (brand doc §4/§5).
 */
export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  /** Optional one-line context under the figure — what the number is counting. */
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="eyebrow text-muted-foreground">{label}</p>
      <p className="mt-2.5 font-display text-3xl font-semibold leading-none" data-numeric>
        {value}
      </p>
      {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
