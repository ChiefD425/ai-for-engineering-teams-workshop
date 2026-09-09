# Feature: DashboardOrchestrator

## Context
- Defines the **composition root** of the Customer Intelligence Dashboard: the single component/module responsible for assembling `CustomerSelector`, `CustomerHealthDisplay`, `MarketIntelligenceWidget`, and `PredictiveAlertsWidget` into one coherent, production-ready page
- Every widget spec to date describes a widget *in isolation* — its props, its own loading/error/empty states, its own data source. None of them owns the questions this spec answers: who holds the selected customer, in what order widgets load, what happens to the page when one widget dies, and how a single export action reaches four different data sources
- **Relationship to `production-ready-dashboard-spec.md`**: that spec is a cross-cutting *hardening* pass (which boundaries exist, what CSP to set, what the performance targets are). This spec is the *wiring* — where those boundaries are mounted, which component owns which state, and how data flows between the pieces. Where they overlap, `production-ready-dashboard-spec.md` owns the requirement and this spec owns the placement. Numeric performance targets, CSP/header config, and `ExportUtils`' file formats are not restated here
- Accessibility defers entirely to `accessibility-spec.md`; code quality defers to `code-quality-spec.md`
- This spec adds **no new business logic**. Health scoring, alert generation, and market data all remain owned by their existing specs

## Integration Architecture

### Component Interaction Diagram
```
                        DashboardErrorBoundary
                                 │
                       DashboardOrchestrator
        (owns: selectedCustomer, widgetHealth, exportRequest)
                                 │
   ┌──────────────┬──────────────┼──────────────┬───────────────┐
   │              │              │              │               │
CustomerSelector  │        WidgetErrorBoundary (one per registry entry)
   │              │              │              │               │
   │      CustomerHealthDisplay  │   MarketIntelligenceWidget  PredictiveAlertsWidget
   │              │              │              │               │
   ▼              ▼              │              ▼               ▼
GET /api/customers  calculateHealthScore   GET /api/market-      alerts engine
   │              (src/lib/healthCalculator)  intelligence/         (src/lib/alerts)
CustomerService                              [company]
   │                                             │
mockCustomers (seed)                    MarketIntelligenceService

                    ExportUtils  ◄── orchestrator only
```

### Data Flow Description
1. Orchestrator mounts → `CustomerSelector` fetches the customer list via `GET /api/customers` (`CustomerService`, seeded from `mockCustomers`)
2. User selects a customer → `onCustomerSelect` lifts the `Customer` into orchestrator state
3. Orchestrator fans the selected customer out to all customer-dependent widgets simultaneously; each widget fetches or computes independently
4. Each widget reports terminal status (ok / degraded / failed) up into `widgetHealth`; failures are contained by that widget's boundary
5. An export request reads current data from each contributing source, skips failed widgets, and calls `ExportUtils` once
6. Every step above emits a monitoring event through the single telemetry seam

### Key Integration Points
- **`Customer` interface** (`src/data/mock-customers.ts`) — the shared currency between selector and all widgets; the orchestrator passes it through unmodified
- **`onCustomerSelect`** — the only upward data path from selector to orchestrator
- **`widgetHealth`** — the only upward data path from widgets to orchestrator; drives degraded UI, export exclusion, and telemetry
- **Boundary mount points** — orchestrator-side, one per registry entry plus one at the root
- **`ExportUtils`** — called from exactly one place in the app

### Dependencies on Existing Specs
- `customer-selector-spec.md` — selection callback contract, 100+ customer performance expectation, API-sourced list
- `customer-card-spec.md` — card presentation reused inside the selector; stays a boundary-free server component
- `health-score-calculator-spec.md` — `calculateHealthScore` and `CustomerHealthDisplay`'s input mapping
- `market-intelligence-spec.md` — `/api/market-intelligence/[company]` contract and `MarketIntelligenceService`
- `predictive-alerts-spec.md` — `PredictiveAlertsWidget` and the `Alert` shape
- `customer-management-integration-spec.md` — `CustomerService`, `GET /api/customers`, state restoration on return from customer management
- `production-ready-dashboard-spec.md` — error boundary components, `ExportUtils`, performance targets, security headers
- `accessibility-spec.md`, `code-quality-spec.md` — cross-cutting checklists

