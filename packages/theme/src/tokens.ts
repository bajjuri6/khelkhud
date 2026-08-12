// khelkhud design tokens — "First Light". PURE DATA. No framework imports in this file.
//
// SOURCE OF TRUTH: docs/brand-guidelines.md. When a colour, font or radius changes it
// changes THERE first, then here — never the other way round. No app may hardcode a
// colour, font or radius; if a value is missing, add it to the doc, then to this file.
//
// The brand runs TWO connected systems (brand doc §3):
//   firstlight — warm, human, photographic. Everything a sponsor or athlete sees in
//                public: landing, discovery, athlete profiles, checkout, onboarding.
//   app        — calm, dense, functional. Dashboards and admin ONLY. Cool-neutral
//                canvas so data is the colour, not the chrome. Predawn carries over;
//                cream does NOT.
// Never mix the systems.
//
// A future mobile app ports THIS file and only this file. Keep it flat, pure data.

// ---- brand DNA --------------------------------------------------------------
export const brand = {
  nightfall: '#0B0F20', // the 5am sky — darkest surface, top of hero, footer
  predawn: '#141B34', // primary dark surface. Indigo, deliberately not black
  predawnLift: '#1E2745', // raised panels sitting on a predawn surface
  marigold: '#E8873A', // THE accent. A signal, not a fill — once or twice per view
  marigoldLight: '#F2A863', // marigold on dark, where the base tone loses legibility
  ground: '#2F5D3A', // maidan green — verified, completed, success
  clay: '#A83A2B', // rejected / failed. Restrained brick, never fire-engine
} as const;

// ---- firstlight / public system ---------------------------------------------
export const firstlight = {
  cream: '#FBF7F0', // the light canvas — warm, never #FFFFFF
  cream2: '#F3EDE2', // secondary panels, subtle contrast on cream
  ink: '#1C2333', // headlines and primary text on cream. Never pure black
  slate: '#55607A', // body copy on cream, captions
  sweat: '#6B7280', // muted text, placeholders, disabled
  border: '#E7DFD1', // derived — 1px rules on cream
  borderDark: 'rgba(251, 247, 240, 0.14)', // derived — 1px rules on predawn
} as const;

// ---- app / dashboard system --------------------------------------------------
export const app = {
  background: '#F7F8FA', // the workspace canvas
  surface: '#FFFFFF', // cards, tables, panels
  rowHover: '#EFF2F6', // table hover, row separation
  border: '#E2E7EF', // 1px borders — borders over shadows, always
  anchor: brand.predawn, // sidebar, top bar, primary buttons, headings
  accent: brand.marigold, // active-nav indicator, selected state — thin highlights only
  textPrimary: '#1A2233',
  textSecondary: '#5A6579',
  textMuted: '#8A94A6',
  sidebarHover: '#26314F', // derived — hover on the predawn sidebar
} as const;

// ---- status semantics --------------------------------------------------------
// Five semantic colours; every domain status maps onto one so a queue is parseable
// at a glance without the screen shouting (brand doc §3).
export const statusSemantic = {
  neutral: '#6B7280',
  inProgress: '#C57B1E',
  attention: '#B45309',
  success: brand.ground,
  failure: brand.clay,
  muted: '#8A94A6', // parked, not failed
} as const;

export const statusColors: Record<string, string> = {
  // VerificationStatus
  PENDING: statusSemantic.neutral,
  VERIFIED: statusSemantic.success,
  REJECTED: statusSemantic.failure,
  INFO_REQUESTED: statusSemantic.attention,
  // RequirementStatus
  OPEN: statusSemantic.neutral,
  PARTIALLY_FUNDED: statusSemantic.inProgress,
  FULLY_FUNDED: statusSemantic.success,
  CLOSED: statusSemantic.muted,
  // SponsorshipStatus
  ACTIVE: statusSemantic.inProgress,
  COMPLETED: statusSemantic.success,
  CANCELLED: statusSemantic.failure,
  // PaymentStatus
  CREATED: statusSemantic.neutral,
  PAID: statusSemantic.success,
  FAILED: statusSemantic.failure,
  REFUNDED: statusSemantic.muted,
  // UtilizationStatus / AllocationStatus
  NOT_STARTED: statusSemantic.neutral,
  IN_PROGRESS: statusSemantic.inProgress,
  PLANNED: statusSemantic.neutral,
  PURCHASED: statusSemantic.inProgress,
};

