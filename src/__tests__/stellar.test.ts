import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Keypair, StrKey, Horizon } from "@stellar/stellar-sdk";
import {
  isValidStellarAddress,
  isCAddress,
  isGAddress,
  isValidStellarAmount,
  getAccountBalances,
  clearAccountBalancesCache,
  getHorizonServer,
  fetchRecentTransactions,
  findTransactionByHash,
} from "@/lib/stellar";
import { HORIZON_URL } from "@/lib/types";

// Horizon's network call is the only thing stubbed; every other SDK export
// (Keypair, StrKey, ...) stays real so the address fixtures below are genuine
// checksum-valid StrKeys rather than hand-rolled look-alikes.
const loadAccount = vi.fn();
const paymentsCall = vi.fn();
const transactionCall = vi.fn();

vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stellar/stellar-sdk")>();
  return {
    ...actual,
    Horizon: {
      ...actual.Horizon,
      Server: vi.fn().mockImplementation(function MockHorizonServer(this: {
        loadAccount: typeof loadAccount;
        payments: () => unknown;
        transactions: () => unknown;
        operations: () => unknown;
      }, url: string) {
        this.loadAccount = loadAccount;
        const builder = {
          forAccount: () => builder,
          limit: () => builder,
          order: () => builder,
          call: paymentsCall,
        };
        this.payments = () => builder;
        this.transactions = () => ({ transaction: (hash: string) => ({ call: () => transactionCall(url, hash) }) });
        this.operations = () => ({ forTransaction: () => ({ call: async () => ({ records: [] }) }) });
      }),
    },
  };
});

// Real, checksum-valid StrKeys derived from the SDK — not hardcoded strings
// that merely "look" the right length/prefix. The G-address is a genuine
// Ed25519 public key; the C-address is a genuine contract StrKey encoded from
// the same 32-byte body. Both carry a valid base32 alphabet and CRC16 checksum.
const keypair = Keypair.random();
const G_ADDRESS = keypair.publicKey();
const C_ADDRESS = StrKey.encodeContract(keypair.rawPublicKey());

describe("fixtures are genuinely valid StrKeys", () => {
  it("G_ADDRESS is a valid Ed25519 public key", () => {
    expect(StrKey.isValidEd25519PublicKey(G_ADDRESS)).toBe(true);
    expect(G_ADDRESS).toMatch(/^G/);
    expect(G_ADDRESS).toHaveLength(56);
  });

  it("C_ADDRESS is a valid contract StrKey", () => {
    expect(StrKey.isValidContract(C_ADDRESS)).toBe(true);
    expect(C_ADDRESS).toMatch(/^C/);
    expect(C_ADDRESS).toHaveLength(56);
  });
});

describe("isValidStellarAddress", () => {
  it("accepts a real, checksum-valid G-address", () => {
    expect(isValidStellarAddress(G_ADDRESS)).toBe(true);
  });

  it("accepts a real, checksum-valid C-address", () => {
    expect(isValidStellarAddress(C_ADDRESS)).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidStellarAddress("")).toBe(false);
  });

  it("rejects too-short address", () => {
    expect(isValidStellarAddress("GABC")).toBe(false);
  });

  it("rejects invalid prefix", () => {
    const addr = "X" + G_ADDRESS.slice(1);
    expect(isValidStellarAddress(addr)).toBe(false);
  });

  // Regression: the old /^[G|C].../ character class treated '|' as an allowed
  // first character, so a pipe-prefixed 56-char string wrongly validated.
  it("rejects a pipe-prefixed 56-character string", () => {
    const piped = "|" + G_ADDRESS.slice(1);
    expect(piped).toHaveLength(56);
    expect(isValidStellarAddress(piped)).toBe(false);
  });

  // Regression: the old [A-Z0-9] body class accepted 0/1/8/9, which are NOT in
  // the Stellar base32 alphabet (RFC 4648 uses A-Z and 2-7).
  it.each(["0", "1", "8", "9"])(
    "rejects an address containing invalid base32 char '%s' in the body",
    (badChar) => {
      const corrupted = G_ADDRESS.slice(0, 10) + badChar + G_ADDRESS.slice(11);
      expect(corrupted).toHaveLength(56);
      expect(isValidStellarAddress(corrupted)).toBe(false);
    },
  );

  // Regression: the old regex performed no checksum verification at all, so a
  // single-character corruption that stays within the alphabet slipped through.
  it("rejects a checksum-corrupted address (last character flipped)", () => {
    const last = G_ADDRESS.slice(-1);
    const flipped = last === "A" ? "B" : "A";
    const corrupted = G_ADDRESS.slice(0, -1) + flipped;
    expect(corrupted).toHaveLength(56);
    expect(corrupted).not.toBe(G_ADDRESS);
    expect(isValidStellarAddress(corrupted)).toBe(false);
  });
});

