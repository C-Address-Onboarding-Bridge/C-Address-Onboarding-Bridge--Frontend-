---
name: Bug Report
about: Report a bug to help us improve
title: "[BUG] "
labels: bug
assignees: ""
---

## Problem

A clear and concise description of what the bug is.

## Why it matters

Explain the impact of this bug. Who is affected and how does it degrade the experience?

## Suggested Fix

Describe the proposed fix or the approach you think should be taken to resolve the issue.

## Definition of Done

- [ ] Bug is fixed
- [ ] Regression test is added
- [ ] Lockfile is in sync (`npx npm@10 install --package-lock-only --ignore-scripts`)
- [ ] `npm audit --audit-level=high` passes
- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes (with coverage)
- [ ] `ENFORCE_BUDGET=true npm run build` passes
- [ ] Playwright e2e passes (`npx playwright install` then `npm run test:e2e`)
- [ ] PR links to this issue (e.g., `Closes #<issue-number>`)