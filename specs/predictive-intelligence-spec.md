# Feature: Predictive Customer Intelligence

## Context
- Integration feature that fuses **internal** risk signals (the alert rules engine from `predictive-alerts-spec.md`) with **external** market signals (the sentiment/news service from `market-intelligence-spec.md`) into a single view of "what is about to go wrong with this customer, and is the market making it worse?"
- Neither source feature knows about the other today: `predictive-alerts-spec.md` explicitly scopes out market data, and `market-intelligence-spec.md` explicitly scopes out "Predictive Alerts widget and any cross-widget alerting logic." This spec owns that seam — it is the only place where alerts and market data meet
- Composition, not replacement: this feature **consumes** `alertEngine` (`src/lib/alerts.ts`) and `MarketIntelligenceService` (`src/services/marketIntelligenceService.ts`) as-is. It does not fork their rules, thresholds, caches, or data shapes
- Driven by the currently selected customer from `CustomerSelector`'s `onCustomerSelect` callback (see `customer-selector-spec.md`), same as both source widgets
- Workshop feature: market data is mock-generated (`src/data/mock-market-intelligence.ts`) and alert evaluation runs on demand against mock customer risk factors. There is no production monitoring pipeline behind this

## Integration Architecture

### Component Interaction

```
                    CustomerSelector
                  (onCustomerSelect)
                           |
                    selectedCustomer
                           |
              +------------+-------------+
              |                          |
   alertEngine(customer,        MarketIntelligenceService
      riskFactors)              -> /api/market-intelligence/[company]
   [src/lib/alerts.ts]          [10-min TTL cache]
              |                          |
           Alert[]                  MarketData | null
              |                          |
              +------------+-------------+
                           |
              correlateIntelligence(alerts, marketData, customer)
                  [src/lib/predictiveIntelligence.ts]  (pure)
                           |
                PredictiveIntelligenceResult
              { summary, enrichedAlerts[] }
                           |
                PredictiveIntelligencePanel
                  (summary + ordered alert list)
                           |
                    dismiss action
                           |
              back to alerts feature's cooldown/dedup state
```

### Data Flow
1. `CustomerSelector` reports the selected customer (or `null`).
2. The panel triggers two independent reads: alert evaluation (synchronous, pure) and the market lookup (async, cached).
3. Alerts render as soon as they are available; market data joins when it resolves.
4. `correlateIntelligence` combines both into enriched alerts and a summary; with `marketData === null` it returns the alerts-only shape.
5. Dismissals are forwarded to the alerts feature, whose cooldown/dedup rules decide what remains active; the panel re-derives from that result.

### Key Integration Points
- `onCustomerSelect` — the single trigger for both data sources
- `alertEngine` — sole authority on whether an alert exists and its priority tier
- `MarketIntelligenceService` — sole authority on sentiment, headlines, and market caching
- `correlateIntelligence` — sole authority on cross-source correlation, adjusted ordering, and `riskOutlook`

### Dependencies on Existing Specs
- `predictive-alerts-spec.md` — rules engine, alert shape, priority tiers, cooldown/dedup, dismiss semantics
- `market-intelligence-spec.md` — API route, service class, `MarketIntelligenceError`, TTL cache, sentiment shape
- `health-score-calculator-spec.md` — risk-factor input interfaces and `calculateHealthScore`
- `customer-selector-spec.md` — selection contract (`onCustomerSelect`)
- `production-ready-dashboard-spec.md` — grid layout, error boundaries, export
- `accessibility-spec.md`, `code-quality-spec.md` — cross-cutting quality bars

## Requirements

### Correlation Engine
- Pure functions in `src/lib/predictiveIntelligence.ts` (same `src/lib/` convention as `alerts.ts` and `healthCalculator.ts`)
- Entry point: `correlateIntelligence(alerts, marketData, customer)` returning a `PredictiveIntelligenceResult` — enriched alerts plus a customer-level summary
- The engine takes **already-computed** alerts and **already-fetched** market data as arguments. It performs no rule evaluation of its own and no data fetching, so it stays pure and independently testable
- Market data is an **optional** input. When market data is absent, unavailable, or stale, every alert passes through unmodified with `marketContext: null` and the summary is computed from alerts alone — market intelligence is never a hard dependency of the alert view

### Market-Adjusted Alert Severity
- Each alert is enriched with a `marketContext` describing whether external sentiment amplifies or dampens it
- Amplification rule: **negative** market sentiment for the customer's company raises an alert's ranking weight; **positive** sentiment lowers it; **neutral** leaves it unchanged
- Amplification adjusts **ordering weight and displayed context only** — it never changes an alert's `priority` tier (`'high' | 'medium'`). Tier assignment remains solely owned by the rules in `predictive-alerts-spec.md`, so the two widgets can never disagree about whether an alert is high priority
- Amplification cannot create or suppress an alert. No market sentiment, however negative, generates an alert for a customer whose rules did not trigger; no positive sentiment hides a triggered alert
- Ordering: alerts are sorted by priority tier first (high before medium), then by the market-adjusted score built on top of the existing customer-value/urgency scoring from `predictive-alerts-spec.md`

### Combined Risk Summary
- Customer-level summary containing: internal risk (health score and risk level from `calculateHealthScore`), active alert counts per tier, market sentiment label and score, and a combined `riskOutlook` of `'stable' | 'watch' | 'urgent'`
- `riskOutlook` derivation is explicit and threshold-driven (configurable, not magic numbers inline): any high-priority alert ⇒ at minimum `watch`; a high-priority alert **plus** negative market sentiment ⇒ `urgent`; no alerts and non-negative sentiment ⇒ `stable`
- Summary states plainly when market data is missing (e.g. "market data unavailable"), rather than silently treating unavailable as neutral in the displayed rationale