// ---- typography ---------------------------------------------------------------
// Bricolage Grotesque is the display face — humanist and slightly imperfect, which is
// the point: it reads as made by a person. NEVER set it below 18px (brand doc §4).
// Every rupee figure on the site uses tabular numerals.
export const fonts = {
  display: "'Bricolage Grotesque', 'Inter', system-ui, sans-serif",
  sans: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
} as const;

// Fluid scale. Display is hero-headline only — one per page.
export const type = {
  display: 'clamp(2.6rem, 6vw, 5.25rem)',
  h1: 'clamp(2rem, 4vw, 3.25rem)',
  h2: 'clamp(1.5rem, 2.5vw, 2.15rem)',
  h3: '1.3rem',
  body: '1rem',
  small: '0.875rem',
  eyebrow: '0.6875rem',
} as const;

export const leading = {
  display: '1.05',
  heading: '1.15',
  body: '1.65',
} as const;

// ---- shape ---------------------------------------------------------------------
// Photographs stay nearly square — roundness reads as a UI element, and these are people.
export const radius = {
  card: 14,
  control: 10,
  chip: 999,
  image: 4,
} as const;

// This system prefers light over shadow. The only real shadows are the long, low, warm
// ones that suggest early sun.
export const shadow = {
  long: '0 24px 60px -20px rgba(20, 27, 52, 0.45)',
  lift: '0 2px 8px -2px rgba(20, 27, 52, 0.14)',
} as const;

// ---- the dawn motifs -------------------------------------------------------------
// Scrims are MANDATORY over any photograph carrying text, so contrast never depends on
// the photo (brand doc §6).
export const scrim = {
  top: `linear-gradient(to bottom, ${brand.nightfall}E6 0%, ${brand.predawn}66 45%, transparent 100%)`,
  bottom: `linear-gradient(to top, ${brand.predawn} 0%, ${brand.predawn}B3 40%, transparent 100%)`,
  full: `linear-gradient(to bottom, ${brand.nightfall}F2 0%, ${brand.predawn}D9 100%)`,
} as const;

// The signature background: night sky above, first light gathering at the horizon.
// `sky` is the hero; `wash` is the softer version for mid-page dark bands.
export const dawn = {
  sky: [
    `radial-gradient(130% 78% at 50% 104%, ${brand.marigold}45 0%, ${brand.marigold}17 28%, transparent 60%)`,
    `radial-gradient(90% 55% at 78% 8%, ${brand.predawnLift}80 0%, transparent 62%)`,
    `linear-gradient(to bottom, ${brand.nightfall} 0%, ${brand.predawn} 100%)`,
  ].join(', '),
  // `wash` BRIGHTENS downward. Every mid-page dark band must, or the scroll arc reverses
  // and the section boundaries read as seams instead of as time passing. It ends on
  // predawnLift so the section below can start there and the join is invisible.
  wash: [
    `radial-gradient(120% 90% at 14% 108%, ${brand.marigold}22 0%, transparent 56%)`,
    `linear-gradient(to bottom, ${brand.predawn} 0%, #18203C 55%, ${brand.predawnLift} 100%)`,
  ].join(', '),
  // `dusk` is the mirror image, and the ONLY band allowed to darken: the closing CTA,
  // handing off to the nightfall footer (brand doc §2).
  dusk: [
    `radial-gradient(110% 80% at 20% 0%, ${brand.marigold}1A 0%, transparent 52%)`,
    `linear-gradient(to bottom, ${brand.predawn} 0%, ${brand.nightfall} 100%)`,
  ].join(', '),
  // The sunrise band itself: starts where `wash` left off, then the sun floods it.
  firstLight: [
    `radial-gradient(90% 130% at 50% 122%, ${brand.marigold} 0%, ${brand.marigold}38 32%, transparent 66%)`,
    `linear-gradient(to bottom, ${brand.predawnLift} 0%, ${brand.predawn} 62%)`,
  ].join(', '),
  // The horizon motif — funding progress never renders as a generic bar (brand doc §5).
  horizon: `linear-gradient(90deg, ${brand.marigold} 0%, ${brand.marigoldLight} 100%)`,
  horizonGlow: `0 0 18px -2px ${brand.marigold}99`,
} as const;

// ---- identity ---------------------------------------------------------------------
export const wordmark = 'khelkhud'; // always lowercase, `khel` in ink, `khud` in marigold
export const tagline = "Talent is everywhere. Support isn't.";
export const mission =
  'Making Telangana — and eventually India — a sporting, healthy population by closing the gap between potential and resources.';
