# Shared UI instructions

Scope: `packages/ui`. Inherit the [root instructions](../../AGENTS.md). `@call-agent/ui` owns reusable React primitives, semantic design tokens, and shared motion used by web and portal.

## Architecture and design consistency

- Components live under `src/components` and export through `src/index.ts`; utility `cn` lives under `src/utils`. Shared CSS enters through `src/styles/index.css`, exported as `@call-agent/ui/styles.css`.
- Package ships TypeScript/CSS source without a build step; Vite consumers alias source and preserve CSS side effects. Import shared styles once at each app entry.
- Tokens in `src/styles/tokens.css` own surfaces, borders, text/accent/status colors, radii, shadows, and motion. Shared keyframes belong in `animations.css`; reduced motion in `reduced-motion.css`. Do not duplicate these in pages.
- Reuse Button variants, form primitives, badges, cards, chips, segmented controls, alerts, spinners/skeletons, and live indicators before inventing another primitive. Add reusable behavior here; page-specific compositions remain in apps.
- Host HTML loads fonts. Marketing uses Newsreader display plus IBM Plex Sans/Mono; portal intentionally overrides display to IBM Plex Sans in its global CSS. Shared changes must support both approved treatments.
- Keep semantic HTML, keyboard activation/navigation, visible focus, labels, disabled/loading states, contrast, and reduced motion. Preserve forwarded props and existing component APIs; motion must not be the only status signal.
- Base helpers apply through `.ca-ui` as documented. Shared classes use `ca-`/existing token namespaces; do not introduce app routes, auth providers, API requests, dashboard/landing layouts, or vendor room UI here.

## Naming, changes, and verification

- Component files/exports use PascalCase and `…Props` type names; helpers use camelCase; styles/utilities use established lowercase names. Extend existing variant/size/tone unions instead of stringly typed per-page options.
- When changing a primitive/token, inspect both marketing and portal consumers. Keep app-specific layouts/typography overrides intentional and documented rather than normalizing away their differences.
- Update [README](README.md) when public exports, variants, or consumption instructions change. Route/data contracts belong to contracts, not this package.
- From repo root: `npm run typecheck --prefix packages/ui`; then affected `npm run typecheck:web`/`typecheck:portal` and builds. Verify keyboard/focus, disabled/loading, mobile, and reduced-motion states when behavior/styles change.
- References: [marketing instructions](../../apps/web/AGENTS.md), [portal instructions](../../apps/portal/AGENTS.md), [deployment instructions](../../railway/AGENTS.md). Deploy only the consuming SPA(s) affected by a shared UI change.

## Design system reference

Reusable design-system primitives for Call Agent product UIs (`apps/web` marketing, `apps/portal` ops).

## Install / consume

This package ships TypeScript sources + CSS (no build step required for Vite apps).

```ts
// Host app entry
import "@call-agent/ui/styles.css";
import { Button, Input, Field, Badge, Card } from "@call-agent/ui";
```

### Vite alias (local monorepo)

```ts
// vite.config.ts
resolve: {
  alias: {
    "@call-agent/ui": path.resolve(__dirname, "../../packages/ui/src/index.ts"),
  },
}
```

Also allow importing the styles entry:

```ts
alias: {
  "@call-agent/ui/styles.css": path.resolve(__dirname, "../../packages/ui/src/styles/index.css"),
}
```

Load fonts in the host `index.html` (Newsreader, IBM Plex Sans, IBM Plex Mono).

These paths assume a Vite config under `apps/web` or `apps/portal`. Actual configs use ordered alias arrays, with the CSS entry before the general package alias, and dedupe React. Preserve that ordering. Marketing uses Newsreader display text; portal deliberately uses IBM Plex Sans for titles too.

## Tokens

CSS variables live in `src/styles/tokens.css`: surfaces, borders, text, accents, radii, shadows, motion.

Wrap product UI in `.ca-ui` when you want base focus/typography helpers:

```tsx
<div className="ca-ui">…</div>
```

## Components

| Component | Purpose |
|-----------|---------|
| `Button` | primary, secondary, ghost, CTA gold, command bar, etc. |
| `Input` / `Textarea` / `Label` / `Field` | Forms |
| `Chip` | Filter / day pills |
| `SegmentedControl` | Exclusive option group |
| `Badge` | Status pills |
| `Card` | Surface + optional hover lift |
| `Alert` | Error / success / info / warn banners |
| `Eyebrow` | Uppercase section label |
| `Spinner` | Loading spinner |
| `Skeleton` | Placeholder bone (line / block / circle / pill) with shimmer |
| `WaveIndicator` | Live-call audio bars |
| `LiveDot` | Pulsing live indicator (+ badge) |

### Button variants

| Variant | Look |
|---------|------|
| `primary` | Dark fill |
| `secondary` | Outline |
| `ghost` | Transparent (light UI) |
| `ghostOnDark` | Glass outline on dark |
| `cta` | Yellow gold marketing CTA |
| `ctaDark` | Dark marketing CTA |
| `command` / `commandSecondary` / `commandGhost` | Ops command bar |
| `dangerGhost` | Subtle destructive |

```tsx
<Button variant="cta" size="lg" shine pulse showArrow>
  Get a demo
</Button>

<Button as="a" href="/login" variant="primary">
  Log in
</Button>
```

### Animations

Utility classes (from `animations.css`):

- `ca-animate-rise` / `ca-animate-rise-simple`
- `ca-animate-spin`
- `ca-animate-pulse-live`
- `ca-animate-float`
- `ca-animate-pop`

Delay via `--ca-delay`:

```tsx
<div className="ca-animate-rise" style={{ ["--ca-delay" as string]: "0.1s" }} />
```

`prefers-reduced-motion` is honored in `reduced-motion.css`.

## Out of scope

Page layouts (landing shell, dashboard sidebar), LiveKit room UI, and app routing stay in product apps (`apps/web`, `apps/portal`).

## Additional controls and token ownership

The live catalog also exports Select and Slider. Reuse their focus/disabled/label behavior. Components live in folders such as src/components/Button/Button.tsx and export through local indexes and the package barrel.

Button sizes are sm, md, lg, xl. Preserve the discriminated button/anchor API, native props, variants and shine/pulse/showArrow options. Routes/auth/API actions stay in apps.

Typography: --font-display/body/mono. Surfaces: --bg-base/surface/elevated. Borders: --border/strong. Text: --text/muted/dim/faint. Semantic success/error/info/warn have background/border/text tokens; accents cover positive/negative/info/warn/live/primary/yellow. Radii: sm 6px, md 8px, lg 10px, xl 12px, 2xl 14px, pill. Shared shadows include focus/neutral-focus/CTA/surface levels; fast/normal/slow motion durations are 0.1s/0.15s/0.22s with ease-out/ease-spring.

Use semantic source tokens instead of copied per-page hex values. Portal's approved display override does not redefine the design system. Hosts load fonts in index.html and import styles once. Update both consumers with export/variant changes and check keyboard/focus, mobile, disabled/loading, reduced-motion and accessible status text.
