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

   `.env.example` lists every variable the codebase reads, with descriptions
   and sensible defaults. The full table is maintained in
   [README.md — Configure environment](README.md#getting-started) to avoid
   duplication.

   The minimum you need to run the app locally:

   | Variable | Required | Description |
   |---|---|---|
   | `NEXT_PUBLIC_STELLAR_NETWORK` | Yes | `TESTNET` or `PUBLIC` |
   | `NEXT_PUBLIC_API_URL` | Yes in production | Base URL of the C-Address Bridge backend |
   | `BACKEND_API_KEY` | For backend calls beyond `/health` | The backend's `X-API-Key` — never use a `NEXT_PUBLIC_*` name for this |

3. Run the development server:

   ```bash
   npm run dev
   ```

## Running CI Checks Locally

CI runs four checks on every push and pull request. Run each locally before pushing:

| Check | Command | What it does |
|---|---|---|
| Lint | `npm run lint` | Runs ESLint to enforce code style and catch errors |
| Typecheck | `npm run typecheck` | Runs TypeScript type checking with `tsc --noEmit` |
| Test | `npm run test` | Runs the Vitest test suite |
| Build | `npm run build` | Produces a production build (also enforces bundle budget) |

All four must pass before opening a pull request.

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

This speeds up local testing during development.

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
- **All CI checks must pass locally** before pushing — Run `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build`.
- **Link the issue** you are closing in the PR description (e.g., `Closes #250`).

## Source of Truth for CI

The CI configuration is defined in `.github/workflows/ci.yml`. This file is the authoritative reference for which checks are required and how they are run in CI.

## Questions?

If you have questions about the contributing process, open a discussion or reach out to a maintainer.
