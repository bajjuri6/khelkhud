import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",

        // ── brand variants ────────────────────────────────────────────────────
        // A flat fill with a hover that only swaps one colour reads as a wireframe. These
        // three carry an actual physical model: a warm top-lit gradient, a shadow that
        // grows on hover and collapses on press, and a hairline top highlight. Cheap in
        // CSS, and the difference between "styled" and "designed".

        // The marigold call to action. Rationed by the brand: at most one per viewport
        // (docs/brand-guidelines.md §3) — if a screen seems to need two, the second is
        // `onLight` or `onDark`.
        accent:
          "bg-[linear-gradient(180deg,var(--kk-marigold-light),var(--kk-marigold))] text-nightfall " +
          "shadow-[0_1px_0_rgba(255,255,255,0.35)_inset,0_2px_10px_-2px_rgba(232,135,58,0.55)] " +
          "hover:shadow-[0_1px_0_rgba(255,255,255,0.45)_inset,0_6px_18px_-4px_rgba(232,135,58,0.7)] " +
          "hover:brightness-[1.04] active:brightness-[0.97] " +
          "active:shadow-[0_1px_0_rgba(255,255,255,0.3)_inset,0_1px_4px_-1px_rgba(232,135,58,0.5)] " +
          "focus-visible:ring-marigold/45",

        // On predawn/nightfall bands, where `outline` vanishes into the surface.
        onDark:
          "border-cream/25 bg-cream/5 text-cream backdrop-blur-sm " +
          "hover:border-cream/45 hover:bg-cream/12 active:bg-cream/8 " +
          "focus-visible:ring-cream/40",

        // The quiet secondary on cream surfaces — the companion to `accent` in a hero,
        // where shadcn's `outline` is too faint against a photographic background.
        onLight:
          "border-ink/20 bg-cream/70 text-ink backdrop-blur-sm " +
          "hover:border-ink/35 hover:bg-cream active:bg-cream-2 " +
          "focus-visible:ring-ink/25",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        // Site header scale. `sm` is 28px tall with 10px of horizontal padding — tuned for
        // dense product toolbars, and in a 64px navbar it reads as a squashed chip.
        nav: "h-9 gap-1.5 rounded-md px-4 text-sm",
        // Landing-page and checkout scale. The default sizes are tuned for dense product
        // chrome and read as tiny inside a hero.
        //
        // rounded-md (10px, the `control` token) rather than the 14px `card` radius the
        // base class uses: at 48px tall, 14px corners start to look like a pill and lose
        // the squared, deliberate feel the rest of the system has. Weight is bumped to
        // semibold and tracking tightened slightly — at this size `font-medium` reads thin.
        hero: "h-12 gap-2 rounded-md px-7 text-[0.95rem] font-semibold tracking-[-0.005em]",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
