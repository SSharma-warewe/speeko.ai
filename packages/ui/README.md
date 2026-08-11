# `@call-agent/ui`

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
    "@call-agent/ui": path.resolve(__dirname, "../packages/ui/src/index.ts"),
  },
}
```

Also allow importing the styles entry:

```ts
alias: {
  "@call-agent/ui/styles.css": path.resolve(__dirname, "../packages/ui/src/styles/index.css"),
}
```

Load fonts in the host `index.html` (Newsreader, IBM Plex Sans, IBM Plex Mono).

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
