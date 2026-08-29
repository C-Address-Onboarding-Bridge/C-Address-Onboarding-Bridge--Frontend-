# C-Address Bridge

The onboarding layer for Soroban dApps. Fund any Soroban smart account (C-address) directly — from a CEX withdrawal, a credit card, or an existing G-address.

## Features

- **G → C Bridge** *(not yet live — see #284)* — Will send XLM or USDC from a Stellar G-address to a Soroban C-address; classic Stellar payments can't target contract addresses, so this requires a Soroban smart-contract transfer step that hasn't shipped. The UI currently blocks this flow with an explanatory message instead of submitting a doomed transaction.
- **Fiat Onramp** — Buy USDC with a credit/debit card via Moonpay or Transak and send directly to a C-address.
- **CEX Withdrawal Routing** — Withdraw from Binance, Coinbase, or Kraken to a bridge address that routes funds to your C-address.

## Tech Stack

- **Next.js 16** (App Router, Turbopack)
- **React 19** with Server Components
- **Tailwind CSS 4** with dark theme
- **Stellar SDK 15** (Horizon + Soroban RPC)
- **Freighter API 6** (wallet integration)
- **TypeScript 5**
- **Vitest** (testing)

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
   | `NEXT_PUBLIC_BRIDGE_CONTRACT_ID` | No | Soroban bridge contract (omits direct payment) |
   | `NEXT_PUBLIC_SOROBAN_RPC_URL_TESTNET` | No | Soroban RPC endpoint for testnet. Defaults to the official SDF endpoint `https://soroban-testnet.stellar.org` |
   | `NEXT_PUBLIC_SOROBAN_RPC_URL_PUBLIC` | For mainnet Soroban calls | SDF does not operate a free public mainnet Soroban RPC — set this to your own provider's URL. Soroban RPC calls on `PUBLIC` fail with a clear configuration error until this is set |
   | `NEXT_PUBLIC_MOONPAY_API_KEY` | For onramp | From [Moonpay dashboard](https://buy.moonpay.com) |
   | `NEXT_PUBLIC_TRANSAK_API_KEY` | For onramp | From [Transak dashboard](https://global.transak.com) |

   > **Note — Horizon and Soroban RPC endpoints:**
   > Horizon URLs are **hardcoded constants** in `src/lib/types.ts` (`HORIZON_URL`) and are not configurable via environment variables. They always resolve to `https://horizon.stellar.org` (PUBLIC) or `https://horizon-testnet.stellar.org` (TESTNET). Soroban RPC URLs for TESTNET also default to the SDF endpoint (`https://soroban-testnet.stellar.org`) but can be overridden via the env vars above. Soroban RPC for PUBLIC is empty by default — you must provide your own provider URL. See [Sequence Number Caching](docs/sequence-numbers.md) for details on how network requests are managed.

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
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run test` | Run Vitest test suite |

## Architecture

```
src/
├── app/
│   ├── page.tsx           # Landing page
│   ├── layout.tsx         # Root layout with wallet provider + fonts
│   ├── error.tsx          # Error boundary
│   ├── loading.tsx        # Route loading state
│   ├── not-found.tsx      # 404 page
│   ├── bridge/            # G → C bridge flow
│   ├── cex/               # CEX withdrawal routing
│   ├── dashboard/         # Wallet dashboard with live balances
│   └── onramp/            # Fiat onramp (Moonpay/Transak)
├── components/
│   ├── avatar-upload.tsx  # Local (browser-only) profile avatar
│   ├── footer.tsx
│   ├── navbar.tsx
│   ├── transaction-history.tsx
│   └── wallet-provider.tsx  # Wallet context provider
└── lib/
    ├── avatar.ts          # Avatar validation + localStorage helpers
    ├── session.ts         # Persisted wallet session state
    ├── stellar.ts         # Stellar SDK + Freighter integration
    └── types.ts           # TypeScript types and constants
```

Caching and browser-storage behaviour is documented in [Caching & Client Storage](docs/caching.md).

## Testing against Testnet

To test locally against Stellar Testnet, make sure both the app and your Freighter wallet are pointed at the same network. Mismatched network settings cause confusing failures (e.g. transactions referencing the wrong Horizon server or signing with the wrong network passphrase).

1. **Set the env var** in `.env.local`:
   ```bash
   NEXT_PUBLIC_STELLAR_NETWORK=TESTNET
   ```
2. **Switch Freighter to Testnet**: open the Freighter extension, click the network selector, and choose **Testnet**.
3. **Fund a test account**: use the [Stellar Testnet Friendbot](https://friendbot.stellar.org) to fund your G-address before testing.
4. **Run the app**: `npm run dev`.

If you want to use a custom Soroban RPC provider for Testnet (e.g. for performance or reliability testing), also set:

```bash
NEXT_PUBLIC_SOROBAN_RPC_URL_TESTNET=https://your-custom-rpc.example.com
```

The Horizon endpoint cannot be overridden — it is always `https://horizon-testnet.stellar.org` when `NEXT_PUBLIC_STELLAR_NETWORK=TESTNET`.

> **Important:** Both Freighter and the app must be on the **same** network. If Freighter is set to Mainnet while the app is set to TESTNET (or vice versa), transaction signing will fail or submit to the wrong network.

## How It Works

1. **Connect** your Freighter wallet or enter any Stellar address.
2. **Choose** a funding source: G-address, fiat card, or CEX withdrawal.
3. **Enter** the Soroban C-address you want to fund.
4. **Confirm** — sign with Freighter and submit to the Stellar network.

## License

MIT
