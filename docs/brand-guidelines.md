# khelkhud — Brand Guidelines

**"First Light"** — the visual system for khelkhud.

This document is the **source of truth**. When a colour, font, radius or rule changes, it
changes *here first*, then in `packages/theme/src/tokens.ts`, and never the other way round.
No app may hardcode a colour, font or radius — if a value is missing, add it to this doc,
then to the token file. (Enforced at review; see `packages/theme/README.md`.)

---

## 1. The idea

> **The ground is awake before the country is.**

Every athlete on this platform was already training before anyone offered to help. They ran
at 5:30am on a district ground with a borrowed pair of spikes. The talent was never the
missing piece — the resources were.

khelkhud exists to close that gap: to make Telangana, and eventually India, a healthy
sporting population by connecting **potential** that already exists to **resources** that
already exist, and then proving — line by line, receipt by receipt — where the money went.

So the visual system is not a charity appeal and not a fintech dashboard. It is **the
moment light reaches someone who was already working in the dark.** We are not the hero of
this story. The athlete was there first; we turned the lights on.

### What this means in practice

| Do | Don't |
|---|---|
| Show the athlete mid-effort, before the medal | Show pity, poverty framing, or outstretched hands |
| Let the sponsor see the receipt | Ask the sponsor to "give" without accounting |
| Warm, human, specific ("Sai, 16, javelin, Nizamabad") | Generic ("support underprivileged youth") |
| Dark → light as the page progresses | Flat white pages with a coloured button |
| Marigold used once per view, as a signal | Marigold as a background fill |

### Voice

Plain, warm, specific, unsentimental. Short sentences. Real numbers. Never "empower",
"upliftment", "changemaker", "give back", or "journey" as a noun. Name the sport, the
district, the amount, the deadline. Sentence case for headings; the wordmark is always
lowercase `khelkhud`.

---

## 2. The scroll arc

The public site is staged as **one morning**. This is the system's signature move and the
reason the palette is ordered the way it is.

```
  Predawn  ───────────────────────────────────────►  Full day
  #0B0F20      #141B34      #E8873A      #FBF7F0
  nightfall    predawn      marigold     cream

  hero         the gap      the moment   the proof
  (dark)       (dark)       (accent)     (light)
```

A visitor scrolls from night into day. Sections physically brighten. By the transparency
band the page is cream and the athlete is competing. Never break the arc by putting a
cream section above a predawn one in the middle of a page.

**The one permitted exception is the close.** The final CTA band and the footer return to
`predawn` and `nightfall` — the day ends, and tomorrow at 5am someone is on the ground
again. That is the cycle the whole product exists inside, so the page is allowed to say
it. Closing dark is a deliberate return, not a broken arc; anywhere else it is a bug.

---

## 3. Colour

### Brand DNA

| Token | Hex | Role |
|---|---|---|
| `nightfall` | `#0B0F20` | The darkest surface. Top of the hero, footer. Use sparingly — it is the 5am sky. |
| `predawn` | `#141B34` | Primary dark surface. Indigo, not black. All full-bleed dark bands. |
| `predawnLift` | `#1E2745` | Raised panels on a predawn surface (cards, bordered boxes). |
| `marigold` | `#E8873A` | **The accent.** Sunrise saffron. A signal, not a fill — at most once or twice per view. |
| `marigoldLight` | `#F2A863` | Marigold on dark surfaces, where the base tone loses legibility. |
| `ground` | `#2F5D3A` | Maidan green. Verified states, completed allocations, success. |
| `clay` | `#A83A2B` | Rejected / failed. Restrained brick, never fire-engine red. |
| `cream` | `#FBF7F0` | The light canvas. Warm, never `#FFFFFF`. |
| `cream2` | `#F3EDE2` | Secondary panels and subtle contrast on cream. |
| `ink` | `#1C2333` | Headlines and primary text on cream. Softer than predawn, never pure black. |
| `slate` | `#55607A` | Body copy on cream, captions, secondary text. |
| `sweat` | `#6B7280` | Cool grey. Muted text, placeholders, disabled. |
| `borderWarm` | `#E7DFD1` | 1px rules on cream. Derived. |
| `borderDark` | `rgba(251,247,240,0.14)` | 1px rules on predawn. Derived. |

**Marigold discipline.** The whole system holds together because the accent is rationed.
One primary CTA, or one active state, or one progress fill per viewport — not all three.
If a screen needs a second emphasis, use `ink` weight or `ground`, not more marigold.

### Two systems

The brand runs two connected systems. **Never mix them.**

**`firstlight`** — everything a sponsor or athlete sees in public: landing, discovery,
athlete profiles, checkout, login, onboarding. Warm cream canvas, indigo ink, marigold
jewel, dawn photography. Emotional and premium.

**`app`** — dashboards and admin only. Calm, dense, functional. A cool-neutral canvas so
that *data* is the colour rather than the chrome. Predawn carries over as the anchor;
**cream does not**. Marigold survives only as a thin active-state highlight.

