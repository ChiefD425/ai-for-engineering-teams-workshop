# Feature: Customer Management Integration

## Context
- Adds full CRUD customer management to the Customer Intelligence Dashboard: creating, listing, viewing, and updating customers, not just browsing the fixed mock set
- Introduces the first persistence layer for customer data — everything built so far (`customer-card-spec.md`, `customer-selector-spec.md`) reads directly from the static `mockCustomers` array in `src/data/mock-customers.ts`
- **Reconciliation with existing specs**: once this feature exists, the static import is no longer the source of truth, because a customer added via `AddCustomerForm` would never appear in a statically-imported array. `CustomerService` seeds its in-memory store from `mockCustomers` on startup, and `CustomerSelector` should source its data from `GET /api/customers` (through `CustomerService`) rather than importing `mockCustomers` directly. See the corresponding update in `customer-selector-spec.md`
- New/updated customers created here still conform to the same `Customer` interface consumed by `CustomerCard`/`CustomerSelector` — this feature does not introduce a competing customer shape

## Requirements

### User Experience Flow
- A "Manage Customers" entry point is visible on the dashboard home screen
- Navigating to customer management does not lose the current dashboard selection state unexpectedly; returning to the dashboard restores the previous view
- Customer management view reuses `CustomerCard` (or a list-appropriate variant) for consistent visual identity with the rest of the dashboard

### API Layer
- `GET /api/customers` — list all customers, with optional query-param filtering (e.g. by name/company substring)
- `POST /api/customers` — create a customer; validates required fields (`name`, `company`, `healthScore`) and optional fields (`email`, `subscriptionTier`, `domains`) against the `Customer` interface shape
- `GET /api/customers/[id]` — fetch one customer; `404` if not found
- `PUT /api/customers/[id]` — update a customer; same validation as create; `404` if not found
- All routes return a consistent JSON envelope (e.g. `{ data, error }`) so client code has one response shape to handle across endpoints
- Input validation failures return `400` with a sanitized, field-specific error message (not a raw exception)

### Service Layer
- `CustomerService` class in `src/services/customerService.ts` (same `src/services/` convention as `MarketIntelligenceService` — see `market-intelligence-spec.md`)
- In-memory store seeded from `mockCustomers` on first access; supports create/read/update (no delete, per requirements)
- Validation and sanitization of customer input is centralized here, not duplicated in each route handler
- Assigns a new unique `id` to created customers (not client-supplied)

### UI Components
- `AddCustomerForm` in `src/components/AddCustomerForm.tsx`: fields for name, email, company, health score, subscription tier; client-side validation with inline real-time feedback (e.g. invalid email format, health score out of 0-100 range) before submit
- Submit shows a pending state, then a success or error notification; on success, the new customer is reflected in the list without a full page reload
- `CustomerList` in `src/components/CustomerList.tsx`: displays existing customers (reusing `CustomerCard` for each entry) with the same name/company filtering behavior already specified for `CustomerSelector`'s search, so the two lists behave consistently

### Navigation
- "Manage Customers" link/button on the dashboard home screen, following the same navigation/layout conventions as the rest of the dashboard shell
- Route (e.g. `/customers`) or in-page view toggle — either is acceptable, but whichever is chosen must not break the existing `CustomerSelector`-driven dashboard flow

## Constraints

### Technical Stack
- Next.js 15 App Router Route Handlers, TypeScript strict mode, React 19, Tailwind CSS v4

### File Structure
- API routes: `src/app/api/customers/route.ts`, `src/app/api/customers/[id]/route.ts`
- Service: `src/services/customerService.ts`
- Components: `src/components/AddCustomerForm.tsx`, `src/components/CustomerList.tsx`

### Data Requirements
- Reuses the existing `Customer` interface from `src/data/mock-customers.ts` without modification; does not introduce a parallel/incompatible customer type
- Health score entered via the form is a plain 0-100 number, same as today — it is not required to run through `calculateHealthScore` from `health-score-calculator-spec.md` for this feature; that reconciliation (whether manually entered scores and calculated scores can coexist) is owned by `health-score-calculator-spec.md`, not duplicated here
- In-memory storage only; no external database (per requirements) — data does not survive a server restart

### Security Considerations
- Server-side validation on every write endpoint (never trust client-side validation alone)
- Email format validated and sanitized before storage/display
- Name/company/domains sanitized before storage to prevent injection into any future rendering context
- Error responses never leak internal exception details or stack traces
- Rate limiting is a stated consideration for the creation endpoint; if not implemented in this pass, note it as a known gap rather than silently omitting it

## Acceptance Criteria

- [ ] `GET /api/customers` returns the full seeded + created customer list
- [ ] `POST /api/customers` creates a customer with a server-assigned `id` and returns it; invalid input returns `400` with field-level errors
- [ ] `GET /api/customers/[id]` returns the matching customer or `404`
- [ ] `PUT /api/customers/[id]` updates an existing customer or returns `404`
- [ ] `AddCustomerForm` shows inline validation errors before submit and a success/error notification after
- [ ] A newly created customer appears in `CustomerList` without a full page reload
- [ ] `CustomerList` filtering by name/company behaves the same way as `CustomerSelector`'s search
- [ ] "Manage Customers" entry point is reachable from the dashboard home screen and returning from it preserves prior dashboard state
- [ ] All new/updated customers conform to the existing `Customer` interface with no shape drift
- [ ] `npm run type-check` and `npm run lint` pass with no errors
- [ ] Meets `accessibility-spec.md` (form labels/errors associated, keyboard-operable) and `code-quality-spec.md`

## Out of Scope
- Customer deletion
- Authentication/authorization for who can add or edit customers
- Persistent/external database storage
- Bulk import/export of customers (export is covered, if pursued, by `production-ready-dashboard-spec.md`)
- Retroactively migrating `CustomerSelector` to the new API in this same change — that migration is scoped in `customer-selector-spec.md`'s update, but implementing it is a follow-up, not a requirement of this spec
