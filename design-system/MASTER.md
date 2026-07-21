# Produknesia Design System — Master (v2)

**Direction:** Indonesian street-commerce meets product leaderboard. Crisp
near-white paper, deep warm ink, *merah* red reserved strictly for actions.
Dark mode = warm ink dark (not near-black-plus-acid). The design's boldness is
spent in exactly two places (see Signatures); everything else stays quiet.

## Foundations

- **Component base:** shadcn/ui on Base UI primitives (`render` prop, not
  `asChild`; link-rendering Buttons need `nativeButton={false}`; menu labels
  live inside `DropdownMenuGroup`). Semantic tokens only.
- **Motion:** Framer Motion (`motion`), global `MotionConfig reducedMotion="user"`.
  Feed stagger + vote count roll only. Button presses are CSS (`active:translate`),
  not JS animation.
- **Typography:**
  - Body: **Plus Jakarta Sans** (`--font-sans`) — by Tokotype, an Indonesian
    foundry; the subject's own typography.
  - Display: **Bricolage Grotesque** (`--font-heading`) — headings, wordmark,
    rank numerals; heavy weights (bold/extrabold), used with restraint.
- **Icons:** Lucide only.

## Signatures (the two allowed bold devices)

1. **Sticker press** — every red action (vote, submit, visit, sign-in CTA):
   `border-2 border-foreground` + `shadow-hard-sm` (hard offset shadow, token
   `--shadow-hard-sm`) and `active:translate-x-0.5 active:translate-y-0.5
   active:shadow-none` so it physically sits down. Available as
   `<Button variant="sticker">`. Never on secondary controls.
2. **Rank numerals** — Popular feeds show `01 02 03…` in Bricolage extrabold
   (`rank` prop on ProductCard); #1 in primary red, rest muted. Only where
   order is real information (popular sort) — never on Newest/search/profile.

## Color tokens

Light: background near-white paper `oklch(0.99 0.003 90)`; ink foreground
`oklch(0.185 0.012 50)`; primary merah `oklch(0.585 0.21 29)`; borders visible
warm gray. Dark: warm ink base `oklch(0.175 0.01 50)`, brighter merah
`oklch(0.66 0.19 29)`. `--hard-shadow-color` = ink (light) / near-black (dark).
Red appears ONLY on: sticker actions, brand full stop, rank #1, voted state,
destructive-adjacent semantics.

## Quiet layer (everything else)

- Cards: 1px border, no shadow, hover = `border-foreground/60`; name turns
  primary on hover.
- Tabs/pills: active = ink pill (`bg-foreground text-background`), never red.
- Category chips: outline badges, hover = ink border.
- Wordmark: `produknesia.` lowercase Bricolage extrabold, red full stop.
- Empty states: dashed border, one icon, one line of direction.

## Rules (binding)

- cursor-pointer + hover feedback on every interactive element; hover never
  shifts layout. Focus rings visible. Touch targets ≥44px. Inputs labeled.
- Same `max-w-5xl` header / `max-w-2xl` content containers everywhere.
- Responsive 375/768/1024/1440; no horizontal scroll.
- `prefers-reduced-motion` respected. Body text ≥4.5:1 contrast in both modes.
