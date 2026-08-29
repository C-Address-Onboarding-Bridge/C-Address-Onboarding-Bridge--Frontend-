# Styles Guide

## Overview

C-Address Onboarding Bridge uses **Tailwind CSS v4** with CSS custom properties
for theming. Everything lives in a single stylesheet, `src/app/globals.css`:
token definitions, the Tailwind theme mapping, a handful of component
primitives, and the reduced-motion overrides. Components then use Tailwind
utility classes.

For the button class strings specifically, see [BUTTONS.md](./BUTTONS.md).

## Color System

Tokens are defined in the `:root` block of `globals.css`. These are the tokens
that actually exist — referencing anything else resolves to nothing:

| Variable | Usage |
|----------|-------|
| `--background` | Page background |
| `--foreground` | Primary text color |
| `--surface` | Card / panel backgrounds (the `.card` primitive) |
| `--surface-2` | Recessed surfaces: inputs, secondary buttons, wells |
| `--border` | Borders and dividers |
| `--primary` | Primary actions (buttons, links, active nav) |
| `--primary-light` | Primary text/icons on a tinted primary background |
| `--secondary` | Accent hue, second stop of the brand gradient |
| `--accent` | Sparingly, for highlights |
| `--text-muted` | Subdued text, placeholders, icon defaults |
| `--success` / `--warning` / `--error` | Status states |

Two derived tokens exist for the cases a hex value cannot cover:

- `--primary-rgb` / `--secondary-rgb` — space-separated channels, so an alpha
  variant can be written `rgb(var(--primary-rgb) / 0.3)` instead of a literal
  `rgba(...)` that silently drifts when the hue is retuned. **Keep these in step
  with `--primary` / `--secondary`.**
- `--gradient-brand` — the `linear-gradient(135deg, primary → secondary)` used by
  `.gradient-text` and `.gradient-border`.

The app is **dark-only**. There is no `prefers-color-scheme` switch and no
second set of token values; `--background` is a dark value at `:root`. If a
light theme is ever added, it belongs in a `@media (prefers-color-scheme: light)`
block that overrides the same token names — not in per-component classes.

## Tailwind Configuration

There is **no `tailwind.config.ts`**. Tailwind v4 is configured in CSS:

- `@import "tailwindcss";` at the top of `globals.css`.
- `@theme inline { ... }` maps the custom properties onto Tailwind's theme
  namespace, which is what makes `bg-surface`, `text-muted`, `font-mono` and
  friends resolve.
- PostCSS wiring is in `postcss.config.mjs` (`@tailwindcss/postcss`).

Adding a colour therefore means two edits in `globals.css`: the `:root`
declaration and the matching `--color-*` line in `@theme inline`.

## Component Styling Conventions

1. **Use Tailwind utilities** for all layout, spacing, and typography.
2. **Use CSS variables for colours** — `bg-[var(--surface)]`, never a raw hex.
   This is what keeps the contrast test meaningful.
3. **Avoid inline styles** except for genuinely dynamic values (e.g. the pixel
   `size` prop on `<AvatarUpload>`).
4. **Compose class names with a template literal.** There is no `cn()` /
   `clsx` helper in this repo; conditional classes are written inline:
   ```tsx
   className={`px-4 py-2 rounded-lg ${isActive ? "bg-[var(--primary)]/10" : "text-[var(--text-muted)]"}`}
   ```
5. **Reach for an existing primitive** before writing new CSS:
   - `.card` — `rounded-xl border border-[var(--border)] bg-[var(--surface)]`.
     Padding is deliberately excluded; call sites use `p-5` (panels, stats) or
     `p-6` (content-heavy forms) so the distinction stays visible.
   - `.card-hover` — the lift-on-hover transition.
   - `.gradient-text`, `.gradient-border`, `.glow` — brand treatments.

## Responsive Design

Breakpoints follow Tailwind defaults:
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px

Mobile-first: base styles target mobile, breakpoint prefixes add desktop
overrides. The navbar switches from the mobile menu to the horizontal nav at
`md`.

## Typography

Both fonts are loaded via `next/font/google` in `src/app/layout.tsx`:

- Body: **Geist** — CSS variable `--font-geist`, Tailwind `font-sans`
- Code / addresses: **JetBrains Mono** — CSS variable `--font-jetbrains-mono`,
  Tailwind `font-mono`

Use `font-mono` for anything a user might copy verbatim (addresses, hashes,
amounts) — it makes character-level differences legible.

Scale follows Tailwind's default type scale (`text-xs` … `text-3xl`).

## Motion

`globals.css` ends with a `@media (prefers-reduced-motion: reduce)` block that
collapses animation and transition durations, stops `.animate-spin`, and
neutralises the `.card-hover` lift. Two rules follow from it:

- Prefer `transition-colors` / an explicit property list over `transition: all`;
  `all` makes the compositor watch every property and animates changes you did
  not intend.
- Pair spinners with `motion-reduce:animate-none` at the call site as well, so
  the intent is visible in the component.

## Adding New Styles

1. Prefer Tailwind classes over custom CSS.
2. For a new theme colour, add the variable to `:root` **and** the matching
   `--color-*` entry in `@theme inline`, then reference it via
   `var(--your-color)`. If it will need an alpha variant, add a `-rgb` channel
   token alongside it.
3. For a repeated multi-utility pattern, add a primitive class in `globals.css`
   (like `.card`) rather than copying the utility string a fourth time.
4. Component-scoped CSS that cannot be expressed in Tailwind goes in a CSS
   module next to the component.

## Testing Styles

There is no visual-regression or Storybook setup (`src/stories/` holds story
files but Storybook itself is not a dependency). Styles are covered by unit
tests that parse `globals.css` directly:

```bash
npm test -- contrast reduced-motion
```

- `src/__tests__/contrast.test.ts` — computes WCAG contrast ratios from the real
  token values, so lowering a colour's contrast fails the build.
- `src/__tests__/reduced-motion.test.ts` — asserts the reduced-motion query
  exists and that animated components opt into it.
