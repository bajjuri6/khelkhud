import { cn } from "@/lib/utils";

// The hero artwork: a track in perspective at first light, the sun cresting the vanishing
// point, one runner already out there.
//
// PHOTOGRAPHY: this composition is a stand-in for the real shot — a wide, low frame of a
// district ground at sunrise, athlete mid-stride in silhouette, long shadow toward camera.
// When pilot photography exists, replace this component's usage in the hero with a
// full-bleed <Image> plus `.scrim-bottom`; keep the sun/horizon tokens for the scrim so the
// section's colour temperature does not shift.
//
// Geometry is deliberate rather than decorative: every lane converges on the sun, because
// that is the argument the page is making.

const HORIZON = 560;
const VANISH_X = 720;

// There is deliberately NO figure in this composition.
//
// Two attempts were made — a small distant mark and a larger backlit one — and both read
// as a stick figure rather than an athlete. A drawn human at this fidelity actively
// cheapens the page, and the geometry alone (every lane converging on the sunrise) already
// carries the argument. The athlete arrives when the photography does; see the
// PHOTOGRAPHY note above and in the hero section of app/page.tsx.

export function DawnTrack({ className }: { className?: string }) {
  // Lanes fan out from the vanishing point to the bottom edge. Index 0 is the centre lane.
  const lanes = [-4, -3, -2, -1, 0, 1, 2, 3, 4];

  // Distance ticks: spaced by a squared falloff so they crowd near the horizon the way
  // real perspective does, instead of sitting on an even ladder.
  const ticks = [0.1, 0.24, 0.42, 0.63, 0.86];

  return (
    <svg
      viewBox="0 0 1440 820"
      preserveAspectRatio="xMidYMax slice"
      className={cn("h-full w-full", className)}
      aria-hidden
      focusable="false"
    >
      <defs>
        <radialGradient id="kk-sunglow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--kk-marigold)" stopOpacity="0.55" />
          <stop offset="42%" stopColor="var(--kk-marigold)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--kk-marigold)" stopOpacity="0" />
        </radialGradient>
        {/* Only the top ~60px of the disc clears the horizon, so the warm stops have to sit
            near the TOP of the gradient — a pale-to-warm ramp showed only its pale end and
            read as a grey moon. */}
        <linearGradient id="kk-sun" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F9C68C" />
          <stop offset="38%" stopColor="#FFDCAD" />
          <stop offset="100%" stopColor="var(--kk-marigold)" />
        </linearGradient>
        <linearGradient id="kk-horizonline" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--kk-marigold)" stopOpacity="0" />
          <stop offset="30%" stopColor="var(--kk-marigold)" stopOpacity="0.55" />
          <stop offset="50%" stopColor="#FFD9A8" stopOpacity="0.9" />
          <stop offset="70%" stopColor="var(--kk-marigold)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--kk-marigold)" stopOpacity="0" />
        </linearGradient>
        {/* Lanes fade as they approach the viewer so the bottom of the hero stays quiet
            enough to carry the cover furniture. */}
        <linearGradient id="kk-lane" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--kk-marigold-light)" stopOpacity="0.5" />
          <stop offset="45%" stopColor="var(--kk-marigold)" stopOpacity="0.16" />
          <stop offset="100%" stopColor="var(--kk-marigold)" stopOpacity="0.03" />
        </linearGradient>
        {/* Everything below the horizon is ground; clip the track so no lane leaks into sky. */}
        <clipPath id="kk-ground">
          <rect x="0" y={HORIZON} width="1440" height={820 - HORIZON} />
        </clipPath>
        <clipPath id="kk-sky">
          <rect x="0" y="0" width="1440" height={HORIZON} />
        </clipPath>
      </defs>

      {/* Stars, thinning toward the horizon — the night that is about to end. */}
      <g fill="#FBF7F0">
        {[
          [148, 92, 1.6, 0.5], [310, 168, 1.1, 0.32], [452, 64, 1.4, 0.42],
          [598, 210, 1, 0.24], [812, 118, 1.5, 0.46], [968, 62, 1.2, 0.38],
          [1094, 196, 1, 0.22], [1256, 108, 1.7, 0.5], [1372, 244, 1, 0.18],
          [86, 268, 1.2, 0.22], [690, 44, 1.3, 0.4], [1180, 330, 0.9, 0.12],
          [402, 320, 0.9, 0.13], [890, 288, 1, 0.16],
        ].map(([cx, cy, r, o], i) => (
          <circle key={i} cx={cx} cy={cy} r={r} opacity={o} />
        ))}
      </g>

      {/* Haze sitting on the ground, softening where sky meets track. Drawn BEFORE the sun
          — painted over it, it desaturated the disc to a flat grey. */}
      <rect x="0" y={HORIZON - 26} width="1440" height="72" fill="var(--kk-predawn)" opacity="0.28" />

      {/* The sun and its glow, cresting the horizon. */}
      <g clipPath="url(#kk-sky)">
        <ellipse cx={VANISH_X} cy={HORIZON} rx="620" ry="380" fill="url(#kk-sunglow)" />
        <circle
          cx={VANISH_X}
          cy={HORIZON + 26}
          r="86"
          fill="url(#kk-sun)"
          className="dawn-rise"
          style={{ transformOrigin: `${VANISH_X}px ${HORIZON}px` }}
        />
      </g>

      {/* The horizon itself. */}
      <rect x="0" y={HORIZON} width="1440" height="1.5" fill="url(#kk-horizonline)" />

      <g clipPath="url(#kk-ground)">
        {/* Lane lines, all converging on the sun. */}
        {lanes.map((i) => (
          <path
            key={i}
            d={`M ${VANISH_X + i * 22} ${HORIZON + 2} L ${VANISH_X + i * 340} 830`}
            stroke="url(#kk-lane)"
            strokeWidth={2.5}
            fill="none"
          />
        ))}
        {/* Distance ticks across the outermost lanes. */}
        {ticks.map((t) => {
          const y = HORIZON + t * t * (830 - HORIZON) + t * 40;
          const spread = 22 + t * 1180;
          return (
            <rect
              key={t}
              x={VANISH_X - spread / 2}
              y={y}
              width={spread}
              height={1.2}
              fill="var(--kk-marigold)"
              opacity={0.16 - t * 0.1}
            />
          );
        })}
      </g>

    </svg>
  );
}
