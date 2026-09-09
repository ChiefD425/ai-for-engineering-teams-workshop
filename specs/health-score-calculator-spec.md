# Feature: Health Score Calculator

## Context
- Provides a detailed, explainable customer health score for the Customer Intelligence Dashboard, surfaced through a new `CustomerHealthDisplay` widget alongside `CustomerCard`, not by replacing anything `CustomerCard` reads
- Consists of two parts: a pure calculation library (`src/lib/healthCalculator.ts`) and the `CustomerHealthDisplay` UI widget that consumes it
- Integrates with the existing `CustomerSelector` via its `onCustomerSelect` callback (see `customer-selector-spec.md`) so the health display updates when the selected customer changes
- Score and risk-level output must align with the color-coding convention already established by `CustomerCard` (red/yellow/green)
- **Relationship to `CustomerCard`'s `healthScore`**: `CustomerCard` keeps displaying `customer.healthScore` exactly as it does today — a cheap, always-available, denormalized number requiring no factor input data. `CustomerHealthDisplay` independently computes a (potentially different) score from the four weighted factors below, for the customer's detailed breakdown view. The two are allowed to disagree for now — reconciling them (e.g. having `Customer.healthScore` become a cache of `calculateHealthScore`'s output) is explicitly out of scope for this spec; see Out of Scope

## Requirements

### Functional Requirements — Calculation Library
- Calculate an overall health score on a 0-100 scale from four weighted factors:
  - Payment history — 40%
  - Engagement — 30%
  - Contract status — 20%
  - Support satisfaction — 10%
- Classify the overall score into a risk level:
  - Critical: 0-30
  - Warning: 31-70
  - Healthy: 71-100
- Expose one pure scoring function per factor (payment, engagement, contract, support), each returning a 0-100 sub-score
- Expose a single `calculateHealthScore` function that accepts all four factors' raw input data and returns the overall score, risk level, and the individual factor sub-scores (for breakdown display)
- Validate all inputs before calculating; reject invalid/out-of-range/missing required data with descriptive errors rather than silently producing a misleading score
- Handle edge cases explicitly:
  - New customers with little or no history (e.g. no payment history yet, zero logins) — defined, documented fallback behavior rather than a crash or arbitrary score
  - Missing/partial data per factor — documented handling (e.g. treat as neutral/lowest-confidence rather than crashing)

### Functional Requirements — UI Widget
- `CustomerHealthDisplay` shows the overall health score and a color-coded visualization consistent with `CustomerCard`'s red/yellow/green thresholds
- Expandable/collapsible breakdown section showing each factor's individual sub-score and its weight
- Loading state while a score is being calculated/fetched
- Error state when calculation fails (e.g. invalid input data), consistent with other dashboard widgets' error presentation
- Recalculates and re-renders when `CustomerSelector`'s `onCustomerSelect` reports a new selected customer (or `null`, in which case the widget shows an empty/placeholder state, not a calculation error)

### Data Requirements
- Input data shapes (all as TypeScript interfaces in `src/lib/healthCalculator.ts`, reused as-is by `predictive-alerts-spec.md` rather than redefined there):
  - Payment history: days since last payment, average payment delay (days), overdue amount
  - Engagement: login frequency, feature usage count, support ticket count
  - Contract: days until renewal, contract value, whether a recent upgrade occurred
  - Support: average resolution time, satisfaction score, escalation count
- `calculateHealthScore` return shape includes: overall score (number, 0-100), risk level (`'critical' | 'warning' | 'healthy'`), and a breakdown of the four factor sub-scores with their weights
- Library does not depend on `Customer` from `src/data/mock-customers.ts`; it operates only on the factor input interfaces it defines, so it can be reused independent of the mock data shape
- `CustomerHealthDisplay` is responsible for mapping a selected `Customer` (plus whatever health-input fields are added to or associated with it) into the calculator's input shape

## Constraints

### Technical Stack
- TypeScript (strict mode); calculation library has no React/UI dependency
- Next.js 15 (App Router), React 19, Tailwind CSS v4 for the UI widget

### File Structure
- Calculation library: `src/lib/healthCalculator.ts` (under `src/lib/`, not a root-level `lib/`, so it's reachable via the project's existing `@/*` → `./src/*` path alias and shares a location with `src/lib/alerts.ts` from `predictive-alerts-spec.md`)
- UI widget: `src/components/CustomerHealthDisplay.tsx`
- Unit tests colocated per project test convention (e.g. `src/lib/healthCalculator.test.ts`)

### Implementation Constraints
- All calculator functions are pure: no side effects, no I/O, deterministic output for identical input
- Each exported function and interface has a JSDoc comment explaining the business logic and, for scoring functions, the mathematical formula/rationale
- Input validation errors are thrown as typed error classes extending `Error` (e.g. `HealthScoreValidationError`), not plain strings or generic `Error`
- `CustomerHealthDisplay` is a client component only if it needs interactive state (e.g. expand/collapse); score calculation itself stays outside React state where possible
- No new npm dependencies for the calculation logic

### Testing Requirements
- Test coverage should satisfy the Acceptance Criteria below (per-factor, combination, boundary, edge-case, and validation behavior); no separate test plan is prescribed here beyond that
- Include at least a few realistic customer data scenarios, not only synthetic edge values

### Performance Considerations
- Calculation is synchronous and cheap enough to run on every customer selection change without a perceptible delay
- No unnecessary recalculation when the selected customer and its underlying data have not changed (e.g. memoize by customer id/input in the display component)

### Security Considerations
- No external network calls from the calculation library
- All displayed values rendered as text via JSX; no `dangerouslySetInnerHTML`

## Acceptance Criteria

- [ ] `calculateHealthScore` returns a score in [0, 100] for valid input across representative realistic scenarios
- [ ] Overall score correctly reflects the 40/30/20/10 weighting of payment/engagement/contract/support sub-scores
- [ ] Risk level is `critical` for 0-30, `warning` for 31-70, `healthy` for 71-100, verified at boundary values 0, 30, 31, 70, 71, 100
- [ ] Each factor scoring function is independently unit-tested and returns a 0-100 sub-score
- [ ] Invalid input (missing required field, out-of-range value) throws a descriptive, typed error and does not return a fabricated score
- [ ] New-customer / missing-data edge cases produce documented, non-crashing behavior
- [ ] `CustomerHealthDisplay` renders the overall score with color coding matching `CustomerCard`'s red/yellow/green thresholds
- [ ] Breakdown section expands/collapses and shows all four factor sub-scores with weights
- [ ] Loading state renders while calculation is pending
- [ ] Error state renders when calculation fails, without crashing the dashboard
- [ ] Selecting a different customer via `CustomerSelector`'s `onCustomerSelect` updates `CustomerHealthDisplay`'s score and breakdown; a `null` selection shows a placeholder, not an error
- [ ] All calculator functions and interfaces have JSDoc comments explaining formulas/business logic
- [ ] `npm run type-check` passes with no errors
- [ ] `npm run lint` passes with no errors or warnings
- [ ] Unit test suite passes and covers boundary, edge-case, and validation scenarios
- [ ] Meets `accessibility-spec.md` (color paired with text/aria-label, expand/collapse operable by keyboard, loading state announced) and `code-quality-spec.md`

## Out of Scope
- Reconciling this calculator's output with `Customer.healthScore` (e.g. writing the calculated score back into the mock data, or having `CustomerCard` read from `calculateHealthScore` instead of `customer.healthScore`) — the two scores are allowed to diverge for this spec; unifying them is a future decision, not a requirement here
- Persisting calculated scores to a database
- Trend analysis / historical score tracking over time
- A/B testing infrastructure for algorithm variants
- Production monitoring/calibration tooling
- Caching layer beyond in-component memoization
- Changes to `CustomerCard` or `CustomerSelector` beyond the `onCustomerSelect` integration point described above
