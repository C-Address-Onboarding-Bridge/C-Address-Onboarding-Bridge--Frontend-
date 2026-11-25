# Dependency advisories

## @creit.tech/stellar-wallets-kit -> @hot-wallet/sdk (#854)

`@creit.tech/stellar-wallets-kit@2.7.1` (latest) still depends on `@hot-wallet/sdk@1.0.11`, so upgrading the kit does not remove the NEAR/Solana stack.

- `stream-json` (<=3.5.0, via `jayson` -> `@solana/web3.js`): pinned to `^3.7.0` via `overrides` in `package.json`.
- `uuid`: pinned to `^11.1.1` via `overrides`.
- `elliptic`: no patched release exists (6.6.1 is the latest on npm); remains an accepted, tracked advisory.
- `@solana/web3.js`: no non-breaking fixed release; tracked until the HOT wallet module can be excluded from `initWalletKit`.

Run `npm install` to refresh `package-lock.json` after changing overrides.
