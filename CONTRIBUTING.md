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

   Required env vars (see `.env.example` for all options):

   | Variable | Required | Description |
   |---|---|---|
   | `NEXT_PUBLIC_STELLAR_NETWORK` | Yes | `TESTNET` or `PUBLIC` |
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

CI runs four checks on every push and pull request. Run each locally before pushing:

| Check | Command | What it does |
|---|---|---|
| Lint | `npm run lint` | Runs ESLint to enforce code style and catch errors |
| Typecheck | `npm run typecheck` | Runs TypeScript type checking with `tsc --noEmit` |
| Test | `npm run test` | Runs the Vitest test suite |
| Build | `npm run build` | Produces a production build (also enforces bundle budget) |
| Visual Regression | `npm run visual-regression:capture` | Captures visual baselines and compares them with Percy |

All five must pass before opening a pull request.

## Storybook & Visual Regression Testing

This project uses [Storybook](https://storybook.js.org/) for component development and [Percy](https://percy.io/) for visual regression testing. Visual regression tests capture Storybook stories across multiple viewports and themes (light/dark) to catch unintended visual changes.

### Running Storybook Locally

```bash
npm run storybook
```

This starts the Storybook dev server at `http://localhost:6006`. Add or update component stories as you develop features.

### Story Guidelines

- Place story files in `src/stories/` or co-locate them with their components (e.g., `src/components/Button.stories.tsx`)
- Story files must be named `*.stories.tsx`
- Cover the primary states and variants of each component
- Use descriptive story names (e.g., "Default", "With Error", "Dark Theme")

### Approving Visual Changes

When your PR introduces intentional visual changes:

1. **CI captures baselines** — Visual regression tests run automatically on your PR
2. **Review on Percy** — Visual diffs appear at https://percy.io/builds (shared in PR comments)
3. **Approve changes** — Maintainers review and approve intentional changes on Percy
4. **Merge PR** — Once approved, merge to record the new baseline

### Failing Builds on Unreviewed Visual Diffs

The build fails if there are visual differences that haven't been reviewed and approved. This catches:

- Accidental layout shifts due to CSS changes
- Theme inconsistencies
- Responsive design regressions
- Browser-specific rendering issues

To resolve:

- **Intentional change:** Have it approved on Percy
- **Unintended change:** Fix the CSS or component, then the test will pass

### Optimizing Capture for Large PRs

If your PR touches many files, you can limit visual regression capture to only the affected components:

```bash
AFFECTED_FILES="src/components/Button.tsx,src/components/Modal.tsx" npm run visual-regression:capture
```

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