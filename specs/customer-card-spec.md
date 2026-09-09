# Feature: CustomerCard Component

## Context
- Individual customer display component for the Customer Intelligence Dashboard
- Rendered within the `CustomerSelector` container component, which supplies customer data and selection state via props
- Provides at-a-glance customer information so users can quickly identify a customer, and is directly clickable to select that customer
- Surfaces customer domains, making this the foundation component for future domain health monitoring integration
- Incorporates `requirements/customer-card-enhancement.md`: selection/click behavior is a native part of this component's spec, not a separate follow-on document — `CustomerSelector` owns *which* customer is selected, but `CustomerCard` owns rendering its own click target and highlighted appearance
- The health score displayed here is expected to eventually be produced by `health-score-calculator-spec.md`'s `calculateHealthScore`; see that spec's Context section for how the two stay in sync. This component only renders whatever numeric `healthScore` and color it's given — it has no dependency on the calculator itself

## Requirements

### Functional Requirements
- Display the customer's name, company name, and health score (0-100)
- Display the customer's domains (websites) to give health monitoring context
- Render a color-coded health indicator derived from the health score
- Display a domain count when the customer has more than one domain
- Handle customers with a single domain and customers with multiple domains
- Handle customers with no `domains` value gracefully (the field is optional), without rendering an empty domain section or a count
- Clicking the card selects it; clicking an already-selected card deselects it (single-selection toggle)
- Render a visually distinct highlighted state (border/background change) when selected, driven by a `selected` prop — the card does not track its own selection state internally, since only one card across the whole list may be selected at a time and that invariant is `CustomerSelector`'s responsibility
- Report selection/deselection to the parent via an `onSelect` callback prop; `CustomerCard` never mutates selection state itself, it only requests a change

### User Interface Requirements
- Color-coded health indicator thresholds:
  - Red: 0-30 (poor health score)
  - Yellow: 31-70 (moderate health score)
  - Green: 71-100 (good health score)
- Health score value is shown as a number in addition to the color, so color is not the only carrier of meaning
- Clean, card-based visual design with a distinct region for domain information
- Clear typography hierarchy: customer name is most prominent, then company name, then health score and domain details
- Basic responsive design that works on mobile and desktop
- Long customer names, company names, and domains truncate or wrap rather than overflowing the card

### Data Requirements
- Accepts a single `customer` object via props; the component is presentational and fetches no data itself
- Consumes the existing `Customer` interface exported from `src/data/mock-customers.ts`:
  - Required fields: `id` (string), `name` (string), `company` (string), `healthScore` (number)
  - Optional fields used by this component: `domains` (string[])
  - Other optional fields (`email`, `subscriptionTier`, `createdAt`, `updatedAt`) are not displayed by this component
- Reuses the `Customer` type rather than redefining it; mock data comes from `mockCustomers` in the same module
- Health score is expected in the 0-100 range; values outside that range must still map to a defined indicator color (clamp to the nearest bucket) rather than rendering no color

### Integration Requirements
- Used within the `CustomerSelector` container component
- Props-based, one-way data flow from the parent component; no internal data mutation of customer data. Selection is also one-way from the parent's perspective: `CustomerCard` receives `selected` and calls `onSelect`, but the actual selected-id state lives in `CustomerSelector` (see `customer-selector-spec.md`)
- Exports a properly typed `CustomerCardProps` interface: `{ customer: Customer; selected?: boolean; onSelect?: (customerId: string) => void }`. `selected` and `onSelect` default to `false`/absent so the card also works as a pure read-only display outside a selectable list (e.g. in `customer-management-integration-spec.md`'s `CustomerList`, which reuses `CustomerCard` without selection behavior)
- Imports use the `@/*` path alias configured in `tsconfig.json` (e.g. `@/data/mock-customers`)

## Constraints

### Technical Stack
- Next.js 15 (App Router)
- React 19
- TypeScript in strict mode
- Tailwind CSS v4 for all styling

### Design Constraints
- Responsive from a 320px minimum viewport width upward
- Health indicator colors use Tailwind's standard red / yellow / green scales for consistency with the rest of the dashboard
- Consistent spacing using the Tailwind spacing scale; no hard-coded pixel values where a scale token applies
- No layout shift between a customer with one domain and a customer with several

### File Structure and Naming
- Component file: `src/components/CustomerCard.tsx`
- Component and props use PascalCase (`CustomerCard`, `CustomerCardProps`); the props interface is exported from the component file
- Specification file name follows the project's kebab-case convention

### Implementation Constraints
- Client component (`'use client'`): the click-to-select requirement means this component now owns an interactive event handler, so it can no longer stay a server component
- Health-score-to-color mapping lives in a single, self-contained helper so thresholds are defined in exactly one place
- No new runtime dependencies
- Per `code-quality-spec.md`, exports a named `CustomerCard` function. It additionally keeps a default export solely because `src/app/page.tsx`'s existing workshop-progress scaffold loads it via `require('../components/CustomerCard')?.default` — this is a one-off compatibility shim, not a pattern to repeat elsewhere

### Security Considerations
- Customer name, company, and domains are rendered as text through JSX (which escapes by default); no `dangerouslySetInnerHTML`
- Domains are displayed as text, not as live links, so untrusted URLs are not made clickable
- No customer data written to client-side logs

## Acceptance Criteria

- [ ] Renders customer name, company name, and health score from the `customer` prop
- [ ] Renders the customer's domains
- [ ] Displays a domain count only when the customer has more than one domain
- [ ] Renders correctly for a customer with exactly one domain
- [ ] Renders correctly, with no empty domain section or count, when `domains` is absent or empty
- [ ] Health indicator color matches the specification: red (0-30), yellow (31-70), green (71-100)
- [ ] Threshold boundary values 0, 30, 31, 70, 71, and 100 each map to the correct color
- [ ] Health score is readable as a number, not conveyed by color alone
- [ ] Layout is usable and uncut from 320px width up through desktop widths
- [ ] Long names, company names, and domains do not overflow the card
- [ ] `CustomerCardProps` is defined and exported, and the component reuses the `Customer` interface from `src/data/mock-customers.ts`
- [ ] Component renders from `mockCustomers` data without runtime errors
- [ ] Clicking an unselected card calls `onSelect` with its customer id and, once `selected` is passed back in as `true`, renders the highlighted state
- [ ] Clicking an already-selected card calls `onSelect` again (toggle-off), consistent with single-selection semantics owned by `CustomerSelector`
- [ ] Card renders identically whether or not `selected`/`onSelect` are provided (no crash when used as a plain display card, e.g. in `CustomerList`)
- [ ] Card is operable via keyboard alone (Tab to focus, Enter/Space to select) with a visible focus indicator, per `accessibility-spec.md`
- [ ] `npm run type-check` passes with no errors
- [ ] `npm run lint` passes with no errors or warnings
- [ ] No console errors or warnings when rendered

## Out of Scope

These are deliberately excluded:
- Multi-select (selecting more than one customer at once) — single-selection only, per `requirements/customer-card-enhancement.md`
- Live domain health checking or any network requests
- Displaying `email` or `subscriptionTier`
- Loading, empty, and error states for the surrounding list (owned by `CustomerSelector`)
- Deciding *which* customer id is selected across the app (owned by `CustomerSelector`) — this component only reports intent and renders whatever state it's given