## Requirements

### Ownership and Shared State
- `DashboardOrchestrator` is the single owner of dashboard-level shared state; widgets remain prop-driven and stateless with respect to selection
- Orchestrator-owned state:
  - `selectedCustomer: Customer | null` — set from `CustomerSelector`'s `onCustomerSelect`, passed down to `CustomerHealthDisplay`, `MarketIntelligenceWidget`, and `PredictiveAlertsWidget`
  - `widgetHealth: Record<WidgetId, 'ok' | 'degraded' | 'failed'>` — per-widget status reported upward, used to drive degraded-mode UI and monitoring
  - `exportRequest` — the in-flight export job, if any (see Export Coordination)
- No widget reads or writes another widget's state directly. All cross-widget communication goes through the orchestrator
- Selection state survives navigation to and from the customer management view (`customer-management-integration-spec.md` requires prior dashboard state be restored on return)
- Changing the selected customer cancels/ignores in-flight fetches for the previously selected customer, so a slow response for customer A can never render into a dashboard now showing customer B

### Widget Registry and Composition
- Widgets are composed from a declarative registry rather than hand-wired JSX, so a widget can be added, reordered, or feature-flagged off without editing the layout
- Each registry entry declares: stable `id`, display title, the component, whether it requires a selected customer, and its load priority (`'eager' | 'lazy'`)
- Widgets requiring a selected customer render a shared "select a customer" empty state — the orchestrator provides this, so the message and styling are identical across widgets rather than reimplemented in each
- Layout is a responsive grid consistent with the existing dashboard shell; registry order determines visual order

### Data Flow and Loading Sequence
- `CustomerSelector` sources its list from `GET /api/customers` via `CustomerService` (per `customer-management-integration-spec.md`), not from a direct `mockCustomers` import
- Widget data fetching is **parallel and independent** — `MarketIntelligenceWidget`'s slow external API must never block `CustomerHealthDisplay`, which is a pure client-side calculation
- Load priority: customer list and `CustomerHealthDisplay` are eager; `MarketIntelligenceWidget` and `PredictiveAlertsWidget` are lazy-loaded behind `Suspense` boundaries with skeleton fallbacks
- Each widget keeps its own loading/error/empty states as already specified; the orchestrator does not replace them with a single page-level spinner
- No global "all widgets loaded" gate — the dashboard becomes usable progressively

