# Feature: Health Score Calculator Component

## Context

Customer-facing teams need to know *why* a customer is at risk, not just that a number is low. This feature provides an explainable, multi-factor customer health score for the Customer Intelligence Dashboard, in two parts:

- **`healthCalculator`** — a pure, framework-free calculation library that turns four categories of raw risk-factor data into an overall 0-100 score, a risk level, and a per-factor breakdown.
- **`CustomerHealthDisplay`** — the dashboard widget that renders that result, with an expandable factor breakdown.

**Where it sits.** `CustomerSelector` (`customer-selector-spec.md`) reports the selected customer upward via `onCustomerSelect`. `CustomerHealthMonitoring` (`customer-health-monitoring-spec.md`) is the container that subscribes to that callback, maps the `Customer` into this library's factor input shapes via `toRiskFactors`, calls `calculateHealthScore` **once**, and passes the result down to `CustomerHealthDisplay` as a prop. The same result is fed to `alertEngine` (`predictive-alerts-spec.md`), which also imports this library's factor input interfaces rather than redefining them. This library is therefore the single source of truth for both the scoring vocabulary and the score itself.

**Divergence from the requirements file.** `requirements/health-score-calculator.md` asks for "integration with CustomerSelector for real-time updates," which implies the widget subscribes to selection directly. That was the original design, but `customer-health-monitoring-spec.md` since made the container the single subscriber, so that the score shown to the user and the score the alert rules evaluated against cannot drift apart. This spec follows the container design: `CustomerHealthDisplay` is **presentational** — it receives a computed result via props, performs no `Customer` → factor-input mapping, and does not call `calculateHealthScore` itself. The user-visible behavior the requirements file asks for (score updates when selection changes) is unchanged.

**Relationship to `CustomerCard.healthScore`.** `CustomerCard` keeps rendering the denormalized `customer.healthScore` from `src/data/mock-customers.ts` — a cheap number always present on the record, requiring no factor data. This library computes a potentially *different* score from the four weighted factors. The two are allowed to disagree; reconciling them is deliberately out of scope (see Out of Scope). Both use the same red/yellow/green thresholds, so they never contradict each other on *color* for the same number.

## Requirements

### Functional Requirements

**Scoring**

- `calculateHealthScore` accepts the four factor inputs and returns an overall score in the closed range 0-100, a risk level, and a breakdown of the four factor sub-scores with their weights.
- The overall score is the weighted sum of four factor sub-scores, each itself in 0-100:
  - Payment history — **40%**
  - Engagement — **30%**
  - Contract status — **20%**
  - Support satisfaction — **10%**
- Each factor has its own exported, independently callable scoring function returning a 0-100 sub-score. Every function in the library is pure: same input, same output, no I/O, no mutation of its arguments.
- Higher sub-score always means healthier, for every factor. A factor input that gets worse never raises that factor's sub-score.
- Risk level classification from the overall score:
  - `critical` — 0 to 30 inclusive
  - `warning` — 31 to 70 inclusive
  - `healthy` — 71 to 100 inclusive
- The overall score is rounded to an integer before classification, so the risk level and the displayed number always agree.

**Validation and error handling**

- Inputs are validated before any calculation. Every numeric field falls into exactly one of two validation classes:
  - **Magnitudes** — counts, currency amounts, and *elapsed* durations (days since last payment, average delay, overdue amount, logins, feature usage, tickets, contract value, resolution time, escalations). `NaN`, infinite, and negative values are all rejected.
  - **Signed offsets** — `ContractInput.daysUntilRenewal` only. `NaN` and infinite values are rejected, but a negative value is **valid**: it means the renewal date has already passed. Rejecting it would throw for precisely the customers at highest churn risk, blanking their score rather than reporting it, and would break `predictive-alerts-spec.md`'s Contract Expiration Risk rule, which reads the same field. The contract scoring function floors the renewal-runway term at 0 instead, so a lapsed contract scores the same as renewal day itself.
  - Values outside a documented scale (e.g. a satisfaction score outside 1-5) are rejected regardless of class.
- Rejection throws `HealthScoreValidationError` (extending `Error`) naming the offending field and the reason. The function never returns a fabricated or clamped score for input it rejected.
- **Missing optional data is not an error.** A factor whose input is absent scores as **neutral (50)** rather than throwing or scoring 0, and the returned breakdown marks that factor as estimated so the UI can distinguish "no data" from "measured as average."
- **New customers** — a customer with no payment history, zero logins, and no support history is the extreme case of the above: each factor lacking data scores neutral, so a brand-new customer lands in `warning` rather than being reported `critical` purely for lack of history.

