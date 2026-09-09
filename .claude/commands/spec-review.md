---
description: Validate a spec file for required sections and completeness
argument-hint: <spec-file-path>
allowed-tools: Read, Glob, Grep
---

# Spec Review

Validate the specification at: **$1**

## Step 1 — Load the spec

Read `$1`. If no path was given, or the file does not exist, list the files in
`specs/` and ask which one to review. Do not review anything else.

## Step 2 — Check the four required sections

A spec must contain these four top-level sections. Match on heading text
case-insensitively; accept close variants (e.g. "Background" for Context,
"Non-goals"/"Limitations" alongside Constraints, "Success Criteria" for
Acceptance Criteria) but note the deviation.

For each section, assign exactly one status:

| Status | Meaning |
|---|---|
| ✅ Complete | Present and meets every quality bar below |
| ⚠️ Incomplete | Present but fails one or more quality bars |
| ❌ Missing | No matching heading, or heading with no content |

**Context** — quality bars:
- States what is being built and why it exists
- Names where it fits in the system (consuming components, data sources, routes)
- Enough that a reader unfamiliar with the feature could orient without other docs

**Requirements** — quality bars:
- Describes observable behavior (the *what*), not implementation (the *how*)
- Data shapes, props, or interfaces are named where the feature exposes them
- Business rules include concrete values — thresholds, ranges, enum members —
  not vague qualifiers like "fast", "reasonable", or "appropriate"
- No requirement contradicts another

**Constraints** — quality bars:
- Names the technical stack / framework / language boundaries
- Covers design or styling constraints where the feature is user-facing
- States file locations and naming conventions
- Calls out security, accessibility, or performance limits where relevant

**Acceptance Criteria** — quality bars:
- Every item is independently verifiable by reading code or running the feature
- Criteria trace back to the stated requirements; no requirement is untested
- No criterion depends on subjective judgment ("looks good", "works well")

## Step 3 — Report

Output exactly this structure and nothing else:

```
## Spec Review: <filename>

| Section | Status | Notes |
|---|---|---|
| Context | <status> | <one line> |
| Requirements | <status> | <one line> |
| Constraints | <status> | <one line> |
| Acceptance Criteria | <status> | <one line> |

### Actionable Feedback

<For each ⚠️ or ❌ section, a `#### <Section>` block containing numbered
fixes. Every fix must quote or cite the specific line/heading at fault and
state the concrete edit to make — "Add the health-score threshold values to
the 'Scoring' bullet" not "Requirements need more detail". Omit this whole
section if all four are ✅.>

### Summary

<Verdict on the first line: **Ready to implement**, **Needs revision**, or
**Incomplete**. Then at most two sentences: what blocks implementation, and
the single highest-priority fix. No restating of the table.>
```

## Rules

- Review only. Never edit `$1` or any other file.
- Judge what is written, not what you would have written — a spec that
  deliberately leaves *how* open is correct, not incomplete. Only flag an
  omission when it would make two implementers build materially different
  things.
- Do not invent missing content or suggest requirements the spec's own scope
  does not imply.
