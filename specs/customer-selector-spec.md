# Feature: CustomerSelector Component

## Context
- Main customer selection interface for the Customer Intelligence Dashboard
- Container component that renders a collection of `CustomerCard` components and supplies each with its customer data and selection wiring
- Lets users quickly find and select a customer from a potentially large list (100+ customers)
- Selection state feeds downstream widgets that live outside this component — `CustomerHealthDisplay` (`health-score-calculator-spec.md`), `MarketIntelligenceWidget` (`market-intelligence-spec.md`), and `PredictiveAlertsWidget` (`predictive-alerts-spec.md`) all need to know the current selection, so this component must expose it upward via a callback prop, not keep it fully internal
- Data source: today this reads the static `mockCustomers` array directly. Once `customer-management-integration-spec.md` is implemented, this component should be updated to fetch from `GET /api/customers` (via `CustomerService`) instead, since customers created through `AddCustomerForm` would otherwise never appear here. Until that migration happens, the static import is an acceptable interim data source

## Requirements

### Functional Requirements
- Render a `CustomerCard` for each customer, displaying name, company, and health score
- Provide a search/filter input that narrows the visible customers by name or company
- Filtering is case-insensitive and matches on partial, substring input
- Track which customer is currently selected and visually highlight it
- Support selecting a customer by clicking its card
- Persist the selected customer across page interactions (e.g. filtering the list, navigating away and back) without losing the selection unless the selected customer is filtered out of view
- Handle the "no results" case when a search matches no customers
- Perform acceptably with 100+ customers (no visible lag when typing in the search box or selecting a card)
- Expose the current selection to the parent Dashboard via an `onCustomerSelect?: (customer: Customer | null) => void` prop, called whenever selection changes (including deselection, which passes `null`) — this is the integration point other widgets rely on to react to selection changes

### User Interface Requirements
- Search input is prominent and positioned above the customer list
- Selected customer's card has a visually distinct highlighted state (e.g. border/background) that is clearly different from the unselected state
- Customer list/grid is scrollable independent of the page when it exceeds the viewport
- Empty state message shown when no customers match the current search
- Responsive layout that works on both mobile and desktop screen sizes

### Data Requirements
- Consumes the `Customer` interface and `mockCustomers` array from `src/data/mock-customers.ts`
- Filtering reads `name` and `company` fields only
- Selection state holds the selected customer's `id` (not the full object), so it stays in sync if the underlying customer data changes
- Owns and manages search text and selected-customer-id state; for each rendered `CustomerCard` it passes `customer`, `selected={customer.id === selectedId}`, and `onSelect={handleSelect}`, per `CustomerCardProps` as defined in `customer-card-spec.md`. `handleSelect` toggles `selectedId` (selecting again deselects) and also invokes `onCustomerSelect` with the full `Customer` object (or `null` on deselect) so parent widgets stay in sync

## Constraints

### Technical Stack
- Next.js 15 (App Router), React 19, TypeScript (strict mode), Tailwind CSS v4

### File Structure
- Component: `src/components/CustomerSelector.tsx`
- Exported props type: `CustomerSelectorProps` (if the component accepts props, e.g. an initial customer list)
- Reuses `src/components/CustomerCard.tsx` rather than duplicating card markup

### Implementation Constraints
- Client component (`'use client'`) since it owns interactive state (search text, selection)
- Search/filter logic is a pure function, separable from rendering, so it can be unit tested independently
- No new npm dependencies
- Avoid unnecessary re-renders of unaffected `CustomerCard` instances when unrelated state changes (e.g. memoize card list rendering where reasonable)

### Security Considerations
- Search input value is used only for client-side filtering (string comparison), never interpolated into HTML or passed to `dangerouslySetInnerHTML`
- No customer data written to client-side logs

## Acceptance Criteria

- [ ] Renders a `CustomerCard` for every customer in `mockCustomers` on initial load
- [ ] Typing in the search box filters the visible cards by name or company, case-insensitively
- [ ] Clearing the search box restores the full customer list
- [ ] Searching a term with no matches shows an empty-state message and no cards
- [ ] Clicking a customer card marks it selected and applies the highlighted visual state
- [ ] Clicking a different card moves the highlight and selection to the new card
- [ ] Selected customer remains selected after the search text changes (as long as it still matches, or is unaffected by an unrelated filter change)
- [ ] Only one customer can be selected at a time
- [ ] Renders without visible lag against the full `mockCustomers` list plus a synthetically expanded 100+ customer dataset
- [ ] Layout is usable on mobile and desktop viewport widths
- [ ] `onCustomerSelect` fires with the selected `Customer` object on selection, and with `null` on deselection
- [ ] `npm run type-check` passes with no errors
- [ ] `npm run lint` passes with no errors or warnings
- [ ] No console errors or warnings when rendered or interacted with
- [ ] Meets `accessibility-spec.md` and `code-quality-spec.md`

## Out of Scope
- Sorting customers by any field
- Advanced/multi-field filter UI (e.g. filter by health score range or subscription tier)
- Domain health check data or network requests
- Persisting selection across a full page reload (e.g. via URL, localStorage) unless explicitly requested later
- Multi-select of customers