### User Interface Requirements

- `CustomerHealthDisplay` renders the overall score prominently, color-coded on the same thresholds `CustomerCard` uses: red 0-30, yellow 31-70, green 71-100.
- The risk level is rendered as text alongside the color, never conveyed by color alone (per `accessibility-spec.md`).
- An expandable/collapsible breakdown section lists all four factors with each factor's sub-score and its weight percentage. Collapsed is the default state.
- A factor scored neutral for missing data is visibly marked as such in the breakdown, not shown as an ordinary 50.
- **No selection** — renders a placeholder/empty state inviting customer selection. This is not an error state and not a zero score.
- **Loading** — renders a loading state while the container is resolving inputs.
- **Error** — when the container reports a failed calculation, renders an error state conveying that the score is unavailable, without crashing or blanking the dashboard.

### Data Requirements

All interfaces below are defined in `src/lib/healthCalculator.ts` and imported by `src/lib/alerts.ts` and `src/lib/riskFactors.ts`; those modules must not define competing versions.

- `PaymentHistoryInput` — days since last payment, average payment delay in days, overdue amount.
- `EngagementInput` — login frequency, feature usage count, support ticket count.
- `ContractInput` — days until renewal (signed; negative means already lapsed), contract value, whether a recent upgrade occurred.
- `SupportInput` — average resolution time, satisfaction score, escalation count.
- `HealthScoreResult` — overall score (integer 0-100), risk level (`'critical' | 'warning' | 'healthy'`), and the four factor entries, each carrying its sub-score, its weight, and whether it was estimated from missing data.
- Each interface documents the unit and valid range of every field (days, currency amount, count, satisfaction scale), since validation is specified against those ranges.
- The library does **not** import `Customer` from `src/data/mock-customers.ts`. It operates only on the interfaces above, so it stays reusable independent of the mock data shape.
- `CustomerHealthDisplayProps` carries the health result (or the absence of one) plus loading and error state supplied by the container.

### Integration Requirements

- `CustomerHealthMonitoring` owns the `Customer` → factor-input mapping and calls `calculateHealthScore`; `CustomerHealthDisplay` receives the result as props and computes nothing.
- Selection changes reaching the container produce an updated score and breakdown in the widget; a `null` selection produces the placeholder state, not an error.
- `alertEngine` consumes `HealthScoreResult` and the same factor inputs as rule input. Any change to the weights, risk bands, or interfaces here is a change to that contract.
- The widget sits in the dashboard grid alongside `PredictiveAlertsWidget` and `MarketIntelligenceWidget` and stays responsive per the existing dashboard layout conventions.

## Constraints

### Technical Stack

- TypeScript strict mode. The calculation library has no React, Next.js, or DOM dependency and is importable from a plain Node context.
- `CustomerHealthDisplay`: Next.js 15 (App Router), React 19, Tailwind CSS v4.

### Design Constraints

- Health colors use the same Tailwind red / yellow / green scales as `CustomerCard`, so the two widgets never show different colors for the same number.
- The score-to-color mapping is defined in exactly one place rather than duplicated per widget.
- Color contrast and accessible naming follow `accessibility-spec.md`; general naming, export, and error-class conventions follow `code-quality-spec.md`.

### File Structure and Naming

- Calculation library: `src/lib/healthCalculator.ts` — under `src/lib/`, **not** a root-level `lib/` as the requirements file writes it, so it resolves through the existing `@/*` → `./src/*` alias and sits beside `src/lib/alerts.ts` and `src/lib/riskFactors.ts`.
- Widget: `src/components/CustomerHealthDisplay.tsx`.
- Named exports only (`export function calculateHealthScore`, `export function CustomerHealthDisplay`); the default-export exception in `code-quality-spec.md` applies solely to `CustomerCard`.
- Interfaces are PascalCase and exported; tests are colocated (e.g. `src/lib/healthCalculator.test.ts`).

### Implementation Constraints

- Every exported function and interface carries a JSDoc comment. Scoring functions document the formula, the normalization used, and the business rationale for it — this is the "explainable algorithm" the requirements file asks for, recorded in the code rather than a separate document.
- Validation failures use `HealthScoreValidationError`; no thrown strings, no generic `Error`.
- `CustomerHealthDisplay` is a client component (`'use client'`) because it owns expand/collapse state.
- No new runtime npm dependencies. A dev-only test runner may be added, since the project currently has none configured (`package.json` defines only `dev`, `build`, `start`, `lint`, `type-check`).
- Calculation is synchronous and cheap; the container memoizes by customer id and input data, so the library needs no internal caching.

