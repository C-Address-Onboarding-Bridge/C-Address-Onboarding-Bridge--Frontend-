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
  simulatePayment,
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

  // Regression: amounts above the int64 stroop maximum (922337203685.4775807)
  // previously passed the format/positivity checks and only blew up later
  // inside the Stellar SDK. The upper bound must be enforced here.
  it("accepts the exact int64 stroop maximum", () => {
    expect(isValidStellarAmount("922337203685.4775807")).toBe(true);
  });

  it("rejects amounts above the int64 stroop maximum", () => {
    expect(isValidStellarAmount("922337203685.4775808")).toBe(false);
    expect(isValidStellarAmount("922337203686")).toBe(false);
    expect(isValidStellarAmount("1000000000000")).toBe(false);
  });

  it("rejects a 20-digit integer string instead of only approximating it as a float", () => {
    expect(isValidStellarAmount("99999999999999999999")).toBe(false);
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

// ---------------------------------------------------------------------------
// getAccountBalances / fetchRecentTransactions / simulatePayment tests share
// the single Horizon.Server mock declared at the top of this file. Each block
// resets the relevant mock fn in beforeEach.
// ---------------------------------------------------------------------------
describe("getAccountBalances", () => {
  beforeEach(() => {
    loadAccount.mockReset();
    clearAccountBalancesCache();
  });

  afterEach(() => {
    clearAccountBalancesCache();
  });

  it("returns native and issued asset balances", async () => {
    loadAccount.mockResolvedValue({
      balances: [
        { asset_type: "native", balance: "100.0000000" },
        {
          asset_type: "credit_alphanum4",
          asset_code: "USDC",
          asset_issuer: G_ADDRESS,
          balance: "50.0000000",
        },
      ],
    });

    const balances = await getAccountBalances(G_ADDRESS);
    expect(balances).toEqual([
      { asset: "XLM", balance: "100.0000000" },
      { asset: "USDC", balance: "50.0000000" },
    ]);
    expect(loadAccount).toHaveBeenCalledWith(G_ADDRESS);
  });

  it("caches results and does not re-hit Horizon within the TTL", async () => {
    loadAccount.mockResolvedValue({
      balances: [{ asset_type: "native", balance: "10.0000000" }],
    });

    await getAccountBalances(G_ADDRESS);
    await getAccountBalances(G_ADDRESS);

    expect(loadAccount).toHaveBeenCalledTimes(1);
  });

  it("propagates Horizon errors", async () => {
    loadAccount.mockRejectedValue(new Error("account not found"));
    await expect(getAccountBalances(G_ADDRESS)).rejects.toThrow("account not found");
  });
});

describe("getHorizonServer", () => {
  it("constructs a Horizon server pointed at HORIZON_URL", () => {
    const server = getHorizonServer();
    expect(server).toBeDefined();
    expect(Horizon.Server).toHaveBeenCalledWith(HORIZON_URL);
  });
});

describe("simulatePayment", () => {
  beforeEach(() => {
    transactionCall.mockReset();
  });

  it("returns success when the transaction lookup resolves", async () => {
    transactionCall.mockResolvedValue({ successful: true });

    const result = await simulatePayment(G_ADDRESS, "10");
    expect(result).toBeDefined();
    expect(transactionCall).toHaveBeenCalled();
  });

  it("surfaces failures from the transaction lookup", async () => {
    transactionCall.mockRejectedValue(new Error("tx failed"));
    await expect(simulatePayment(G_ADDRESS, "10")).rejects.toThrow("tx failed");
  });
});
