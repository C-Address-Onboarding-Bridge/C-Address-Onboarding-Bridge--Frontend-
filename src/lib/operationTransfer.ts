/**
 * Shared helper for extracting fund-transfer details from Horizon operation
 * records. Used by getTransactionByHash (stellar.ts), the /api/confirmations
 * route, and any other single-transaction lookup that needs from/to/amount/
 * asset. (#909)
 *
 * Kept in its own module — with no third-party imports — so tests can import
 * it directly without pulling in the full stellar.ts dependency tree
 * (@stellar/freighter-api, @creit.tech/stellar-wallets-kit, etc.).
 */

/**
 * Minimal shape of a Horizon operation record, covering all field names that
 * extractTransferFromOps reads. Structurally compatible with both the raw JSON
 * returned by Horizon's REST API and the Horizon SDK's typed records.
 */
export interface HorizonOpRecord {
  type?: string;
  /** Classic payment / path-payment source. */
  from?: string;
  /** Classic payment / path-payment destination. */
  to?: string;
  /** Amount on payment / path-payment operations. */
  amount?: string;
  /** Starting balance on create_account operations. */
  starting_balance?: string;
  /** Asset discriminator: "native" → XLM, anything else → use asset_code. */
  asset_type?: string;
  asset_code?: string;
  /** Funder address on create_account operations. */
  funder?: string;
  /** New account address on create_account operations. */
  account?: string;
  /** Token movements of an invoke_host_function (SAC transfer). (#720) */
  asset_balance_changes?: Array<{
    asset_type?: string;
    asset_code?: string;
    type?: string;
    from?: string;
    to?: string;
    amount?: string;
  }>;
}

/**
 * Transfer fields extracted from Horizon operation records.
 */
export interface OperationTransfer {
  fromAddress: string;
  toAddress: string;
  amount: string;
  asset: string;
}

/**
 * Scans an array of Horizon operation records and returns the first fund
 * movement it finds, or null when no fund-moving operation is present.
 *
 * Handles:
 * - payment (classic Stellar payment)
 * - path_payment_strict_send / path_payment_strict_receive
 * - create_account (initial funding — funder/account/starting_balance)
 * - invoke_host_function with asset_balance_changes (SAC / G→C bridge) (#909)
 *
 * This is intentionally side-effect-free and has no external dependencies so
 * it is safe to import from tests, API routes, and client-side code alike.
 */
export function extractTransferFromOps(
  records: HorizonOpRecord[]
): OperationTransfer | null {
  for (const op of records) {
    switch (op.type) {
      case "payment":
      case "path_payment_strict_send":
      case "path_payment_strict_receive": {
        const fromAddress = op.from ?? "";
        const toAddress = op.to ?? "";
        const amount = op.amount ?? "";
        const asset = op.asset_type === "native" ? "XLM" : (op.asset_code ?? "XLM");
        if (fromAddress && toAddress && amount) {
          return { fromAddress, toAddress, amount, asset };
        }
        break;
      }

      case "create_account": {
        const fromAddress = op.funder ?? "";
        const toAddress = op.account ?? "";
        const amount = op.starting_balance ?? "";
        if (fromAddress && toAddress && amount) {
          return { fromAddress, toAddress, amount, asset: "XLM" };
        }
        break;
      }

      case "invoke_host_function": {
        // A SAC transfer carries fund movements in asset_balance_changes.
        // The G→C bridge emits exactly one transfer entry. (#720, #909)
        const transfer = op.asset_balance_changes?.find((c) => c.type === "transfer");
        if (transfer) {
          const fromAddress = transfer.from ?? "";
          const toAddress = transfer.to ?? "";
          const amount = transfer.amount ?? "";
          const asset =
            transfer.asset_type === "native" ? "XLM" : (transfer.asset_code ?? "XLM");
          if (fromAddress && toAddress && amount) {
            return { fromAddress, toAddress, amount, asset };
          }
        }
        break;
      }

      default:
        break;
    }
  }
  return null;
}