describe("isValidStellarAmount", () => {
  it("accepts valid integers", () => {
    expect(isValidStellarAmount("100")).toBe(true);
    expect(isValidStellarAmount("1")).toBe(true);
  });

  it("accepts amounts with up to 7 decimal places", () => {
    expect(isValidStellarAmount("0.1")).toBe(true);
    expect(isValidStellarAmount("0.1234567")).toBe(true);
    expect(isValidStellarAmount("10.0000001")).toBe(true);
  });

  it("rejects amounts with more than 7 decimal places", () => {
    expect(isValidStellarAmount("0.12345678")).toBe(false);
    expect(isValidStellarAmount("1.000000001")).toBe(false);
  });

  it("rejects zero and negative amounts", () => {
    expect(isValidStellarAmount("0")).toBe(false);
    expect(isValidStellarAmount("0.0000000")).toBe(false);
    expect(isValidStellarAmount("-5")).toBe(false);
  });

  it("rejects invalid formats", () => {
    expect(isValidStellarAmount("")).toBe(false);
    expect(isValidStellarAmount("abc")).toBe(false);
    expect(isValidStellarAmount("1.2.3")).toBe(false);
    expect(isValidStellarAmount("1.")).toBe(false);
  });
});

describe("isCAddress", () => {
  it("detects a valid C-address", () => {
    expect(isCAddress(C_ADDRESS)).toBe(true);
  });

  it("rejects a G-address", () => {
    expect(isCAddress(G_ADDRESS)).toBe(false);
  });

  it("rejects a short address", () => {
    expect(isCAddress("CABC")).toBe(false);
  });

  it("rejects a C-prefixed string that fails the checksum", () => {
    const corrupted = C_ADDRESS.slice(0, -1) + (C_ADDRESS.slice(-1) === "A" ? "B" : "A");
    expect(isCAddress(corrupted)).toBe(false);
  });
});

describe("isGAddress", () => {
  it("detects a valid G-address", () => {
    expect(isGAddress(G_ADDRESS)).toBe(true);
  });

  it("rejects a C-address", () => {
    expect(isGAddress(C_ADDRESS)).toBe(false);
  });

  it("rejects a G-prefixed string that fails the checksum", () => {
    const corrupted = G_ADDRESS.slice(0, -1) + (G_ADDRESS.slice(-1) === "A" ? "B" : "A");
    expect(isGAddress(corrupted)).toBe(false);
  });
});

