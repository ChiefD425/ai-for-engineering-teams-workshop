# Feature: Customer Health Monitoring (Integration)

## Context
- Composite dashboard feature that joins the two independently-specified pieces of customer risk into one coherent monitoring surface: the scoring library from `health-score-calculator-spec.md` and the rules engine from `predictive-alerts-spec.md`
- This spec owns the **seam between them**, not either side's internals. It does not redefine scoring weights, risk-level bands, alert rules, or thresholds — those remain owned by their source specs and are referenced here
- The problem it solves: today those two specs each independently take a selected customer, each independently map raw customer data into factor inputs, and each independently recompute. Alerts also need the health score and risk level as rule input (`predictive-alerts-spec.md`, Payment Risk and Contract Expiration Risk), so without a shared layer the score gets computed twice per selection and can drift between what `CustomerHealthDisplay` shows and what the alert rules evaluated against
- Introduces `CustomerHealthMonitoring`, a container that subscribes to `CustomerSelector`'s `onCustomerSelect` once, builds the factor inputs once, calls `calculateHealthScore` once, feeds that result into `alertEngine`, and distributes both results to `CustomerHealthDisplay` and `PredictiveAlertsWidget` as props
- Workshop-scoped: runs against mock/simulated customer data, same as its two source specs

## Integration Architecture

### Component interaction

```
                    CustomerSelector
                  (customer-selector-spec.md)
                            |
                 onCustomerSelect(Customer | null)
                            v
              +-----------------------------------+
              |     CustomerHealthMonitoring      |
              |            (container)            |
              |                                   |
              |  1. toRiskFactors(customer)       |
              |  2. calculateHealthScore(factors) |
              |  3. alertEngine(customer,         |
              |        factors, healthResult,     |
              |        alertState)                |
              +-----------------------------------+
                       |                  |
        healthResult   |                  |  alerts[]
        (score, level, |                  |  onDismiss
         breakdown)    v                  v
        CustomerHealthDisplay      PredictiveAlertsWidget
     (health-score-calculator)      (predictive-alerts)
```

### Data flow
1. `CustomerSelector` reports a selection change (a `Customer` or `null`).
2. On `null`, the container clears state and both children render their placeholder/empty states — not error states.
3. On a `Customer`, the container maps it to the four factor input shapes (`PaymentHistoryInput`, `EngagementInput`, `ContractInput`, `SupportInput`) defined in `src/lib/healthCalculator.ts`. This mapping lives in exactly one place — the container — and is the single owner of "how a `Customer` becomes risk-factor inputs."
4. The container calls `calculateHealthScore(factors)` once, producing the overall score, risk level, and factor breakdown.
5. The container calls `alertEngine(customer, factors, healthResult, alertState)`, passing the *same* factor inputs and the *already-computed* health result, so alert rules evaluate against exactly the numbers the user is looking at.
6. Both results are passed down as props. Children stay presentational with respect to computation — neither child calls `calculateHealthScore` or `alertEngine` itself.
7. Dismiss actions bubble up from `PredictiveAlertsWidget` to the container, which owns the cooldown/dedup state that `alertEngine` requires as explicit input/output.

### Key integration points
- **`CustomerSelector.onCustomerSelect`** — the single entry point; subscribed once by the container, not once per widget
- **Factor input interfaces** — the shared vocabulary between the two libraries, defined once in `health-score-calculator-spec.md` and imported, never redefined
- **`HealthScoreResult` → `alertEngine`** — the score/risk-level dependency edge that makes ordering matter: scoring must complete before alert evaluation
- **Alert cooldown/dedup state** — lifted to the container so it survives customer-selection changes within a session (switching away from a customer and back must not re-fire a dismissed alert)

### Dependencies on existing specs
- `health-score-calculator-spec.md` — `calculateHealthScore`, factor input interfaces, `CustomerHealthDisplay`
- `predictive-alerts-spec.md` — `alertEngine`, alert rules and thresholds, `PredictiveAlertsWidget`
- `customer-selector-spec.md` — `onCustomerSelect` contract
- `customer-card-spec.md` — red/yellow/green color convention this feature must stay consistent with
- `accessibility-spec.md`, `code-quality-spec.md` — cross-cutting requirements

## Requirements

### Container Behavior
- `CustomerHealthMonitoring` accepts the currently selected customer (`Customer | null`) as a prop and renders both `CustomerHealthDisplay` and `PredictiveAlertsWidget`
- Performs the `Customer` → factor-inputs mapping exactly once per selection change, and passes the resulting inputs to both downstream consumers
- Calls `calculateHealthScore` before `alertEngine`, and passes the health result into `alertEngine` — alerts never trigger a second, independent score calculation
- Owns and threads the alert cooldown/dedup state, keeping `alertEngine` pure per `predictive-alerts-spec.md`
- Memoizes the computation by customer id + input data, so re-renders that do not change the underlying data do not recompute score or alerts

