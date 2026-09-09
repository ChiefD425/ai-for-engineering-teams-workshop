---
name: dashboard-components
description: Conventions for building and editing Customer Intelligence Dashboard UI - React 19 + TypeScript components, Tailwind styling, Next.js App Router (Server Components by default), and the shared health-score color scale. Use whenever creating or modifying a dashboard component, a health score display or badge, a customer card or list, or any customer data UI under src/components/.
---

# Dashboard Components

Conventions for UI in the Customer Intelligence Dashboard. Follow these when
adding a component or changing an existing one.

## File layout

- One component per file at `src/components/[ComponentName].tsx`, PascalCase,
  filename matching the exported component name.
- Export the component as a **named export**. Add `export default` only if an
  existing sibling already does.
- Export the props interface as `[ComponentName]Props` so containers can type
  their own state against it.
- Shared logic (scoring, formatting, data shaping) belongs in `src/lib/`, not in
  the component. Mock data lives in `src/data/`.
- Import across directories with the `@/` alias (`@/lib/healthCalculator`,
  `@/data/mock-customers`), never with relative `../..` paths.

## React 19 + TypeScript

- Function components only. No class components, no `React.FC`.
- Type props with an explicit exported `interface`; destructure in the signature
  and give optional props defaults there (`selected = false`).
- Use `import type { ... }` for type-only imports.
- Prefer discriminated or clearly-ordered prop states over booleans that can
  conflict. When several states are possible (loading / error / empty / data),
  check them in a fixed order at the top of the component and return early.
- No `any`. If a value's shape is unknown, model it.
- `npm run type-check` must pass before a component is considered done.

## Next.js App Router

- **Server Components by default.** Do not add `'use client'` unless the
  component needs one of: `useState`/`useReducer`/`useEffect`/other hooks, event
  handlers (`onClick`, `onChange`), browser APIs, or a Context provider.
- When `'use client'` is required, it goes on the first line of the file.
- Push `'use client'` to the leaf that actually needs it. Prefer a server parent
  that fetches/computes and passes plain serializable props into a small client
  child over marking a whole subtree as client.
- Presentational components should not fetch or calculate. Containers own data
  and pass results down as props, so the widget and any alerting logic can never
  disagree about a number.

## Styling

- Tailwind utility classes only (Tailwind v4). No CSS modules, no inline
  `style`, no `styled-components`.
- Build conditional class strings with an array + `.filter(Boolean).join(' ')`
  rather than nested template literals.
- Defaults for containers: `rounded-lg border p-4 shadow-sm`.
- Every flex/grid child that can hold text gets `min-w-0`, and long text gets
  `truncate`, so cards survive narrow columns.
- Mobile-first: write the base classes for small screens and add `sm:`/`md:`
  overrides upward.

## Health score colors

The score scale is 0-100. Clamp before mapping so out-of-range values still get
a color: `Math.min(100, Math.max(0, healthScore))`.

| Score  | Band     | Dot             | Badge                           | Card tint                        |
| ------ | -------- | --------------- | ------------------------------- | -------------------------------- |
| 0-30   | Poor     | `bg-red-600`    | `bg-red-100 text-red-800`       | `border-red-200 bg-red-50`       |
| 31-70  | Moderate | `bg-yellow-700` | `bg-yellow-100 text-yellow-800` | `border-yellow-200 bg-yellow-50` |
| 71-100 | Good     | `bg-green-700`  | `bg-green-100 text-green-800`   | `border-green-200 bg-green-50`   |

Rules:

- Define the mapping **once** per component in a `getHealthLevel(score)` helper
  or a `Record<RiskLevel, ...>` lookup at module scope. Never inline threshold
  comparisons in JSX.
- If the score already arrives pre-classified (e.g. a `riskLevel` from
  `@/lib/healthCalculator`), key the colors off that classification instead of
  re-deriving the band from the number, so color and risk band cannot drift.
- The thresholds are owned by `@/lib/healthCalculator`: `CRITICAL_MAX_SCORE`
  (30) and `WARNING_MAX_SCORE` (70). Import them rather than hardcoding `30`
  and `70` in a new component.
- The `RiskLevel` union maps to the bands one-to-one: `critical` -> red,
  `warning` -> yellow, `healthy` -> green. Use the calculator's own band labels
  (`Critical` / `Warning` / `Healthy`) when the value came from
  `calculateHealthScore`; `Poor` / `Moderate` / `Good` is for a raw
  `customer.healthScore` on a card.
- The `-700`/`-600` shades on light tints and the `-800` text on `-100` badges
  are chosen to clear WCAG AA per `specs/accessibility-spec.md`. Don't
  substitute lighter shades.
- Boundary values 0, 30, 31, 70, 71, 100 are the cases the specs check. Any new
  score display must agree with `CustomerCard` at all six.

## Accessibility

- Color is never the only signal. Pair every color-coded element with text —
  a visible band label, or a `sr-only` sentence like
  `Health score 72 of 100 (Good)`.
- Decorative dots and swatches get `aria-hidden="true"`.
- Interactive cards render as `<button type="button">`, not a `div` with
  `onClick`. Use `aria-pressed` for selectable cards, `aria-expanded` +
  `aria-controls` for disclosures.
- Focus is visible everywhere:
  `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700`.
- Loading regions get `aria-busy="true"` and `aria-live="polite"`; error text
  gets `role="alert"`.
- Sections get a heading tied in with `aria-labelledby`.

## Reference implementations

Match the structure and comment density of these before inventing a new shape:

- `src/components/CustomerCard.tsx` — score-driven tinting, selectable button
  card, `getHealthLevel` helper.
- `src/components/CustomerHealthDisplay.tsx` — loading/error/empty/data ordering,
  `Record<RiskLevel, ...>` color lookup, disclosure pattern.

Project-wide rules live in `specs/`: `specs/accessibility-spec.md` and
`specs/code-quality-spec.md` apply to every component, and each component has
its own `specs/[name]-spec.md` with an acceptance-criteria checklist. Read the
component's spec before editing it — the checklist is what `/verify` checks.
