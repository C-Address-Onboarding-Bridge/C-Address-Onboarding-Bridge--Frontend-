# Contributing

Thank you for contributing to C-Address Bridge. This guide covers the setup, workflow, and testing expectations for all contributors.

## Prerequisites

- **Node.js 22** (the version used by CI)
- **npm** (bundled with Node.js)

## Setup

1. Clone the repository and install dependencies:

   ```bash
   git clone <repo-url>
   cd c-address-bridge
   npm ci
   ```

2. Configure environment variables:

   ```bash
   cp .env.example .env.local
   ```

   See `.env.example` (committed to the repo) for every variable and its description, and the [README environment table](README.md#getting-started) for full documentation. The minimum set to start the dev server:

   | Variable | Required | Description |
   |---|---|---|
   | `NEXT_PUBLIC_STELLAR_NETWORK` | Yes | `TESTNET` or `PUBLIC` |
   | `NEXT_PUBLIC_API_URL` | Yes in production | Base URL of the C-Address Bridge backend. Falls back to a placeholder in dev/test |
   | `BACKEND_API_KEY` | For backend calls beyond `/health` | The backend's `X-API-Key`, attached server-side only by the proxy routes under `src/app/api/backend/`. **Never** put this in a `NEXT_PUBLIC_*` var |
   | `NEXT_PUBLIC_BRIDGE_CONTRACT_ID` | No | Soroban bridge contract |
   | `NEXT_PUBLIC_SOROBAN_RPC_URL_TESTNET` | No | Soroban RPC endpoint for testnet |
   | `NEXT_PUBLIC_SOROBAN_RPC_URL_PUBLIC` | For mainnet | Soroban RPC endpoint for mainnet |
   | `NEXT_PUBLIC_MOONPAY_API_KEY` | For onramp | From Moonpay dashboard |
   | `NEXT_PUBLIC_TRANSAK_API_KEY` | For onramp | From Transak dashboard |

3. Run the development server:

   ```bash
   npm run dev
   ```

## Running CI Checks Locally

CI runs the following blocking gates on every push and pull request. Run each locally before pushing:

| Check | Command | What it does |
|---|---|---|
| Lockfile sync | `npx npm@10 install --package-lock-only --ignore-scripts` | Fails if `package-lock.json` differs from what npm 10 would write |
| Audit | `npm audit --audit-level=high` | Fails on high or critical vulnerabilities |
| Lint | `npm run lint` | Runs ESLint to enforce code style and catch errors |
| Typecheck | `npm run typecheck` | Runs TypeScript type checking with `tsc --noEmit` |
| Test | `npm run test` | Runs the Vitest test suite with coverage |
| Build | `ENFORCE_BUDGET=true npm run build` | Produces a production build and enforces the bundle budget |
| E2E | `npx playwright install --with-deps && npm run test:e2e` | Runs the Playwright end-to-end suite |

All of these must pass before opening a pull request.

> **Lockfile gotcha:** running `npm install` with npm 11 rewrites `package-lock.json` differently from npm 10 and fails the lockfile-sync check. If that happens, regenerate it with `npx npm@10 install --package-lock-only --ignore-scripts` and commit the result.

## Git hooks

### Pre-commit

The `.husky/pre-commit` hook runs the **entire** Vitest suite (`npm test`) on every commit. Because the suite currently has pre-existing failures, this can reject commits that don't touch the failing tests. Avoid reaching for `--no-verify` blindly — it also skips the pre-push build below.

### Pre-push

The `.husky/pre-push` hook runs `npm run build` against the frontend before every `git push`. This catches build-breaking changes before they reach CI.

The hook resolves the repo root via `git rev-parse --show-toplevel` so it stays correct regardless of which directory you run `git push` from. It only covers this frontend repository — the backend and contracts live in separate repos and are not built here.

If you need to push a work-in-progress branch that doesn't build yet (e.g. a draft PR or a checkpoint commit), you can skip the hook with:

```bash
git push --no-verify
```

Use this sparingly. Note that `--no-verify` skips **both** the pre-commit and pre-push hooks, so all CI gates (including the build) must still pass before a PR can be merged.

## Visual Testing Decision

The repository does not currently run visual-baseline comparisons. The parked
Storybook/Percy workflow, its unused stories, and its capture tooling were
removed because Storybook and Percy are not configured project dependencies and
CI has no Percy token. Keeping a manually dispatched workflow that cannot run
would imply coverage the project does not have.

Playwright E2E tests remain the browser-based check. They capture screenshots
and videos when a test fails for debugging; these artifacts are not approved
visual baselines and do not detect visual changes on their own. For UI changes,
include screenshots in the pull request as described by the PR template.

## Branch Naming

Use a descriptive prefix followed by the issue number and a short slug:

- `feat/250-add-contributing-md`
- `fix/249-resolve-balance-display`
- `docs/250-contributing-guide`

## Commit Conventions

Use conventional commit format:

- `feat: Add Max button to Bridge amount field`
- `fix: Correct network-mismatch banner dismissal`
- `docs: Update README with setup instructions`

## Pull Request Expectations

- **One issue per PR** — Keep PRs focused on a single issue or concern.
- **Bug fixes must include a regression test** — If your PR fixes a bug, add a test that reproduces the bug and verifies the fix.
- **All CI checks must pass locally** before pushing — Run the lockfile-sync, audit, lint, typecheck, test, build, and e2e commands listed above.
- **Link the issue** you are closing in the PR description (e.g., `Closes #250`).

## Source of Truth for CI

The CI configuration is defined in `.github/workflows/ci.yml`. This file is the authoritative reference for which checks are required and how they are run in CI.

## Questions?

If you have questions about the contributing process, open a discussion or reach out to a maintainer.
