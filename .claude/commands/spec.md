---
description: Generate a specification from a requirements file for a named component
argument-hint: <ComponentName>
allowed-tools: Read, Glob, Grep, Write
---

# Spec Generation

Generate a specification for the component: **$1**

## Step 1 — Locate the requirements file

Convert `$1` from PascalCase to kebab-case (`CustomerCard` → `customer-card`)
and read `requirements/<kebab-name>.md`.

- If `$1` was not provided, list `requirements/` and ask which component to spec.
- If the file does not exist, list `requirements/` and ask which file to use.
  Do not invent requirements from the component name alone.
- Also check for related requirement files that extend this component
  (e.g. `customer-card-enhancement.md` alongside `customer-card.md`). If one
  exists, fold it into the same spec and say so in Context.

## Step 2 — Gather project context

Before writing, read enough to keep the spec consistent with what already exists:

- `specs/README.md` — the what-vs-how convention these specs follow
- `specs/code-quality-spec.md` and `specs/accessibility-spec.md` — cross-cutting
  constraints that apply to every component; reference them rather than
  restating their contents
- Any existing spec in `specs/` that this component integrates with (a parent
  container, a data producer). Match the contracts they already define —
  prop names, thresholds, and interfaces must agree across specs.
- `src/data/mock-customers.ts` and neighbouring files, for the real shape of any
  data type the component consumes

If an existing spec and the requirements file contradict each other, follow the
requirements file and note the divergence explicitly in Context.

## Step 3 — Write the spec

Save to `specs/<kebab-name>-spec.md` using exactly this structure:

```markdown
# Feature: <ComponentName> Component

## Context
## Requirements
### Functional Requirements
### User Interface Requirements
### Data Requirements
### Integration Requirements
## Constraints
### Technical Stack
### Design Constraints
### File Structure and Naming
### Implementation Constraints
### Security Considerations
## Acceptance Criteria
## Out of Scope
```

Omit a `###` subsection only when the component genuinely has nothing for it
(e.g. no UI requirements for a pure calculator). Never omit a `##` section.

**Context** — what is being built, why it exists, and where it sits in the
system: which component renders it, which data it consumes, which spec produces
that data. Enough for a reader who has not seen the requirements file.

**Requirements** — observable behavior only. Name the props interface and the
data types. Give business rules as concrete values (thresholds, ranges, enum
members), never as "fast" or "appropriate". Do not prescribe internal code
organization — that is the implementer's call.

**Constraints** — the stack is Next.js 15 (App Router), React 19, TypeScript
strict mode, Tailwind CSS v4. State the component file path
(`src/components/<ComponentName>.tsx`), naming conventions, whether it must be a
client component and why, and any security considerations (escaping, no
`dangerouslySetInnerHTML`, no customer data in logs).

**Acceptance Criteria** — a `- [ ]` checklist. Every item independently
verifiable by reading code or running the feature; no subjective wording. Cover
each functional requirement, the boundary values of every threshold, the
empty/absent-data case, and always end with:
- [ ] `npm run type-check` passes with no errors
- [ ] `npm run lint` passes with no errors or warnings

**Out of Scope** — what is deliberately excluded, so the implementer does not
build it.

## Step 4 — Report

State the path written and, in at most two sentences, anything the requirements
file left ambiguous that you resolved by decision — name the decision. Do not
summarize the spec back; the user can read it.

## Rules

- Write only `specs/<kebab-name>-spec.md`. Do not create or modify source files.
- If `specs/<kebab-name>-spec.md` already exists, read it first and ask whether
  to overwrite or revise before writing.
- Fix the *what*, leave the *how* open — per `specs/README.md`.
- Do not pad. A requirement the source file does not imply is noise, not rigor.
