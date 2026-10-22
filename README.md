# C-Address Bridge

The onboarding layer for Soroban dApps. Fund any Soroban smart account (C-address) directly — from a CEX withdrawal, a credit card, or an existing G-address.

## Features

- **G → C Bridge** *(not yet live — see #284)* — Will send XLM or USDC from a Stellar G-address to a Soroban C-address; classic Stellar payments can't target contract addresses, so this requires a Soroban smart-contract transfer step that hasn't shipped. The UI currently blocks this flow with an explanatory message instead of submitting a doomed transaction.
- **Fiat Onramp** *(not yet live — see #733)* — Buy USDC with a credit/debit card via Moonpay or Transak. Providers cannot pay contract addresses directly, so funds cannot be sent straight to a C-address today; the onramp must first deliver to a G-address and then be bridged to the C-address once the G → C bridge ships.
- **CEX Withdrawal Routing** — Withdraw from Binance, Coinbase, or Kraken directly to a bridge address that routes funds to your C-address (shipped in #827).

## Tech Stack

- **Next.js 16** (App Router, webpack)
- **React 19** with Server Components
- **Tailwind CSS 4** with dark theme
- **Stellar SDK 15** (Horizon + Soroban RPC)
- **@creit.tech/stellar-wallets-kit 2** (wallet integration)
- **TypeScript 5**
- **Vitest** (unit/integration testing)
- **Playwright** (E2E testing)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, workflow, and testing expectations.

## Getting Started

1. Clone and install:

   ```bash
   git clone <repo-url>
   cd c-address-bridge
   npm install
   ```

2. Configure environment:

   ```bash
   cp .env.example .env.local
   ```

   Required env vars (see `.env.example` for all options):

   | Variable | Required | Description |
   |---|---|---|
   | `NEXT_PUBLIC_STELLAR_NETWORK` | Yes | `TESTNET` or `PUBLIC` |
   | `NEXT_PUBLIC_API_URL` | Yes in production | Base URL of the C-Address Bridge backend. Also the target the server-side proxy routes (below) forward to. A production build fails immediately with a clear error if this is unset (#675); falls back to a placeholder in dev/test |
   | `BACKEND_API_KEY` | For backend calls beyond `/health` | The backend's `X-API-Key`, attached server-side only by the proxy routes under `src/app/api/backend/` (#674) — **never** put this in a `NEXT_PUBLIC_*` var, which would publish it to every visitor's browser. A request to a proxy route returns `500` if this is unset |
   | `NEXT_PUBLIC_BRIDGE_CONTRACT_ID` | No | Soroban bridge contract (omits direct payment) |
   | `NEXT_PUBLIC_SOROBAN_RPC_URL_TESTNET` | No | Soroban RPC endpoint for testnet. Defaults to the official SDF endpoint `https://soroban-testnet.stellar.org` |
   | `NEXT_PUBLIC_SOROBAN_RPC_URL_PUBLIC` | For mainnet Soroban calls | SDF does not operate a free public mainnet Soroban RPC — set this to your own provider's URL. Soroban RPC calls on `PUBLIC` fail with a clear configuration error until this is set |
   | `NEXT_PUBLIC_HORIZON_URL_PUBLIC` | No | Horizon endpoint for mainnet. Defaults to `https://horizon.stellar.org` |
   | `NEXT_PUBLIC_HORIZON_URL_TESTNET` | No | Horizon endpoint for testnet. Defaults to `https://horizon-testnet.stellar.org` |
   | `NEXT_PUBLIC_MOONPAY_API_KEY` | For onramp | From [Moonpay dashboard](https://buy.moonpay.com) |
   | `NEXT_PUBLIC_TRANSAK_API_KEY` | For onramp | From [Transak dashboard](https://global.transak.com) |

   > **Note — Horizon and Soroban RPC endpoints:**
   > Horizon URLs default to `https://horizon.stellar.org` (PUBLIC) or `https://horizon-testnet.stellar.org` (TESTNET) but can be overridden via `NEXT_PUBLIC_HORIZON_URL_PUBLIC` and `NEXT_PUBLIC_HORIZON_URL_TESTNET` (#689). Soroban RPC URLs for TESTNET also default to the SDF endpoint but can be overridden. Soroban RPC for PUBLIC is empty by default — you must provide your own provider URL. See [Sequence Number Caching](docs/sequence-numbers.md) for details on how network requests are managed.

   > **Note — backend proxy (#674):**
   > The browser never talks to the backend directly except for the unauthenticated `/health` check. Every other backend call (locks, batch funding, referrals, transaction export) goes through a same-origin route under `src/app/api/backend/`, which attaches `BACKEND_API_KEY` server-side and applies a per-IP rate limit (`src/lib/rateLimit.ts`, in-memory — resets per server instance, not shared across a multi-instance deployment). `src/lib/api.ts` calls these proxy routes by relative path; it never sends the key itself. Fee-tier data (below) is a separate case — it's read directly from the contract via Soroban RPC, not from this backend at all.

3. Run:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Available Commands

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run analyze` | Production build with bundle analysis |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run test` | Run Vitest test suite |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run test:e2e:headed` | Run Playwright E2E tests in headed mode |
| `npm run test:e2e:debug` | Run Playwright E2E tests in debug mode |

## Architecture

```
src/
├── app/
│   ├── page.tsx                    # Landing page
│   ├── layout.tsx                  # Root layout with wallet provider + fonts
│   ├── error.tsx                   # Error boundary
│   ├── loading.tsx                 # Route loading state
│   ├── not-found.tsx               # 404 page
│   ├── bridge/                     # G → C bridge flow
│   ├── cex/                        # CEX withdrawal routing
│   ├── dashboard/                  # Wallet dashboard with live balances
│   ├── onramp/                     # Fiat onramp (Moonpay/Transak)
│   ├── address-book/               # Saved addresses
│   ├── profile/                    # User profile
│   ├── referrals/                  # Referral programme
│   ├── schedules/                  # Funding schedules
│   ├── transactions/[hash]/        # Transaction detail page
│   ├── confirm/[hash]/             # Share-link confirmation page
│   ├── widget/                     # Embeddable widget page
│   └── api/
│       ├── activity/               # Activity feed route
│       ├── confirmations/[hash]/   # Public share-link lookup
│       ├── feature-flags/          # Feature flag route
│       ├── onramp/quotes/          # Onramp quote comparison
│       ├── simulate/               # Fee simulation route
│       ├── transactions/[hash]/status/  # SSE transaction status stream
│       └── backend/                # Server-side proxy to backend
│           ├── batch-fund/
│           ├── locks/
│           ├── referrals/stats/
│           └── transactions/export/
├── components/
│   ├── avatar-upload.tsx           # Local (browser-only) profile avatar
│   ├── footer.tsx
│   ├── navbar.tsx
│   ├── notification-centre.tsx
│   ├── transaction-history.tsx
│   ├── wallet-provider.tsx         # Wallet context provider
│   └── routes/                     # Route-level page components
│       ├── address-book-page.tsx
│       ├── cex-page.tsx
│       ├── dashboard-page.tsx
│       ├── funding-schedules-page.tsx
│       ├── onramp-page.tsx
│       ├── profile-page.tsx
│       └── referrals-page.tsx
├── contexts/
│   ├── FeatureFlagContext.tsx
│   ├── HelpContext.tsx
│   ├── LocaleContext.tsx
│   ├── TelemetryContext.tsx
│   └── ThemeContext.tsx
├── hooks/
│   ├── useDebounce.ts
│   ├── useDelayedLoading.ts
│   ├── useHealthStatus.ts
│   ├── useHydrated.ts
│   ├── useInactivityTimeout.ts
│   ├── useCopyToClipboard.ts
│   └── useStepTransition.ts
└── lib/
    ├── addressBook.ts
    ├── api.ts                      # Backend API client
    ├── avatar.ts                   # Avatar validation + localStorage helpers
    ├── confirmations.ts
    ├── feeTiers.ts                 # Volume-based fee tier logic
    ├── rateLimit.ts                # Per-IP in-memory rate limiter
    ├── session.ts                  # Persisted wallet session state
    ├── stellar.ts                  # Stellar SDK + wallet integration
    └── types.ts                    # TypeScript types and constants
```

Caching and browser-storage behaviour is documented in [Caching & Client Storage](docs/caching.md).

## Testing against Testnet

To test locally against Stellar Testnet, make sure both the app and your wallet are pointed at the same network. Mismatched network settings cause confusing failures (e.g. transactions referencing the wrong Horizon server or signing with the wrong network passphrase).

1. **Set the env var** in `.env.local`:
   ```bash
   NEXT_PUBLIC_STELLAR_NETWORK=TESTNET
   ```
2. **Switch your wallet to Testnet**: open the wallet extension, click the network selector, and choose **Testnet**.
3. **Fund a test account**: use the [Stellar Testnet Friendbot](https://friendbot.stellar.org) to fund your G-address before testing.
4. **Run the app**: `npm run dev`.

If you want to use a custom Soroban RPC provider for Testnet (e.g. for performance or reliability testing), also set:

```bash
NEXT_PUBLIC_SOROBAN_RPC_URL_TESTNET=https://your-custom-rpc.example.com
```

To override the Horizon endpoint (e.g. pointing at your own Horizon instance):

```bash
NEXT_PUBLIC_HORIZON_URL_TESTNET=https://your-custom-horizon.example.com
```

> **Important:** Both your wallet and the app must be on the **same** network. If the wallet is set to Mainnet while the app is set to TESTNET (or vice versa), transaction signing will fail or submit to the wrong network.

## How It Works

1. **Connect** your wallet or enter any Stellar address.
2. **Choose** a funding source: G-address, fiat card, or CEX withdrawal.
3. **Enter** the Soroban C-address you want to fund.
4. **Confirm** — sign with your wallet and submit to the Stellar network.

## License

MIT