### Security Considerations

- No network calls, file access, or other I/O from the calculation library.
- All values rendered as text through JSX; no `dangerouslySetInnerHTML`.
- No customer names, emails, contract values, or factor data written to `console` or thrown error messages — validation errors name the *field* and the rule violated, not the customer or the raw value.

## Acceptance Criteria

- [ ] `calculateHealthScore` returns an integer score within 0-100 for every valid input, including realistic scenarios drawn from `mockCustomers`
- [ ] The overall score equals the 40/30/20/10 weighted sum of the payment, engagement, contract, and support sub-scores, verified against hand-computed expected values
- [ ] Each of the four factor scoring functions is exported, independently unit-tested, and returns a value within 0-100
- [ ] Each factor scoring function is monotonic in the healthy direction: worsening an input never increases that factor's sub-score
- [ ] Every function returns identical output for identical input across repeated calls and does not mutate its arguments
- [ ] Risk level is `critical` at 0 and 30, `warning` at 31 and 70, and `healthy` at 71 and 100
- [ ] `NaN`, infinite, and out-of-documented-range field values each throw `HealthScoreValidationError` naming the offending field, and no score is returned
- [ ] A negative value throws for every magnitude field, and does **not** throw for `contract.daysUntilRenewal`
- [ ] A negative `contract.daysUntilRenewal` scores identically to `0` and still produces a full result from `calculateHealthScore`
- [ ] `HealthScoreValidationError` is an `instanceof Error` and its message contains no customer name, email, or raw field value
- [ ] A factor with absent input scores 50 and is flagged as estimated in the returned breakdown
- [ ] A customer with no payment history, zero logins, and no support history returns a `warning` risk level rather than `critical`, without throwing
- [ ] `CustomerHealthDisplay` renders the score with red at 0-30, yellow at 31-70, green at 71-100, matching `CustomerCard` at boundary values 0, 30, 31, 70, 71, 100
- [ ] The risk level appears as text or an accessible name wherever color is used, never color alone
- [ ] The breakdown is collapsed by default, expands and collapses via keyboard alone, and lists all four factors with sub-score and weight
- [ ] A factor flagged as estimated is visually distinguishable from a measured score of 50
- [ ] Passing no health result renders the placeholder state — not an error, not a zero score
- [ ] The loading state renders while the container reports loading, and is announced to screen readers
- [ ] The error state renders when the container reports a calculation failure, without crashing or blanking the dashboard
- [ ] `CustomerHealthDisplay` contains no call to `calculateHealthScore` and no `Customer` → factor-input mapping
- [ ] `src/lib/healthCalculator.ts` has no import from `src/data/mock-customers.ts` and no React import
- [ ] `src/lib/alerts.ts` and `src/lib/riskFactors.ts` import the factor input interfaces and `HealthScoreResult` from this library rather than redefining them
- [ ] Every exported function and interface has a JSDoc comment; scoring functions document formula, normalization, and rationale
- [ ] Meets `accessibility-spec.md` and `code-quality-spec.md`
- [ ] Unit tests cover per-factor scoring, weighted combination, every risk-level boundary value, validation rejection, and missing-data fallback, and pass
- [ ] `npm run type-check` passes with no errors
- [ ] `npm run lint` passes with no errors or warnings

## Out of Scope

- Reconciling `Customer.healthScore` with the calculated score — writing the computed score back into the mock data, or making `CustomerCard` read from `calculateHealthScore`. The two are allowed to diverge; unifying them is a future decision.
- The `Customer` → factor-input mapping and the container wiring — owned by `customer-health-monitoring-spec.md` (`toRiskFactors`, `src/lib/riskFactors.ts`).
- Alert rules and thresholds that consume this score — owned by `predictive-alerts-spec.md`.
- Trend analysis, historical score tracking, and improving-vs-declining direction, which the requirements file raises as a consideration but which needs a score history this system does not have.
- Persisting scores, caching beyond the container's memoization, and any server or database work.
- A/B testing infrastructure for algorithm variants, production monitoring, and calibration tooling.
- Portfolio-wide scoring across all customers at once; this scores the one selected customer.
