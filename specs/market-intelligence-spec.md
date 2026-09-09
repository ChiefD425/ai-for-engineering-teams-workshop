# Feature: Market Intelligence Widget

## Context
- Surfaces market sentiment and recent news for a customer's company on the Customer Intelligence Dashboard
- Composed of three layers: an API route, a `MarketIntelligenceService` service layer, and a `MarketIntelligenceWidget` UI component
- Integrates into the main Dashboard alongside other widgets (`CustomerHealthDisplay`, `PredictiveAlertsWidget`), receiving the company name from the customer currently selected in `CustomerSelector` via its `onCustomerSelect` callback (see `customer-selector-spec.md`)
- Note: at the time of writing, no customer management API routes or other dashboard widgets exist yet in this codebase to copy patterns from (`CustomerCard`/`CustomerSelector` exist only as specs, and `src/app/page.tsx` shows Domain Health / Market Intelligence / Predictive Alerts as not-yet-built placeholders). This spec establishes the API-route and service-class conventions that `customer-management-integration-spec.md`'s `CustomerService` and `predictive-alerts-spec.md`'s alert engine also follow (`src/services/` for stateful service classes, `src/lib/` for pure calculation libraries)
- Reuses the mock data generator already committed at `src/data/mock-market-intelligence.ts` (`generateMockMarketData`, `calculateMockSentiment`) as the underlying data source — no real external market data API is called

## Requirements

### API Layer
- Route: `src/app/api/market-intelligence/[company]/route.ts` (Next.js App Router Route Handler, `GET`)
- `company` route param is validated (non-empty, reasonable length/character constraints) before use; invalid input returns a `400` response with a sanitized error message
- Response body is consistent JSON shape: sentiment (label + score), news/article count, and headlines array
- Simulates realistic network delay (e.g. a bounded random delay) before responding, to mimic a real external API call
- Errors from the service layer are translated into appropriate HTTP status codes (e.g. `400` for invalid input, `500` for unexpected failures) with sanitized messages — no stack traces or internals in the response body

### Service Layer
- `MarketIntelligenceService` class in `src/services/marketIntelligenceService.ts` (or equivalent service directory) encapsulating all business logic for the widget
- Public method(s) are effectively pure given their inputs (deterministic aside from the injected mock delay/cache), so they're straightforward to test
- In-memory cache keyed by normalized company name, with a 10-minute TTL; cache hits skip the mock delay and headline/sentiment regeneration
- Cache expiration is time-based (TTL from time of insertion), not manually invalidated
- Errors are raised as a custom `MarketIntelligenceError` class (extending `Error`), carrying enough detail internally for logging but exposing only a sanitized message externally
- Uses `generateMockMarketData` and `calculateMockSentiment` from `src/data/mock-market-intelligence.ts` to produce headlines, article count, and sentiment for a given company name

### UI Component
- `MarketIntelligenceWidget` in `src/components/MarketIntelligenceWidget.tsx`
- Accepts a company name via props (supplied by the Dashboard from the selected customer) and fetches data from the `/api/market-intelligence/[company]` route
- Optional manual company-name input field with client-side validation (non-empty) for standalone use/testing, in addition to the prop-driven mode
- Displays:
  - Sentiment label with a color-coded indicator: green (positive), yellow (neutral), red (negative)
  - News article count
  - Last-updated timestamp (when the data was fetched/cached)
  - Top 3 headlines, each with source and publication date
- Loading state while the request is in flight
- Error state when the request fails, showing a user-facing message without leaking internal error detail

### Dashboard Integration
- Rendered inside the main Dashboard component grid alongside other widgets, matching the existing responsive grid layout (see `src/app/page.tsx`'s widget grid for the target layout shape)
- Dashboard passes `CustomerSelector`'s `onCustomerSelect` result down as this widget's `company` prop (`selectedCustomer?.company`); the widget re-fetches whenever that prop's value changes
- No selected customer (`onCustomerSelect` reported `null`): widget shows a neutral empty/placeholder state (no fetch attempted)

## Constraints

### Technical Stack
- Next.js 15 App Router Route Handlers, TypeScript (strict mode), React 19, Tailwind CSS v4

### File Structure
- API route: `src/app/api/market-intelligence/[company]/route.ts`
- Service: `src/services/marketIntelligenceService.ts`
- Widget: `src/components/MarketIntelligenceWidget.tsx`
- Reuses existing `src/data/mock-market-intelligence.ts` without modification

### Color Coding Consistency
- Sentiment color coding must match the dashboard-wide convention already used for health indicators (`CustomerCard`/`CustomerHealthDisplay`): green = good/positive, yellow = neutral/moderate, red = poor/negative — same Tailwind color scales, not a separate palette

### Implementation Constraints
- Widget is a client component (`'use client'`) since it fetches data and manages loading/error state
- Service layer has no React dependency and is independently testable
- Cache lives in the service layer (module-level or instance-level), not in the API route or the widget
- No new npm dependencies; no real external HTTP calls (all data is mock-generated)

### Security Considerations
- Company name parameter is validated and sanitized before being used to key the cache or generate mock data (guard against injection into any future real data source, and against pathological input)
- All error messages returned to the client are generic/sanitized; detailed error info (if any) stays server-side only
- Headlines and company name are rendered via JSX only; no `dangerouslySetInnerHTML`
- Timeout/delay simulation does not hang indefinitely — bounded maximum wait with a defined timeout error path

## Acceptance Criteria

- [ ] `GET /api/market-intelligence/[company]` returns sentiment, article count, and headlines for a valid company name
- [ ] Invalid `company` param (empty, malformed) returns a `400` with a sanitized error message
- [ ] Response includes a simulated delay (request does not resolve instantly)
- [ ] Repeated requests for the same company within 10 minutes are served from cache (verifiable via consistent headline set / no regenerated delay)
- [ ] Cache entry expires after 10 minutes and a subsequent request regenerates data
- [ ] Service layer throws `MarketIntelligenceError` for invalid input, distinct from generic errors
- [ ] `MarketIntelligenceWidget` renders sentiment with the correct color (green/yellow/red) matching the dashboard-wide convention
- [ ] Widget displays article count, last-updated timestamp, and top 3 headlines with source and date
- [ ] Widget shows a loading state during fetch and an error state on failure
- [ ] Widget re-fetches when the `company` prop changes as a result of `CustomerSelector`'s `onCustomerSelect` firing
- [ ] No customer selected (`null` from `onCustomerSelect`) renders a neutral placeholder state with no network request
- [ ] `npm run type-check` passes with no errors
- [ ] `npm run lint` passes with no errors or warnings
- [ ] No console errors or warnings when rendered or interacted with
- [ ] Meets `accessibility-spec.md` (sentiment color paired with text label, loading/error states announced) and `code-quality-spec.md`

## Out of Scope
- Real external market/news data API integration (mock data only, per workshop goals)
- Historical sentiment trend charts or time-series analysis
- Company name autocomplete/lookup against a real company database
- Cross-widget shared caching (Market Intelligence cache is local to this feature)
- Predictive Alerts widget and any cross-widget alerting logic
