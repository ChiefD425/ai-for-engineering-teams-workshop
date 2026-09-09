# Feature: Predictive Alerts System

## Context
- Proactive risk-monitoring widget for the Customer Intelligence Dashboard: flags customers who need attention before they churn
- Built on the same customer risk-factor data as `health-score-calculator-spec.md` — reuses those input interfaces rather than redefining payment/engagement/contract/support data shapes
- Integrates with `CustomerSelector` (via the `onCustomerSelect` callback defined in `customer-selector-spec.md`) and sits in the dashboard grid alongside `CustomerHealthDisplay` and `MarketIntelligenceWidget`
- Like `health-score-calculator-spec.md` and `market-intelligence-spec.md`, this is a workshop feature: alert evaluation runs against mock/simulated data, not a real production monitoring pipeline

## Requirements

### Alert Rules Engine
- Pure rule-evaluation functions in `src/lib/alerts.ts` (same directory convention as `src/lib/healthCalculator.ts` — see Constraints)
- Two priority tiers only, matching the requirements: **High Priority** (immediate action) and **Medium Priority** (monitor closely). There is no "low priority/all clear" alert tier — a customer with no triggered rules simply has no alerts
- Each rule is an independent pure function: `(input) => Alert | null`
- A single `alertEngine(customer, riskFactors)` function runs all rules for one customer and returns the resulting alerts (empty array if none triggered)
- Configurable thresholds per rule (not hardcoded magic numbers scattered through rule bodies) so thresholds can be tuned without touching evaluation logic
- Cooldown period per (customer, rule) pair to prevent re-firing the same alert repeatedly in a short window
- Deduplication: at most one active alert per (customer, rule type) at a time

### High Priority Alert Rules
- **Payment Risk**: payment overdue >30 days, OR health score dropped >20 points within the last 7 days
- **Engagement Cliff**: login frequency dropped >50% versus the trailing 30-day average
- **Contract Expiration Risk**: contract expires in <90 days AND current health score <50

### Medium Priority Alert Rules
- **Support Ticket Spike**: more than 3 support tickets in 7 days, OR any escalated ticket
- **Feature Adoption Stall**: no new feature usage in 30 days, for accounts otherwise classified as growing

### Alert Prioritization and Delivery
- Within a priority tier, alerts are ordered using a scoring function that weighs customer value (ARR/contract value) and urgency/recency — higher-value, more-urgent alerts surface first
- Business-hours consideration for alert delivery is a display/timing concern only (e.g. "show a subtler indicator outside business hours"); rule evaluation itself is not time-of-day gated

### User Interface Components
- `PredictiveAlertsWidget` in the main dashboard grid, listing active alerts for the currently selected customer (via `CustomerSelector`'s `onCustomerSelect`)
- Alert priority color coding: **red = High Priority**, **yellow = Medium Priority**. There is no green "alert" state — a customer with zero active alerts renders a neutral "no active alerts" state (not a green alert badge), keeping the red/yellow/green convention meaning "problem severity," consistent with how `CustomerCard`/`CustomerHealthDisplay` use green to mean "healthy," not "an alert exists"
- Alert detail panel showing the triggering rule, relevant data points, and a recommended action
- Dismiss action per alert, with the dismissal tracked (not just hidden and re-fired next cycle — respects the cooldown/dedup rule above)
- Historical/dismissed alerts view, separate from the active list

## Requirements — Data
- Reuses the exact `PaymentHistoryInput`, `EngagementInput`, `ContractInput`, and `SupportInput` interfaces defined in `health-score-calculator-spec.md` / `lib/healthCalculator.ts` as the rule engine's input — this system does not define its own competing versions of these shapes
- Also reads the customer's current health score and risk level (from `calculateHealthScore`) as an input to the Payment Risk and Contract Expiration Risk rules
- Alert type shape: id, customer id, rule type, priority (`'high' | 'medium'`), triggered-at timestamp, recommended action text, dismissed flag

## Constraints

### Technical Stack
- TypeScript strict mode; rules engine has no React/UI dependency
- Next.js 15, React 19, Tailwind CSS v4 for the widget

### File Structure
- Rules engine: `src/lib/alerts.ts` (co-located with `src/lib/healthCalculator.ts` under the same `src/lib/` convention — see the note in `health-score-calculator-spec.md` about standardizing on `src/lib/` instead of a root-level `lib/`, so both libraries share one importable location under the `@/lib/*` alias)
- Widget: `src/components/PredictiveAlertsWidget.tsx`

### Implementation Constraints
- All rule functions and `alertEngine` are pure: given the same customer + risk-factor input, they return the same alerts (cooldown/dedup state is passed in/out explicitly, not hidden as internal mutable module state, so the engine itself stays testable and side-effect-free)
- Widget is a client component (`'use client'`) since it manages dismiss interactions and re-renders on selection change
- No new npm dependencies

### Security Considerations
- Alert messages never include raw sensitive customer data (e.g. full payment details) — only the minimum needed to act (e.g. "payment overdue 34 days," not account numbers)
- All rule inputs validated before evaluation; malformed input produces a validation error, not a fabricated alert
- Rate limiting consideration on alert generation so a flapping metric can't spam the dedup/cooldown system

## Acceptance Criteria

- [ ] Each of the 5 defined rules (Payment Risk, Engagement Cliff, Contract Expiration Risk, Support Ticket Spike, Feature Adoption Stall) is independently unit-tested with both a triggering and a non-triggering case
- [ ] `alertEngine` returns an empty array for a customer that triggers no rules
- [ ] Alerts are correctly split into `high`/`medium` priority per the rule definitions above
- [ ] Cooldown prevents the same (customer, rule) alert from re-firing within the cooldown window
- [ ] Alerts for the same (customer, rule) are deduplicated — never more than one active instance
- [ ] Within a priority tier, higher customer-value/more-urgent alerts are ordered first
- [ ] Widget shows red for high-priority and yellow for medium-priority alerts, and a neutral "no active alerts" state (not green) when there are none
- [ ] Dismissing an alert removes it from the active list and it does not re-appear immediately (respects cooldown/dedup)
- [ ] Historical/dismissed alerts are viewable separately from active alerts
- [ ] Widget updates when the selected customer changes via `CustomerSelector`'s `onCustomerSelect`
- [ ] Rule input interfaces are imported from `health-score-calculator-spec.md`'s data model, not redefined
- [ ] `npm run type-check` and `npm run lint` pass with no errors
- [ ] Meets `accessibility-spec.md` (keyboard-operable dismiss/detail controls, color paired with text, live region for newly-arrived alerts) and `code-quality-spec.md`

## Out of Scope
- Real-time push/websocket delivery of alerts (evaluation is on-demand/simulated for the workshop)
- Alert effectiveness analytics, A/B testing of thresholds, and production monitoring/calibration tooling
- Cross-session alert state synchronization (single-session, in-memory for this spec)
- Export of alert history (covered, if pursued, by `production-ready-dashboard-spec.md`'s export system)
