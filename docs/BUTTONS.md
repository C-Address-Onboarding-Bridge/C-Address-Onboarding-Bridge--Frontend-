# Buttons

Reference for the button patterns used across the app (#334). There is no
`<Button>` component: buttons are plain `<button>` / `<Link>` elements with
Tailwind utility classes. This document is the shared source of truth for what
those class strings should be, so a new button matches the existing ones instead
of inventing a fifth shade of purple.

Colours all come from the CSS custom properties in `src/app/globals.css`; see
[STYLES.md](./STYLES.md) for the token list.

## Variants

### Primary — the one action a screen is for

Solid `--primary` fill, white label. At most one per view (per card, for
dense screens like the dashboard).

```tsx
<button className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
  <Wallet className="w-4 h-4" />
  Connect Freighter
</button>
```

Used by: the wallet connect CTAs, `Continue to <provider>` on the on-ramp page,
`Bridge` submit on the bridge form.

### Secondary — supporting actions

Transparent fill, `--border` outline, `--surface-2` background. Sits next to a
primary button without competing with it.

```tsx
<button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs font-medium hover:border-[var(--text-muted)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
  <Camera className="w-3.5 h-3.5 shrink-0" />
  Upload avatar
</button>
```

Used by: `Upload avatar` / `Change avatar`, `Disconnect Wallet` in the mobile
menu.

### Ghost — low-emphasis and destructive-adjacent

No border, no fill; colour shifts on hover. Destructive ghosts hover to
`--error` rather than being red at rest, so a `Remove` button never looks like
an error state.

```tsx
<button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-transparent text-xs font-medium text-[var(--text-muted)] hover:text-[var(--error)] transition-colors">
  <Trash2 className="w-3.5 h-3.5 shrink-0" />
  Remove
</button>
```

Used by: `Remove` on the avatar control, dismiss controls on the network
banners.

### Icon-only

Square hit area, no visible label — so it **must** carry an `aria-label`.
`title` alone is not an accessible name: some assistive tech skips it and it
never appears on touch.

```tsx
<button
  onClick={handleCopy}
  aria-label="Copy wallet address"
  title="Copy address"
  className="p-1 rounded hover:bg-[var(--surface-2)] transition-colors"
>
  <Copy className="w-3 h-3 text-[var(--text-muted)]" />
</button>
```

Used by: address copy, wallet disconnect, banner dismiss.

### Toggle / segmented

A selectable option is a `<button>` with `aria-pressed`, not a styled `<div>`.
Exactly one option in a group carries `aria-pressed={true}`.

```tsx
<button
  type="button"
  aria-pressed={selected === provider.id}
  onClick={() => setSelected(provider.id)}
  className={
    selected === provider.id
      ? "bg-[var(--primary)]/10 border-[var(--primary)] text-[var(--primary-light)]"
      : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]"
  }
>
  {provider.label}
</button>
```

Used by: the on-ramp provider selector, feature-flag switches in
`FeatureFlagPanel`.

### Link-as-button

A navigation target is a `Link`, never a `<button>` with a router push — a
`<button>` cannot be middle-clicked, opened in a new tab, or copied. Style it
with the primary/secondary classes above.

```tsx
<Link
  href="/bridge"
  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-medium hover:bg-[var(--primary)]/90 transition-colors"
>
  <Plus className="w-4 h-4" />
  New Bridge
</Link>
```

Prefer `PrefetchLink` (`src/components/prefetch-link.tsx`) for in-app routes
that are likely to be visited next.

## Sizing

| Size | Padding | Text | Radius | Where |
|------|---------|------|--------|-------|
| Large | `px-6 py-3` | `font-medium` (base) | `rounded-xl` | Page-level CTAs |
| Medium | `px-4 py-2` | `text-sm font-medium` | `rounded-xl` / `rounded-lg` | Toolbars, nav, cards |
| Small | `px-3 py-1.5` | `text-xs font-medium` | `rounded-lg` | Inline controls |
| Icon | `p-1` – `p-2` | — | `rounded` / `rounded-lg` | Icon-only |

Icons inside buttons are `w-4 h-4` at large/medium and `w-3.5 h-3.5` at small,
always with `gap-2` (large/medium) or `gap-1.5` (small). Add `shrink-0` to an
icon whose button can wrap.

## States

- **Hover** — primary drops to `hover:bg-[var(--primary)]/90`; secondary and
  ghost shift border or text colour. Always pair with `transition-colors`.
- **Disabled** — `disabled:opacity-50 disabled:cursor-not-allowed` plus the real
  `disabled` attribute. Never fake it by dropping the `onClick`: a disabled-
  looking button that is still focusable and clickable is worse than an enabled
  one.
- **Focus** — `focus:outline-none focus-visible:ring-2
  focus-visible:ring-[var(--primary)]`. `focus-visible`, not `focus`, so a mouse
  click does not leave a ring behind. Never remove the outline without adding a
  ring.
- **Loading / busy** — keep the button mounted, swap the label, and disable it:
  `{isConnecting ? "Connecting..." : "Connect Wallet"}`. Spinners use
  `animate-spin motion-reduce:animate-none` so they respect
  `prefers-reduced-motion` (see the media query in `globals.css`).

## Accessibility checklist

Every button in this repo is expected to satisfy all of these. The shared
assertions in `src/__tests__/helpers/a11y.ts` check most of them automatically,
and `src/__tests__/a11y-audit.test.tsx` runs them over rendered components.

1. **Always `type="button"`** unless the button submits a form. A bare
   `<button>` inside a `<form>` defaults to `type="submit"` and will reload the
   page.
2. **Accessible name** — visible text, or `aria-label` for icon-only buttons.
3. **Real `<button>` element** for actions, real `<a>`/`Link` for navigation.
   `<div onClick>` is not keyboard reachable.
4. **Visible focus indicator** — see Focus above (WCAG 2.4.7).
5. **`aria-pressed` on toggles**, `aria-expanded` + `aria-controls` on
   disclosure buttons (see the navbar mobile toggle).
6. **Announce outcomes** that are only conveyed visually. The copy buttons swap
   an icon, which a screen reader parked on the button never hears — they pair
   with `<LiveRegion>` (`src/components/live-region.tsx`).
7. **Contrast** — white on `--primary` and `--text-muted` on every surface both
   clear WCAG AA; `src/__tests__/contrast.test.ts` enforces this against the
   real token values, so do not hand-pick a new button colour without adding it
   there.

## Adding a new button

1. Pick the closest variant above and copy its class string verbatim.
2. Pick a size row from the table; do not invent padding.
3. Add `type="button"`, an accessible name, and the focus ring.
4. If it needs a colour that is not already a token, add the token to
   `globals.css` (both the `:root` block and `@theme inline`) rather than
   inlining a hex value — see [STYLES.md](./STYLES.md).