### Consistency Guarantees
- The score shown in `CustomerHealthDisplay` and the score that alert rules evaluated against are the same value for a given selection — they cannot disagree
- Color coding is consistent across both widgets and with `CustomerCard`: green/yellow/red mean health severity in `CustomerHealthDisplay`; red/yellow mean alert priority in `PredictiveAlertsWidget`, with a neutral (not green) "no active alerts" state, per `predictive-alerts-spec.md`
- A customer classified `critical` by the scorer while showing zero alerts is a valid, non-contradictory state (the rules simply did not trigger) — the UI must not imply otherwise, e.g. by labelling the empty alert list "all clear"

### State Handling
- **No selection (`null`)**: both children render placeholder/empty states; no calculation runs, no error is shown
- **Loading**: while inputs are being resolved, both children render their loading states in a coordinated way — one widget must not show stale data for the previous customer while the other shows the new one
- **Score calculation fails** (validation error from `calculateHealthScore`): `CustomerHealthDisplay` renders its error state, and `PredictiveAlertsWidget` renders a degraded state for the score-dependent rules rather than evaluating them against a fabricated score. Rules that do not depend on the health score (Engagement Cliff, Support Ticket Spike, Feature Adoption Stall) still evaluate and display
- **Alert evaluation fails**: `PredictiveAlertsWidget` renders its error state; `CustomerHealthDisplay` is unaffected and still shows the score
- A failure in either half never blanks the other half, and never crashes the dashboard

### Data Requirements
- Imports factor input interfaces and `calculateHealthScore`'s return type from `src/lib/healthCalculator.ts`; imports alert types and `alertEngine` from `src/lib/alerts.ts`. Defines no competing versions of either
- Defines one new mapping function, `toRiskFactors(customer: Customer): RiskFactorInputs`, where `RiskFactorInputs` bundles the four existing factor input interfaces. This is the only new data shape this spec introduces
- Missing or partial factor data on a `Customer` is handled by the documented fallback behavior already specified in `health-score-calculator-spec.md` — this spec does not invent a second policy for it

## Constraints

### Technical Stack
- TypeScript strict mode, Next.js 15 (App Router), React 19, Tailwind CSS v4

### File Structure
- Container: `src/components/CustomerHealthMonitoring.tsx`
- Mapping function: `src/lib/riskFactors.ts` (pure, no React dependency, colocated with the other two libraries under `src/lib/`)
- Tests colocated per project convention (e.g. `src/lib/riskFactors.test.ts`)

### Implementation Constraints
- `toRiskFactors` is pure and independently unit-testable
- Container is a client component (`'use client'`) since it holds selection-derived and alert-dismissal state
- No changes to `calculateHealthScore`, `alertEngine`, or their rule/weight definitions — if this integration reveals a needed change to either, that change belongs in the owning spec
- No new npm dependencies

### Layout
- Both widgets sit in the dashboard grid and remain responsive per the existing dashboard layout conventions; the container adds coordination, not a new visual chrome/wrapper of its own

### Security Considerations
- Inherits the security constraints of both source specs; adds no new data exposure. In particular, the shared factor inputs are not rendered raw — each widget continues to display only what its own spec permits

## Acceptance Criteria

- [ ] Selecting a customer via `CustomerSelector` updates both `CustomerHealthDisplay` and `PredictiveAlertsWidget` from a single selection event
- [ ] `calculateHealthScore` is called exactly once per selection change, and its result is the input to `alertEngine` (verifiable by test spy/assertion)
- [ ] The score rendered by `CustomerHealthDisplay` equals the score the alert rules evaluated against, for the same selection
- [ ] `toRiskFactors` is unit-tested, including customers with missing/partial factor data
- [ ] Selecting `null` clears both widgets to placeholder states with no error and no calculation
- [ ] A score validation error shows `CustomerHealthDisplay`'s error state while non-score-dependent alert rules still evaluate and render
- [ ] An alert evaluation error shows `PredictiveAlertsWidget`'s error state while the health score still renders
- [ ] Neither failure mode crashes the dashboard or blanks the other widget
- [ ] Dismissing an alert, switching to another customer, and switching back does not re-fire the dismissed alert (cooldown/dedup state survives selection changes within the session)
- [ ] Re-rendering without a data change does not recompute score or alerts
- [ ] Zero active alerts renders a neutral state, not a green "all clear," even when the health score is `critical`
- [ ] Factor input interfaces and library functions are imported from the existing libraries, not redefined
- [ ] `npm run type-check` and `npm run lint` pass with no errors or warnings
- [ ] Meets `accessibility-spec.md` (coordinated loading states announced, color paired with text, keyboard-operable controls) and `code-quality-spec.md`

## Out of Scope
- Any change to the scoring algorithm, weights, risk bands, alert rules, thresholds, or cooldown durations — owned by `health-score-calculator-spec.md` and `predictive-alerts-spec.md`
- Reconciling `Customer.healthScore` with the calculated score — explicitly deferred by `health-score-calculator-spec.md` and not resolved here
- Multi-customer / portfolio-wide monitoring (this container monitors the one selected customer); bulk evaluation across the customer list belongs to `production-ready-dashboard-spec.md`
- Historical trend tracking of score or alert volume over time
- Persistence of alert dismissal state beyond the current session, and cross-session synchronization
- Real-time push updates; evaluation is driven by selection changes and on-demand refresh