### UI Component
- `PredictiveIntelligencePanel` in `src/components/PredictiveIntelligencePanel.tsx`, rendered in the dashboard grid
- Shows the combined risk summary at the top, then the market-adjusted, ordered alert list
- Each alert row shows its priority color (red = high, yellow = medium, per `predictive-alerts-spec.md`) plus, when present, a market-context badge indicating amplified / dampened / unchanged with the sentiment that caused it
- Expanding an alert shows the triggering rule, its data points, the recommended action (all from the alert itself) and the top market headlines that informed the market context
- Colour is always paired with text, and the amplified/dampened distinction is never conveyed by colour alone
- Independent loading and error states for the two data sources: alerts can render while market data is still in flight, and a market fetch failure degrades to the alerts-only view with a non-blocking notice — it does not blank the panel
- No customer selected: neutral placeholder state, no evaluation and no fetch

### Data Flow Ownership
- Alerts come from `alertEngine(customer, riskFactors)`; input interfaces (`PaymentHistoryInput`, `EngagementInput`, `ContractInput`, `SupportInput`) are imported from the health-score data model, never redefined here
- Market data comes from the existing `/api/market-intelligence/[company]` route via `MarketIntelligenceService`, keyed on `selectedCustomer.company`. This feature adds **no** new API route and no second cache — it reuses the service's existing 10-minute TTL cache
- Dismiss/cooldown/dedup state remains owned by the alerts feature. This panel forwards dismiss actions to it and re-derives its view from the result

## Constraints

### Technical Stack
- Next.js 15 App Router, TypeScript strict mode, React 19, Tailwind CSS v4
- Correlation engine has no React dependency and no I/O
- Panel is a client component (`'use client'`) — it fetches market data and handles expand/dismiss interactions

### File Structure
- Correlation engine: `src/lib/predictiveIntelligence.ts`
- Panel: `src/components/PredictiveIntelligencePanel.tsx`
- Consumes without modifying: `src/lib/alerts.ts`, `src/services/marketIntelligenceService.ts`, `src/data/mock-market-intelligence.ts`

### Implementation Constraints
- No new npm dependencies
- No duplication of alert rules, thresholds, sentiment calculation, or caching logic already specified elsewhere — import them
- Sentiment→amplification mapping lives in one exported, configurable place so it can be tuned without touching correlation logic
- Colour conventions match the dashboard-wide convention (green = good, yellow = moderate, red = poor); this feature introduces no new palette

### Security Considerations
- Company name is validated before being used for the market lookup (delegated to the existing service-layer validation, not re-implemented loosely here)
- Enriched alert text inherits the alerts feature's rule: no raw sensitive customer data in messages
- Headlines and company names are rendered via JSX only; no `dangerouslySetInnerHTML`
- Market fetch failures surface sanitized messages only; internal error detail stays out of the UI

## Acceptance Criteria

- [ ] `correlateIntelligence` is pure: same alerts + market data + customer always yields the same result, with no fetching or rule evaluation inside it
- [ ] Negative sentiment raises an alert's ordering weight; positive lowers it; neutral leaves it unchanged
- [ ] Market amplification never changes an alert's `priority` tier — the tier matches `alertEngine`'s output exactly
- [ ] Market sentiment alone never creates an alert for a customer with no triggered rules, and never suppresses a triggered alert
- [ ] Alerts are ordered by priority tier first, then by market-adjusted score
- [ ] `marketData === null` (absent, unavailable, or stale) yields every alert with `marketContext: null` and a summary computed from alerts alone
- [ ] `riskOutlook` returns `urgent` for a high-priority alert plus negative sentiment, at least `watch` for any high-priority alert, and `stable` for no alerts with non-negative sentiment
- [ ] Summary explicitly reports "market data unavailable" rather than presenting missing data as neutral
- [ ] Panel renders alerts before market data resolves, and a market fetch failure degrades to an alerts-only view with a non-blocking notice
- [ ] Amplified / dampened / unchanged state is conveyed by text, not colour alone
- [ ] Expanding an alert shows its rule, data points, recommended action, and the informing headlines
- [ ] Dismissing an alert from this panel respects the alerts feature's cooldown/dedup — it does not immediately re-appear
- [ ] Switching selected customer re-evaluates alerts and re-keys the market lookup on the new company
- [ ] No customer selected renders a neutral placeholder with no evaluation and no network request
- [ ] Market lookups hit the existing service cache — this feature adds no second cache and no new API route
- [ ] Alert and risk-factor interfaces are imported from the existing specs' data models, not redefined
- [ ] `npm run type-check` and `npm run lint` pass with no errors
- [ ] Meets `accessibility-spec.md` (keyboard-operable expand/dismiss, colour paired with text, live region for newly surfaced alerts) and `code-quality-spec.md`

## Out of Scope
- New alert rules, threshold changes, or a third priority tier (owned by `predictive-alerts-spec.md`)
- Real external market/news APIs, sentiment model changes, or historical sentiment trends (owned by `market-intelligence-spec.md`)
- Real-time push/websocket delivery and cross-session state synchronization
- Sector- or peer-level market analysis beyond the customer's own company
- Alert effectiveness analytics, threshold A/B testing, and correlation backtesting against real churn outcomes
- Export of the combined view (covered, if pursued, by `production-ready-dashboard-spec.md`'s export system)
