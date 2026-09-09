# Standard: Code Quality

## Context
- Cross-cutting coding standard applying to every component, service, and library in the Customer Intelligence Dashboard, not a standalone feature
- Other specs in this directory (`customer-card-spec.md`, `customer-selector-spec.md`, `health-score-calculator-spec.md`, `market-intelligence-spec.md`, `predictive-alerts-spec.md`, `production-ready-dashboard-spec.md`, `customer-management-integration-spec.md`) should reference this document rather than restating these rules
- Goal: keep AI-generated code across many components consistent, readable, and maintainable

## Requirements

### Naming and Structure
- Descriptive variable and function names; no abbreviations (`btn`, `usr`, `cfg`)
- camelCase for variables and functions, PascalCase for components and types/interfaces
- TypeScript interfaces for all component props and non-trivial data structures
- JSDoc comments on functions with non-obvious business logic or mathematical formulas (e.g. scoring/weighting functions); trivial getters/pure passthroughs don't need one

### React Conventions
- **Named exports for all new components**, e.g. `export function CustomerCard(...)`, `import { CustomerCard } from '@/components/CustomerCard'`
  - **Exception**: `CustomerCard` itself keeps a *default* export in addition to its named export, because `src/app/page.tsx`'s existing workshop-progress scaffold loads it via `require('../components/CustomerCard')?.default`. Every other component uses named exports only — this is a one-off compatibility shim, not a precedent
- Custom hooks for reusable stateful logic shared across components (e.g. a shared `useSelectedCustomer` hook if selection logic is ever needed outside `CustomerSelector`)
- Every async operation (data fetch, calculation with a loading phase) has explicit loading and error states — no bare unhandled promises in UI code
- Semantic JSX element/component names describe purpose (`HealthIndicator`, `AlertBadge`), not visual appearance (`RedBox`, `YellowPill`)

### Error Handling
- Widgets that can fail (network calls, calculations with validated input) are wrapped in an error boundary or handle errors locally and render a defined error state — never let an unhandled exception blank the whole dashboard
- Custom error classes extend `Error` and are used for domain-specific failures (e.g. `HealthScoreValidationError`, `MarketIntelligenceError`) rather than throwing strings or generic `Error`

## Constraints

### Technical Stack
- TypeScript strict mode across the codebase; no `any` in new code without a documented reason
- Applies to every file under `src/` and `lib/`/`src/lib/`

### Scope of Enforcement
- Applies to all *new* components and libraries written from this point forward
- Does not require retroactively rewriting already-shipped code purely for style, but any file touched for a feature change should be brought in line with these rules opportunistically

## Acceptance Criteria

- [ ] No new component uses default-only exports, except the documented `CustomerCard` compatibility exception
- [ ] All new component props are typed via an exported, named TypeScript interface
- [ ] All new async UI flows (data fetch, calculation) have a defined loading state and a defined error state
- [ ] Domain-specific errors (validation, service failures) use custom `Error` subclasses, not generic `Error` or thrown strings
- [ ] Functions implementing scoring/weighting/rule logic (health calculator, alerts engine) have JSDoc explaining the formula or rule, not just the signature
- [ ] `npm run lint` passes with no errors or warnings on all new/changed files
- [ ] `npm run type-check` passes with no errors

## Out of Scope
- Enforcement tooling (custom ESLint rules, CI gating) — this spec defines the standard; wiring automated enforcement is a separate task if pursued
- Retroactive refactors of already-implemented components solely for style conformance
