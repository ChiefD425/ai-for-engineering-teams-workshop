---
description: Implement a component from its spec and verify it against the acceptance criteria
argument-hint: <spec-file-path>
allowed-tools: Read, Glob, Grep, Write, Edit, Bash
---

# Implement From Spec

Implement the component specified in: **$1**

## Step 1 — Read the spec

Read `$1` (strip a leading `@` if present).

- If no path was given, or the file does not exist, list `specs/` and ask which
  spec to implement. Do not guess.
- Read the **whole** spec before writing any code — Context, Requirements,
  Constraints, Acceptance Criteria, and Out of Scope.

Then read what the spec depends on:
- `specs/code-quality-spec.md` and `specs/accessibility-spec.md` — cross-cutting
  standards every component must satisfy
- Any spec or source file the Context or Integration Requirements name
- The data source it consumes (e.g. `src/data/mock-customers.ts`) for real types
- An existing component such as `src/components/CustomerCard.tsx`, to match the
  house style

If the spec is missing a section or is self-contradictory, stop and run
`/spec-review $1` instead of guessing.

## Step 2 — Determine the target path

Use the file path stated in the spec's **Constraints → File Structure and
Naming**. That is authoritative. Absent one, default to
`src/components/<ComponentName>.tsx` — note this project keeps components under
`src/components/`, not a top-level `components/`.

If the target file already exists, read it and revise it in place toward the
spec rather than overwriting it wholesale.

## Step 3 — Implement

Write the component. Follow the spec's constraints exactly: the stack is
Next.js 15 (App Router), React 19, TypeScript strict mode, Tailwind CSS v4.

- Export a named component and an exported, named props interface, per
  `code-quality-spec.md`
- Reuse existing types (e.g. `Customer`) rather than redeclaring them
- Add `'use client'` only when the spec says the component is interactive
- Add no new runtime dependencies
- Build what the spec's Acceptance Criteria require, and nothing in Out of Scope

The spec fixes the *what*; internal decomposition, helper naming, and styling
details not tied to a named token are your call. Do not stop to ask about those.

## Step 4 — Verify against the acceptance criteria

Work through the spec's Acceptance Criteria as a literal checklist. For each
item, establish evidence — do not assume.

Run the checks the criteria name, at minimum:

```
npm run type-check
npm run lint
```

For behavioral criteria, verify by reading the code you just wrote against the
criterion, and trace each threshold's boundary values (e.g. 0, 30, 31, 70, 71,
100) and each empty/absent-data case by hand. A criterion you cannot verify is
**not** met.

## Step 5 — Iterate

For every unmet criterion: fix the code and re-run Step 4 from the top —
a fix can break a criterion that previously passed.

Repeat until all criteria pass, or until three full passes have gone by without
all of them passing. In that case stop and report which criteria remain unmet,
what you tried, and why they are blocked. Do not report success with known
failures, and do not weaken a criterion to make it pass.

## Step 6 — Report

State the file written, then the criteria checklist with a ✅ or ❌ per item and
the evidence for each ❌. Close with one line: all criteria met, or the count
outstanding. Do not describe the implementation — the user can read the file.

## Rules

- Write the component file and only files the spec's File Structure section
  names. Do not modify the spec, tests you were not asked for, or unrelated
  source.
- Report verification honestly. If `npm run lint` failed, say so and show the
  output.
