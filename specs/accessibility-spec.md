# Standard: Accessibility

## Context
- Cross-cutting WCAG 2.1 AA standard applying to every interactive component in the Customer Intelligence Dashboard, not a standalone feature
- Other specs (`customer-card-spec.md`, `customer-selector-spec.md`, `health-score-calculator-spec.md`, `market-intelligence-spec.md`, `predictive-alerts-spec.md`, `customer-management-integration-spec.md`) should reference this document for accessibility behavior rather than restating it
- `production-ready-dashboard-spec.md`'s accessibility section defers to this document as the single definitive checklist, to avoid two specs drifting on WCAG detail

## Requirements

### Keyboard Accessibility
- Every interactive element (customer card selection, search input, expand/collapse controls, alert dismiss/action buttons, form fields) is reachable and operable via keyboard alone
- Tab order follows visual/logical content order
- Visible focus indicator on every focusable element, meeting WCAG contrast requirements — never `outline: none` without a compliant replacement
- Components that introduce their own focus scope (modals, popups, if any) trap and restore focus correctly

### Semantic Structure
- Semantic HTML elements used for their purpose (`button` for actions, not clickable `div`s with `onClick`; heading tags in a single logical hierarchy per page, not skipped levels)
- Landmarks (`header`, `main`, `nav`, `section`) used to structure the dashboard layout

### Screen Reader Support
- ARIA labels/descriptions on non-text or ambiguous controls (icon-only buttons, color-only status indicators)
- Health/alert color indicators always pair color with a text or accessible-name equivalent (e.g. `aria-label="Health score: 85, good"`), never color alone
- Live regions (`aria-live`) for asynchronously-updated content that isn't the result of a direct user action — e.g. a new predictive alert appearing, a market intelligence fetch completing
- Loading states are announced to screen readers (e.g. `aria-busy`, a visually-hidden "Loading…" live region), not just visually indicated by a spinner

### Visual Requirements
- Color contrast ratios meet AA: 4.5:1 for normal text, 3:1 for large text and meaningful UI graphics (including the red/yellow/green health and alert indicators against their background)
- All informational icons/images have descriptive alt text or an `aria-hidden` + adjacent text label when purely decorative

## Constraints
- Applies across every widget in the dashboard, not per-component custom conventions — the red/yellow/green semantic color system defined for health scores must carry an accessible-name equivalent everywhere it's used (`CustomerCard`, `CustomerHealthDisplay`, `MarketIntelligenceWidget`, predictive alert badges)
- No component introduces a keyboard trap or removes default focus styling without providing an equivalent

## Acceptance Criteria

- [ ] Every interactive control in every widget is operable via Tab/Shift+Tab/Enter/Space alone, verified by manual keyboard-only walkthrough
- [ ] Every color-coded status indicator (health score, alert priority, market sentiment) exposes an accessible name/text equivalent, not color alone
- [ ] Automated accessibility scan (axe-core or equivalent) reports zero critical/serious violations on each dashboard page
- [ ] Color contrast for text and status indicators meets 4.5:1 (normal text) / 3:1 (large text, indicators)
- [ ] Loading and error states are announced via ARIA live regions or equivalent, not visual-only
- [ ] Heading hierarchy on each page has no skipped levels
- [ ] Manual screen reader spot-check (one of NVDA/JAWS/VoiceOver) confirms customer selection, search, and alert dismissal are all usable

## Out of Scope
- Full WCAG AAA compliance
- Automated CI gating on accessibility scans (covered, if pursued, under `production-ready-dashboard-spec.md`'s testing section)
- Internationalization/RTL layout support