### Error Isolation and Degraded Mode
- Each registry entry is mounted inside its own `WidgetErrorBoundary`; the whole orchestrator output is wrapped in `DashboardErrorBoundary` (both defined by `production-ready-dashboard-spec.md`)
- Boundary wrapping happens **in the orchestrator**, not inside widget component files — widgets stay unaware of their boundary, and server components like `CustomerCard` remain free of boundary logic
- A failed widget reports `'failed'` to `widgetHealth`; the orchestrator keeps the remaining grid fully interactive and offers a per-widget retry that remounts only that widget
- A retry that fails repeatedly stops re-offering retry (bounded attempts, per `production-ready-dashboard-spec.md`'s retry-limit requirement) and settles into a static fallback tile
- If the customer list itself fails to load, the orchestrator shows a page-level recovery state — this is the one dependency with no useful degraded mode, since every other widget is keyed off a selected customer

### Export Coordination
- The orchestrator exposes a single dashboard-level export entry point and is the only caller of `ExportUtils`
- An export request describes *what* to export (which data categories, filters, format); the orchestrator gathers current data from each contributing widget's source and hands it to `ExportUtils` — widgets do not each own an export button
- Widgets in `'failed'` state are excluded from the export payload, and the export result records which categories were omitted, so an export is never silently partial
- Export progress and cancellation are surfaced at the orchestrator level; formats, file naming, and serialization belong to `ExportUtils` per `production-ready-dashboard-spec.md`

### Monitoring Hooks
- The orchestrator emits structured events for: customer selected, widget load success/failure, retry attempted, export started/completed/cancelled
- Events go through one logging/telemetry seam so a real provider can be swapped in later without touching widget code; the default implementation may be a no-op or console sink
- Emitted events carry no sensitive customer data beyond an id — consistent with the sanitized-logging requirement in `production-ready-dashboard-spec.md`

## Constraints

### Technical Stack
- Next.js 15 App Router, TypeScript strict mode, React 19, Tailwind CSS v4
- No state-management library — React state/context at the orchestrator level is sufficient for the state described here. Introducing Redux/Zustand/etc. is out of scope
- No new runtime dependencies

### File Structure
- `src/components/DashboardOrchestrator.tsx` — composition root (client component; it owns interactive state)
- `src/components/dashboardWidgets.ts` (or equivalent) — the widget registry
- `src/lib/dashboardTelemetry.ts` — the monitoring/telemetry seam
- `src/app/page.tsx` renders `DashboardOrchestrator`; the page itself stays thin

### Boundaries
- The orchestrator wires and coordinates; it must not absorb widget-internal logic. If a change would move health-score math, alert thresholds, or market data parsing into the orchestrator, it belongs in the owning spec instead
- Widget components must remain independently renderable in isolation (e.g. in a test) with plain props and no orchestrator context requirement

## Acceptance Criteria

- [ ] `DashboardOrchestrator` owns `selectedCustomer` and passes it to all customer-dependent widgets; no widget holds its own copy of selection state
- [ ] Selecting a customer updates health, market intelligence, and alerts widgets from the one selection event
- [ ] Widgets are composed from the registry — adding a registry entry renders a new widget with correct boundary, priority, and empty-state handling without layout edits
- [ ] Widgets requiring a customer show the shared "select a customer" empty state before any selection, identical across widgets
- [ ] Widget data loads in parallel: an artificially delayed market intelligence response does not delay health score rendering
- [ ] Lazy widgets render skeleton fallbacks via `Suspense` and the page is interactive before they resolve
- [ ] A thrown error in one widget leaves every other widget interactive and offers a retry that remounts only the failed widget
- [ ] Repeated retry failures stop offering retry and settle into a static fallback tile
- [ ] Failure of the customer list shows a page-level recovery state
- [ ] Rapidly switching customers never renders stale data for a previously selected customer
- [ ] Export is triggered from one orchestrator-level entry point, calls `ExportUtils` once, excludes failed widgets, and reports omitted categories
- [ ] Selection state is restored after navigating to customer management and back
- [ ] Monitoring events are emitted for selection, widget load outcomes, retries, and exports, with no sensitive data in the payload
- [ ] Each widget still renders correctly in isolation from plain props
- [ ] Meets `accessibility-spec.md` (grid landmarks/heading order, live-region announcements on selection change and widget failure) and `code-quality-spec.md`
- [ ] `npm run type-check` and `npm run lint` pass with no errors

## Out of Scope
- New business features or changes to health scoring, alert rules, or market data sources
- `ExportUtils`' internal format/serialization work, security headers, and CSP (owned by `production-ready-dashboard-spec.md`)
- WCAG detail (owned by `accessibility-spec.md`)
- User-customizable dashboard layouts, drag-and-drop rearrangement, or persisted per-user widget preferences
- Multi-customer / comparison views — the orchestrator holds exactly one selected customer
- Authentication, authorization, and per-user widget permissions
- Real-time push/websocket updates; widgets fetch on selection change, not continuously
- Swapping in a specific external telemetry provider (only the seam is in scope)
