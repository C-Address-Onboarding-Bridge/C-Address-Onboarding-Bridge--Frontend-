# #1024 — Address-scoped transaction export

## Built
- `src/app/api/backend/transactions/export/route.ts` no longer forwards the caller's
  query string to the platform-wide `/api/v1/transactions` list.
- Requires a valid StrKey `address` and a `network` (`TESTNET`/`PUBLIC`); 400 otherwise.
- Forwards only `address`, `network`, `fromDate` (from `from`) and `toDate` (from `to`);
  every other param is dropped.
- Returns 501 until an address-scoped backend endpoint exists.
- Route tests in `src/app/api/backend/__tests__/routes.test.ts`.

## Remaining
1. **Ownership proof (decision).** Off-chain transaction history is private data, so the
   export should require proof the caller controls `address` — a SEP-10 challenge signed
   by the wallet, verified server-side, before any rows are returned. Recommended:
   `POST /api/backend/transactions/export/challenge` issuing a challenge, and the export
   route requiring a signed challenge header. Until then the route returns 501, so no
   data leaks.
2. **Backend endpoint.** Add `GET /api/v1/transactions/export?address&network&fromDate&toDate&cursor`
   scoped to `address` on the backend, then replace the 501 with
   `proxyToBackend(request, "/api/v1/transactions/export?" + query)`.
3. **Client.** `src/lib/api.ts#fetchTransactionExportPage` still calls the backend
   directly with `from`/`to`; align it with `fromDate`/`toDate` and route it through the
   proxy once (1) and (2) land.

Done when: export requires a verified signed challenge, proxies only the address-scoped
endpoint, and tests cover the 401/403 path for an unproven address.
