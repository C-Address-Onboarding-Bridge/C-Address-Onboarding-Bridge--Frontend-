## Summary

<!-- Provide a brief description of the changes in this PR. -->

## Linked Issue

<!-- Replace #<issue-number> with the actual issue number this PR closes or references. -->
Closes #<issue-number>

## Changes

<!-- List the key changes made in this PR. -->

## Testing

<!-- Describe how you tested the changes locally. -->

- [ ] `package-lock.json` is in sync with `package.json` (if you ran `npm install` with npm 11, fix with `npx npm@10 install --package-lock-only --ignore-scripts`)
- [ ] `npm audit --audit-level=high` passes
- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes (with coverage)
- [ ] `ENFORCE_BUDGET=true npm run build` passes
- [ ] `npx playwright install` + `npm run test:e2e` passes

## Screenshots

<!-- If this PR includes UI changes, add screenshots or screen recordings here. -->