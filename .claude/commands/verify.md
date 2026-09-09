---
description: Verify a component's types, rendering with mock data, and responsive behavior
argument-hint: <component-file-path>
allowed-tools: Read, Glob, Grep, Bash, Skill
---

# Verify Component

Verify the component at: **$1**

Read `$1` first (strip a leading `@`). If no path was given or the file does not
exist, list `src/components/` and ask which component to verify. Note that this
project keeps components under `src/components/`, not a top-level `components/`.

Also read its spec at `specs/<kebab-name>-spec.md` if one exists — the spec's
Acceptance Criteria are the definition of correct for this component, and take
precedence over the generic checks below.

Run all four checks before reporting. A later failure does not excuse skipping
an earlier check.

## Check 1 — TypeScript

```
npm run type-check
```

Then inspect `$1` for what `tsc` cannot catch:
- Props interface is exported and named (per `code-quality-spec.md`)
- No `any`, no non-null `!` assertions, no `@ts-ignore`
- Shared types (e.g. `Customer`) are imported from `src/data/mock-customers.ts`,
  not redeclared locally
- Optional fields (e.g. `domains?`) are actually handled as possibly-absent

Also run `npm run lint`.

## Check 2 — Renders with mock data

Read `src/data/mock-customers.ts` for the real shape and the real range of
values, then confirm the component is exercised against it:

- Trace the component against every record in `mockCustomers` — not just the
  first. Note any record whose values hit a branch the component does not handle
  (absent `domains`, empty array, boundary health scores, long strings).
- Confirm the props the component requires are actually satisfiable from that
  data.

Then verify it renders for real, rather than by inspection alone. Invoke the
`run` skill to launch the app and load the page that mounts this component. If
the component is not mounted anywhere reachable, say so explicitly and fall back
to `npm run build` plus code inspection — do not claim a render was observed
when it was not.

Report any console error or warning surfaced during the render.

## Check 3 — Responsive design

Check the component at these widths — 320 (project minimum), 375, 768, 1024,
1440. Where the app is running from Check 2, resize and observe; otherwise
reason from the Tailwind classes and say which method you used.

At each width confirm:
- No horizontal overflow and no clipped content
- Text wraps or truncates deliberately; long names, company names, and domains
  do not break the layout
- Interactive targets stay at least 44x44px
- No layout shift between records with different data (e.g. one domain vs. many)

Flag any hard-coded pixel width, fixed height, or unprefixed class that fights a
responsive breakpoint.

## Check 4 — Spec acceptance criteria

If a spec exists, walk its Acceptance Criteria as a literal checklist and mark
each ✅ or ❌ with evidence. A criterion you could not verify is ❌, not ✅.

## Report

Output exactly this and nothing else:

```
## Verify: <ComponentName>

**<PASS or FAIL>** — <n> passed, <n> failed

| Check | Result | Notes |
|---|---|---|
| TypeScript | ✅/❌ | <one line> |
| Renders with mock data | ✅/❌ | <one line, incl. how it was verified> |
| Responsive (320-1440) | ✅/❌ | <one line, incl. how it was verified> |
| Spec criteria | ✅/❌/n-a | <n> of <n> met |

### Issues

<For each failure, a numbered entry: the file and line, what is wrong, the
input or width that triggers it, and the concrete fix. Omit if none.>
```

Overall result is PASS only when every check passed.

## Rules

- Read-only on source. Report problems; do not fix them — that is `/implement`.
- Report honestly. If a check could not be run, mark it ❌ and say why; never
  infer a passing render or a passing breakpoint you did not observe.
