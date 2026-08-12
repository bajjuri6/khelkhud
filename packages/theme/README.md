# @khelkhud/theme

The **First Light** brand, as code.

`docs/brand-guidelines.md` is the source of truth. `src/tokens.ts` is its machine-readable
transcription. Everything else in the app reads from those two files and nothing else.

## The rule

> No app may hardcode a colour, font or radius.

If you find yourself typing a hex value, a font family, or a pixel radius inside
`apps/web`, stop: the value belongs in the brand doc, then in `tokens.ts`, then it reaches
you as a Tailwind utility. This is a review-blocker, and it is the only reason a design
system survives contact with a second contributor.

## Layout

```
src/tokens.ts       pure data — the brand. No imports. A mobile app would port this file alone.
src/css.ts          renders tokens into two shadcn/Tailwind v4 CSS contracts
src/status.ts       domain status -> colour + label, so no component writes its own ladder
src/generate-css.ts the build step
firstlight.css      GENERATED — public surfaces (:root)
app.css             GENERATED — dashboards/admin (.theme-app)
```

## Two systems, and why they are scoped

`firstlight.css` sets the shadcn variables on `:root`. `app.css` redefines the *same*
variable names under `.theme-app`. The dashboard and admin layouts wrap their subtree in
that class, so `bg-background` resolves to the cool workspace grey inside `/dashboard` and
`/admin`, and to warm cream everywhere else — from one set of components.

That makes the brand's never-mix-the-systems rule structural rather than something a
reviewer has to catch.

## Regenerating

```sh
pnpm --filter @khelkhud/theme build
```

Turbo runs this before the web build (`build` dependsOn `^build`). The `.css` outputs are
committed on purpose — a token diff is genuinely useful in review — but they are still
generated. Edit `tokens.ts`, never the CSS.

## Using it

```tsx
// brand utilities, minted by @theme in firstlight.css
<section className="bg-predawn text-cream">
<span className="text-marigold">

// shadcn contract, scope-aware
<div className="bg-background text-foreground border-border">

// motifs, via custom properties
<div style={{ background: 'var(--kk-dawn-sky)' }}>
<div style={{ background: 'var(--kk-horizon)' }}>   // the funding progress fill
```