describe("getAccountBalances cache", () => {
  const account = (xlm: string) => ({
    balances: [{ asset_type: "native", balance: xlm }],
  });

  beforeEach(() => {
    clearAccountBalancesCache();
    loadAccount.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("parses the native balance into total", async () => {
    loadAccount.mockResolvedValue(account("100.5"));

    const result = await getAccountBalances(G_ADDRESS, "TESTNET");

    expect(result.total).toBe("100.5");
    expect(result.balances).toEqual([{ asset: "XLM", amount: "100.5" }]);
  });

  it("serves back-to-back calls within the TTL from cache", async () => {
    loadAccount.mockResolvedValue(account("100"));

    const first = await getAccountBalances(G_ADDRESS, "TESTNET");
    const second = await getAccountBalances(G_ADDRESS, "TESTNET");

    expect(first.total).toBe("100");
    expect(second.total).toBe("100");
    expect(loadAccount).toHaveBeenCalledTimes(1);
  });

  it("refetches once the TTL has elapsed", async () => {
    loadAccount.mockResolvedValue(account("100"));
    await getAccountBalances(G_ADDRESS, "TESTNET");

    vi.advanceTimersByTime(11_000);
    loadAccount.mockResolvedValue(account("200"));
    const result = await getAccountBalances(G_ADDRESS, "TESTNET");

    expect(result.total).toBe("200");
    expect(loadAccount).toHaveBeenCalledTimes(2);
  });

  it("caches per address:network key", async () => {
    loadAccount.mockResolvedValue(account("100"));

    await getAccountBalances(G_ADDRESS, "TESTNET");
    await getAccountBalances(G_ADDRESS, "PUBLIC");

    // Same address, different network -> distinct cache entries.
    expect(loadAccount).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent in-flight requests", async () => {
    let resolve!: (value: unknown) => void;
    loadAccount.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );

    const p1 = getAccountBalances(G_ADDRESS, "TESTNET");
    const p2 = getAccountBalances(G_ADDRESS, "TESTNET");
    resolve(account("77"));
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1.total).toBe("77");
    expect(r2.total).toBe("77");
    expect(loadAccount).toHaveBeenCalledTimes(1);
  });

  it("throws on a network error instead of reporting a zero balance, and does not cache it (#719)", async () => {
    loadAccount.mockRejectedValueOnce(new Error("network down"));

    await expect(getAccountBalances(G_ADDRESS, "TESTNET")).rejects.toThrow("network down");

    // Next call within the TTL must retry rather than serve the fallback.
    loadAccount.mockResolvedValue(account("50"));
    const recovered = await getAccountBalances(G_ADDRESS, "TESTNET");

    expect(recovered.total).toBe("50");
    expect(loadAccount).toHaveBeenCalledTimes(2);
  });

  it("marks 404 account misses as unfunded and retries on the next call", async () => {
    loadAccount.mockRejectedValueOnce({ response: { status: 404 } });

    const unfunded = await getAccountBalances(G_ADDRESS, "TESTNET");
    expect(unfunded).toEqual({ total: "0", balances: [], unfunded: true });

    loadAccount.mockResolvedValue(account("25"));
    const recovered = await getAccountBalances(G_ADDRESS, "TESTNET");

    expect(recovered.total).toBe("25");
    expect(loadAccount).toHaveBeenCalledTimes(2);
  });

  it("throws on a Horizon 500 instead of reporting a zero balance (#719)", async () => {
    const serverError = { response: { status: 500 } };
    loadAccount.mockRejectedValueOnce(serverError);

    await expect(getAccountBalances(G_ADDRESS, "TESTNET")).rejects.toBe(serverError);
  });

  it("clearAccountBalancesCache forces a refetch", async () => {
    loadAccount.mockResolvedValue(account("100"));
    await getAccountBalances(G_ADDRESS, "TESTNET");

    clearAccountBalancesCache();
    await getAccountBalances(G_ADDRESS, "TESTNET");

    expect(loadAccount).toHaveBeenCalledTimes(2);
  });
});

describe("getHorizonServer", () => {
  beforeEach(() => {
    (Horizon.Server as unknown as ReturnType<typeof vi.fn>).mockClear();
  });

  it("builds a Horizon server pointed at the network's Horizon URL", async () => {
    await getHorizonServer("PUBLIC");
    expect(Horizon.Server).toHaveBeenCalledWith(HORIZON_URL.PUBLIC);
  });

  it("uses the testnet Horizon URL for TESTNET", async () => {
    await getHorizonServer("TESTNET");
    expect(Horizon.Server).toHaveBeenCalledWith(HORIZON_URL.TESTNET);
  });

  it("PUBLIC and TESTNET resolve to distinct Horizon URLs", () => {
    expect(HORIZON_URL.PUBLIC).not.toBe(HORIZON_URL.TESTNET);
  });
});

