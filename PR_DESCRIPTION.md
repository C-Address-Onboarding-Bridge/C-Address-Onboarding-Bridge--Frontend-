## Summary

- Add focused Vitest and Testing Library coverage for `StatusBanner` (#752).
- Add focused Vitest and Testing Library coverage for `OfflineBanner` (#749).

## Issue notes

- `OnboardingModal` already has an existing focused test suite; no additional changes were needed for #750.
- `src/components/qr-code.tsx`, the target named by #751, is absent from this checkout, so that issue is not addressed by this PR.

## Validation

- Focused tests for both added suites: 10 passed.
- ESLint passed for both added test files.
- The full test suite has pre-existing failures (329 failed tests); project typecheck reports existing readonly `NODE_ENV` errors in `src/lib/__tests__/featureFlags.test.ts`.
- GitHub CI was not run for this unpublished branch.

Closes #749
Closes #752
