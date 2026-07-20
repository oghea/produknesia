# Produknesia Design System — Master

**Direction:** Warm Indonesian — light-first, warm off-white base, bold red primary
(nod to merah-putih), amber accents. Clean Product Hunt density with local
personality. Dark mode fully supported (next-themes + shadcn CSS variables).

## Foundations

- **Component base:** shadcn/ui (CSS-variable theming; semantic tokens only —
  `bg-primary`, `text-muted-foreground`; never hardcoded Tailwind palette colors
  in components).
- **Motion:** Framer Motion (`motion` package). Global
  `<MotionConfig reducedMotion="user">`. Animate 1–2 key elements per view max:
  feed-list stagger entrance, vote-button spring, subtle fade-up on page mount.
  150–300ms micro-interactions, ease-out entering / ease-in exiting.
  Transform/opacity only — no width/height animation.
- **Typography:** Space Grotesk (headings, `--font-heading`) + DM Sans (body,
  `--font-sans`) via `next/font/google`. Body ≥16px, line-height 1.5–1.75.
- **Icons:** Lucide only (ships with shadcn). No emoji icons.

## Color tokens (light)

| Token | Value | Use |
|---|---|---|
| `--background` | warm off-white (oklch ~0.985 0.008 85) | page |
| `--foreground` | deep warm charcoal (stone-900) | text |
| `--primary` | bold red `oklch(0.577 0.215 27)` (~#dc2626) | CTAs, vote-active, brand |
| `--accent` | warm amber tint | hovers, highlights |
| `--muted` | warm stone tint | secondary surfaces |
| `--border` | visible warm gray (≥ gray-200 weight) | all borders |

Dark mode mirrors with a deep warm charcoal base and a slightly brighter red.
Contrast: body text ≥4.5:1 in BOTH modes.

## Rules (from ui-ux-pro-max, binding)

- cursor-pointer + visible hover feedback on every interactive element; hover
  must not shift layout (no scale on cards).
- Visible focus rings (`focus-visible:ring-*`) on all interactives.
- Touch targets ≥44px. Labels (or aria-label) on every input.
- Skeletons/reserved space for async content; no content jumping.
- Same `max-w-*` container across pages. Sticky header with backdrop blur;
  content padded below it.
- Responsive at 375 / 768 / 1024 / 1440. No horizontal scroll.
- `prefers-reduced-motion` respected everywhere (MotionConfig + CSS).

## Page notes

- **Feed:** compact hero strip (tagline + category chips), Tabs for
  Popular/Newest, staggered card entrance.
- **Cards:** shadcn Card, logo, name/tagline, maker; vote button on the right —
  spring scale + count roll on toggle; voted state = filled primary.
- **Detail:** larger vote CTA, gallery, prose description, styled comments.
- **Forms (submit/admin):** shadcn Input/Textarea/Label/Button; server-action
  flow unchanged (no RHF rearchitecture); errors inline near fields.
- **Empty states:** friendly, icon + one line, never bare gray boxes.