describe("fetchRecentTransactions (#720)", () => {
  const OTHER_G = Keypair.random().publicKey();
  const base = { transaction_successful: true, created_at: "2026-01-01T00:00:00Z", transaction_hash: "h" };

  beforeEach(() => {
    paymentsCall.mockReset();
  });

  it("propagates Horizon errors instead of returning an empty history", async () => {
    paymentsCall.mockRejectedValueOnce(new Error("horizon down"));
    await expect(fetchRecentTransactions(G_ADDRESS, "TESTNET")).rejects.toThrow("horizon down");
  });

  it("classifies each operation type", async () => {
    paymentsCall.mockResolvedValueOnce({
      records: [
        { ...base, id: "1", type: "payment", from: G_ADDRESS, to: OTHER_G, amount: "1", asset_type: "native" },
        { ...base, id: "2", type: "path_payment_strict_send", from: G_ADDRESS, to: OTHER_G, amount: "2", asset_type: "credit_alphanum4", asset_code: "USDC" },
        { ...base, id: "3", type: "create_account", funder: OTHER_G, account: G_ADDRESS, starting_balance: "3" },
        { ...base, id: "4", type: "account_merge", account: OTHER_G, into: G_ADDRESS },
        { ...base, id: "5", type: "invoke_host_function", asset_balance_changes: [{ type: "transfer", from: G_ADDRESS, to: C_ADDRESS, amount: "5", asset_type: "native" }] },
        { ...base, id: "6", type: "invoke_host_function", asset_balance_changes: [{ type: "transfer", from: C_ADDRESS, to: OTHER_G, amount: "6", asset_type: "credit_alphanum4", asset_code: "USDC" }] },
        { ...base, id: "7", type: "invoke_host_function" },
      ],
    });

    const txs = await fetchRecentTransactions(G_ADDRESS, "TESTNET");

    expect(txs.map((t) => t.type)).toEqual([
      "payment",
      "path-payment",
      "create-account",
      "account-merge",
      "g-to-c",
      "contract-transfer",
    ]);
    expect(txs[1].asset).toBe("USDC");
    expect(txs[2]).toMatchObject({ fromAddress: OTHER_G, toAddress: G_ADDRESS, amount: "3", asset: "XLM" });
    expect(txs[3]).toMatchObject({ fromAddress: OTHER_G, toAddress: G_ADDRESS });
    expect(txs[4]).toMatchObject({ fromAddress: G_ADDRESS, toAddress: C_ADDRESS, amount: "5", asset: "XLM" });
  });
});

describe("findTransactionByHash (#717)", () => {
  const HASH = "a".repeat(64);
  const record = { hash: HASH, successful: true, source_account_sequence: "1" };

  beforeEach(() => {
    transactionCall.mockReset();
  });

  it("falls back to the other network when the hash isn't on the wallet's", async () => {
    transactionCall.mockImplementation(async (url: string) => {
      if (url === HORIZON_URL.PUBLIC) return record;
      throw { response: { status: 404 } };
    });

    const result = await findTransactionByHash(HASH, "TESTNET");

    expect(result).toMatchObject({ network: "PUBLIC", status: "confirmed" });
  });

  it("uses the link's network without consulting the wallet's", async () => {
    transactionCall.mockResolvedValue(record);

    const result = await findTransactionByHash(HASH, "TESTNET", "PUBLIC");

    expect(result?.network).toBe("PUBLIC");
    expect(transactionCall).toHaveBeenCalledTimes(1);
    expect(transactionCall).toHaveBeenCalledWith(HORIZON_URL.PUBLIC, HASH);
  });
});
