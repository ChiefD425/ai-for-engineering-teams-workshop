# Feature: Production-Ready Dashboard Hardening

## Context
- Cross-cutting hardening pass applied on top of every previously-specified dashboard piece: `CustomerCard`, `CustomerSelector`, `CustomerHealthDisplay`, `MarketIntelligenceWidget`, `PredictiveAlertsWidget`, and the customer management CRUD flow
- Covers error resilience, data export, performance, security hardening, and deployment readiness
- Accessibility requirements defer entirely to `accessibility-spec.md` as the single definitive checklist — this spec does not restate WCAG detail, to avoid two documents drifting out of sync
- Code-quality expectations (naming, exports, error classes) defer to `code-quality-spec.md`

## Requirements

### Error Handling and Resilience
- `DashboardErrorBoundary` at the application/page level: catches otherwise-unhandled render errors and shows a recovery UI instead of a blank page
- `WidgetErrorBoundary` wraps each individual widget (`CustomerHealthDisplay`, `MarketIntelligenceWidget`, `PredictiveAlertsWidget`) so one widget's failure doesn't take down the rest of the dashboard — this wrapping happens in the parent Dashboard composition, not inside each widget's own component file, so it does not conflict with e.g. `CustomerCard` remaining a server component with no boundary logic of its own
- User-facing error messages include a retry action where retrying is meaningful (e.g. re-fetching market intelligence), consistent with each widget's own error state already defined in its spec
- Errors are logged with enough context for debugging, without exposing that detail to the end user (consistent with the sanitized-error-message requirement already stated in `market-intelligence-spec.md` and `customer-management-integration-spec.md`)

### Data Export
- `ExportUtils` module supporting CSV and JSON export for: customer data, health score breakdowns, alert history, and market intelligence summaries — reusing the data shapes already defined in each source spec (`Customer`, `calculateHealthScore`'s return shape, `Alert`, market intelligence response) rather than redefining export-specific shapes
- Configurable filters: date range, customer segment, which data categories to include
- Long-running exports show progress and support cancellation; exported files are named with a timestamp and relevant metadata

### Performance Optimization
- `React.memo`/`useMemo`/`useCallback` applied to expensive components and callbacks identified during implementation (e.g. `CustomerSelector`'s card list, per its own spec's note on avoiding unnecessary re-renders)
- Code splitting / lazy loading (`Suspense`) for widgets not needed on initial paint
- Virtual scrolling for the customer list once it exceeds a threshold size, consistent with `customer-selector-spec.md`'s 100+ customer performance requirement
- Targets: FCP < 1.5s, LCP < 2.5s, CLS < 0.1, TTI < 3.5s, initial load < 3s on standard broadband

### Security Hardening
- CSP configuration and standard security headers (`X-Frame-Options`, `X-Content-Type-Options`) at the Next.js config level
- Confirms — does not re-derive — that every API route already specified (`/api/market-intelligence/[company]`, `/api/customers*`) validates and sanitizes input and rate-limits writes, per those routes' own specs
- HTTPS enforcement and secure cookie configuration in deployment config (no authentication/session system is introduced by this spec — none of the existing specs require one)

## Constraints

### Technical Stack
- Next.js 15 App Router, TypeScript strict mode, React 19, Tailwind CSS v4
- No new runtime dependencies beyond what's needed for export generation (e.g. a CSV serialization helper), and any such addition should be a small, widely-used utility, not a heavy framework

### File Structure
- Error boundaries: `src/components/DashboardErrorBoundary.tsx`, `src/components/WidgetErrorBoundary.tsx`
- Export: `src/lib/exportUtils.ts` (same `src/lib/` convention as `healthCalculator.ts` and `alerts.ts`)

### Accessibility
- Deferred entirely to `accessibility-spec.md`; this spec's only addition is that error boundary fallback UI and export progress indicators must also meet that spec's keyboard/screen-reader/live-region requirements — they are not a special exception

### Scope Boundary
- This spec hardens existing, already-specified functionality; it does not add new business features. Any requirement here that implies new business logic (e.g. "alert effectiveness tracking") belongs to the owning feature spec (`predictive-alerts-spec.md`) instead and is out of scope here

## Acceptance Criteria

- [ ] A thrown error inside any single widget is caught by its `WidgetErrorBoundary` and does not blank the rest of the dashboard
- [ ] An unrecoverable top-level error is caught by `DashboardErrorBoundary` and shows a recovery UI (reload/retry)
- [ ] CSV and JSON export produce well-formed files for customer data, health breakdowns, alert history, and market intelligence summaries
- [ ] Export supports date-range and segment filters and shows progress for large datasets
- [ ] Lighthouse (or equivalent) reports meet the stated FCP/LCP/CLS/TTI targets on the main dashboard route
- [ ] `CustomerSelector` remains smooth (no dropped frames/visible lag) with a virtualized list at 100+ customers
- [ ] Security headers and CSP are present on responses from the production build
- [ ] No API route in the app skips input validation or returns unsanitized error detail
- [ ] Error boundary and export UI pass the checks in `accessibility-spec.md`
- [ ] `npm run type-check` and `npm run lint` pass with no errors

## Out of Scope
- Authentication/authorization and session management (no existing spec requires user accounts)
- Service worker / offline support
- CDN and infrastructure-level deployment configuration beyond Next.js config
- New business features (alert tuning, market data sources, customer fields) — those belong to their respective feature specs
- Full WCAG AAA compliance (see `accessibility-spec.md`'s own Out of Scope)