| Token | Hex | Role |
|---|---|---|
| `app.background` | `#F7F8FA` | Workspace canvas |
| `app.surface` | `#FFFFFF` | Cards, tables, panels |
| `app.rowHover` | `#EFF2F6` | Table hover, row separation |
| `app.border` | `#E2E7EF` | 1px borders — borders over shadows, always |
| `app.anchor` | `#141B34` | Sidebar, top bar, primary buttons, headings |
| `app.accent` | `#E8873A` | Active-nav indicator, selected state, links |
| `app.textPrimary` | `#1A2233` | Body |
| `app.textSecondary` | `#5A6579` | Labels |
| `app.textMuted` | `#8A94A6` | Placeholders, disabled |

### Status semantics

Nine domain statuses map onto five semantic colours so an operator can parse a queue at a
glance without the screen shouting.

| Semantic | Hex | Statuses |
|---|---|---|
| `neutral` | `#6B7280` | `PENDING`, `CREATED`, `NOT_STARTED`, `PLANNED`, `OPEN` |
| `inProgress` | `#C57B1E` | `IN_PROGRESS`, `PARTIALLY_FUNDED`, `PURCHASED`, `ACTIVE` |
| `attention` | `#B45309` | `INFO_REQUESTED` |
| `success` | `#2F5D3A` | `VERIFIED`, `PAID`, `COMPLETED`, `FULLY_FUNDED` |
| `failure` | `#A83A2B` | `REJECTED`, `FAILED`, `CANCELLED` |

`REFUNDED`, `CLOSED` and `ARCHIVED` render muted (`#8A94A6`) — parked, not failed.

---

## 4. Typography

| Role | Family | Notes |
|---|---|---|
| Display | **Bricolage Grotesque** | Headlines, the wordmark, pull quotes. Humanist and slightly imperfect — it has the quality of something made by a person, which is the whole point. Variable: use optical size and width. |
| Body / UI | **Inter** | All body copy, labels, forms, tables. |
| Figures | Inter, `tnum` | Amounts and counts use tabular numerals so columns align. **Every rupee figure on the site is tabular.** |
| Code | system mono stack | Sponsorship codes, IDs. No webfont download. |

**Rules**

- Headlines are **sentence case**, never Title Case, never ALL CAPS.
- Eyebrows (the small label above a heading) are the one exception: uppercase, `0.28em`
  tracking, `11px`, in `marigold` on dark or `slate` on cream.
- Display type gets tight leading (`1.05–1.15`) at large sizes. Body copy gets `1.65`.
- Never set Bricolage below 18px — it is a display face and gets muddy.
- Maximum measure for body copy: `68ch`.

**Scale** (fluid, `clamp()`-driven — see `tokens.ts`)

| Step | Size | Use |
|---|---|---|
| `display` | `clamp(2.6rem, 6vw, 5.25rem)` | Hero headline only |
| `h1` | `clamp(2rem, 4vw, 3.25rem)` | Section headlines |
| `h2` | `clamp(1.5rem, 2.5vw, 2.15rem)` | Subsection |
| `h3` | `1.3rem` | Card titles |
| `body` | `1rem` | Default |
| `small` | `0.875rem` | Captions, meta |
| `eyebrow` | `0.6875rem` | Uppercase labels |

---

## 5. Shape, depth and motion

**Radius** — soft but not bubbly. Cards `14px`, controls `10px`, chips `999px`, images `4px`
(photographs stay nearly square; roundness reads as a UI element, and these are people).

**Depth** — this system prefers **light over shadow**. On cream, use 1px `borderWarm` rules.
On predawn, use `predawnLift` panels with a hairline border. The only real shadows are the
long, low, warm ones that suggest early sun:
`0 24px 60px -20px rgba(20,27,52,0.45)`.

**The horizon motif** — funding progress never renders as a generic bar. It renders as a
horizon: a thin line with light filling from the left in a marigold gradient, with the
figure set in tabular numerals directly above it. This is the one piece of chrome that
appears on both the landing page and inside the product, and it is what makes a khelkhud
screenshot recognisable.

**Motion** — reveal on scroll (`opacity` + 28px rise, 700ms ease), used once per section,
never nested. Everything respects `prefers-reduced-motion: reduce`, which disables reveals
and the dawn gradient animation entirely. No parallax. No auto-playing carousels.

---

## 6. Imagery

Full-bleed photography of real athletes, shot in the hour around sunrise wherever
possible: long shadows, warm rim light, visible effort, ordinary grounds. Faces before
equipment. Wide before tight.

**Scrims are mandatory** over any photograph carrying text — a `predawn` gradient at the
edge the text sits on, so contrast never depends on the photo. The scrim tokens live in
`tokens.ts` (`scrim.top`, `scrim.bottom`, `scrim.full`).

Until real pilot photography exists, the site ships **generated dawn compositions** —
layered CSS gradients and SVG horizon/silhouette art built from these tokens. They are
designed to be swapped, not lived with. Every placement is marked in code with a
`PHOTOGRAPHY:` comment describing the shot it is waiting for.

Never: stock photos of Western athletes, medal-podium clip art, handshake-over-a-cheque,
or anything with a lens flare.

---

## 7. The wordmark

Always lowercase: **`khelkhud`**. Set in Bricolage Grotesque, weight 700, tracking `-0.03em`.
The `khel` is `ink` (or `cream` on dark); the `khud` is `marigold`. No logo mark, no ball,
no torch, no swoosh — the two-tone wordmark is the identity.

Tagline: **Talent is everywhere. Support isn't.**

Never: uppercase, camelCase, a space, or a hyphen between the halves.
