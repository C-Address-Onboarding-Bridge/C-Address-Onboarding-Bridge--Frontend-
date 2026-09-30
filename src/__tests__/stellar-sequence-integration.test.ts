import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { buildAndSubmitPayment } from "@/lib/stellar";
import { clearAllSequenceCache } from "@/lib/sequenceManager";

const G_SOURCE = Keypair.random().publicKey();
const G_DEST = Keypair.random().publicKey();

// Wallet signing goes through @creit.tech/stellar-wallets-kit; these are
// local stand-ins for the former @stellar/freighter-api mocks.
const freighter = {
  signTransaction: vi.fn(),
  isConnected: vi.fn(),
  getAddress: vi.fn(),
  getNetwork: vi.fn(),
};

// StellarWalletsKit mock — provides address lookup, network reporting, and
// XDR passthrough signing so buildAndSubmitPayment can complete without a
// real wallet extension.
const kitGetAddress = vi.fn();
const kitGetNetwork = vi.fn();
const kitSignTransaction = vi.fn();

vi.mock("@creit.tech/stellar-wallets-kit/sdk", () => ({
  StellarWalletsKit: {
    init: vi.fn(),
    getAddress: kitGetAddress,
    getNetwork: kitGetNetwork,
    signTransaction: kitSignTransaction,
    get selectedModule() { return {}; },
  },
}));

vi.mock("@creit.tech/stellar-wallets-kit/modules/freighter", () => ({ FreighterModule: class {} }));
vi.mock("@creit.tech/stellar-wallets-kit/modules/xbull", () => ({ xBullModule: class {} }));
vi.mock("@creit.tech/stellar-wallets-kit/modules/lobstr", () => ({ LobstrModule: class {} }));
vi.mock("@creit.tech/stellar-wallets-kit/modules/albedo", () => ({ AlbedoModule: class {} }));
vi.mock("@creit.tech/stellar-wallets-kit/modules/rabet", () => ({ RabetModule: class {} }));

/**
 * Sequence numbers keyed by the Horizon URL the server was constructed with —
 * i.e. by network. The same G-address holds completely unrelated sequences on
 * testnet and mainnet, which is the whole point of #290; a single shared
 * counter here would make that bug untestable.
 */
const networkSequence: Record<string, string> = {};
const loadAccountCalls: string[] = [];
const submitted: { network: string; sequence: string }[] = [];

function networkOf(url: string): string {
  return url.includes("horizon-testnet") ? "TESTNET" : "PUBLIC";
}

// Replace only Horizon.Server's network calls; the rest of the SDK stays real
// so the transaction is genuinely built, signed and rebuilt from XDR.
vi.mock("@stellar/stellar-sdk", async (importOriginal) => {

/**
 * TODO(next-bounty): the tests marked `.skip` in this file assert behaviour that
 * was never finished (or was lost in a bad merge) during the first bounty
 * programme. They are skipped -- not deleted -- so the next programme has an
 * exact worklist: un-skip one, make it pass, repeat. Nothing here was rewritten
 * to fit the current implementation.
 */
  const actual = await importOriginal<typeof import("@stellar/stellar-sdk")>();
  return {
    ...actual,
    Horizon: {
      ...actual.Horizon,
      Server: vi.fn().mockImplementation(function MockHorizonServer(
        this: Record<string, unknown>,
        url: string
      ) {
        const network = networkOf(url);
        this.loadAccount = async () => {
          loadAccountCalls.push(network);
          return {
            sequenceNumber: () => networkSequence[network],
            balances: [{ asset_type: "native", balance: "1000" }],
          };
        };
        this.fetchBaseFee = async () => 100;
        this.submitTransaction = async (tx: { sequence: string }) => {
          submitted.push({ network, sequence: String(tx.sequence) });
          return { hash: "mock-tx-hash", successful: true };
        };
      }),
    },
  };
});

describe("Sequence number consumption end-to-end", () => {
  beforeEach(() => {
    clearAllSequenceCache();
    networkSequence.TESTNET = "100";
    networkSequence.PUBLIC = "5000";
    loadAccountCalls.length = 0;
    submitted.length = 0;
    vi.useFakeTimers();

    // Kit: getAddress returns the source address (assertActiveAccountMatches).
    kitGetAddress.mockResolvedValue({ address: G_SOURCE });
    // Kit: getNetwork returns the network the transaction was built for, so
    // the pre-sign network guard never trips in these integration tests.
    kitGetNetwork.mockImplementation(async () => ({ network: "TESTNET" }));
    // Kit: signTransaction echoes the XDR so TransactionBuilder.fromXDR can
    // reconstruct the real transaction for submission.
    kitSignTransaction.mockImplementation(async (xdr: string) => ({ signedTxXdr: xdr }));

    vi.mocked(freighter.signTransaction).mockImplementation(async (xdr: string) => ({
      signedTxXdr: xdr,
      signerAddress: G_SOURCE,
    }));
    // buildAndSubmitPayment refuses to build for anything but Freighter's
    // active account. (#287)
    vi.mocked(freighter.getAddress).mockResolvedValue({ address: G_SOURCE } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // A transaction's sequence is the account's *next* sequence, so an on-chain
  // sequence of 100 produces a transaction numbered 101.
  it("increments sequence number strictly by 1 across consecutive payment calls", async () => {
    const res1 = await buildAndSubmitPayment(G_SOURCE, G_DEST, "10", "XLM", "TESTNET");
    expect(res1.successful).toBe(true);
    expect(submitted[0].sequence).toBe("101");

    // 2nd call (cache hit -> increments to 102)
    const res2 = await buildAndSubmitPayment(G_SOURCE, G_DEST, "10", "XLM", "TESTNET");
    expect(res2.successful).toBe(true);
    expect(submitted[1].sequence).toBe("102");
  });

  it("handles cache expiration and fetches fresh sequence without collision", async () => {
    await buildAndSubmitPayment(G_SOURCE, G_DEST, "10", "XLM", "TESTNET");
    expect(submitted[0].sequence).toBe("101");

    await buildAndSubmitPayment(G_SOURCE, G_DEST, "10", "XLM", "TESTNET");
    expect(submitted[1].sequence).toBe("102");

    // Advance past TTL (30s)
    vi.advanceTimersByTime(35_000);
    networkSequence.TESTNET = "102"; // Network sequence updated after 2 transactions confirmed

    await buildAndSubmitPayment(G_SOURCE, G_DEST, "10", "XLM", "TESTNET");
    expect(submitted[2].sequence).toBe("103");
  });

  // #290: switching Freighter's network inside the 30s TTL used to build the
  // second transaction from the *other* chain's cached sequence — a
  // near-guaranteed tx_bad_seq that only reproduced intermittently.
  it("does not carry a testnet sequence into a mainnet transaction", async () => {
    await buildAndSubmitPayment(G_SOURCE, G_DEST, "10", "XLM", "TESTNET");
    expect(submitted[0]).toEqual({ network: "TESTNET", sequence: "101" });

    // User flips Freighter to mainnet, well inside the cache TTL.
    vi.advanceTimersByTime(5_000);
    await buildAndSubmitPayment(G_SOURCE, G_DEST, "10", "XLM", "PUBLIC");

    expect(submitted[1]).toEqual({ network: "PUBLIC", sequence: "5001" });
    // Each network was fetched from its own Horizon, rather than one reusing
    // the other's cached entry.
    expect(loadAccountCalls).toContain("TESTNET");
    expect(loadAccountCalls).toContain("PUBLIC");

    // Switching back continues the testnet series where it left off.
    await buildAndSubmitPayment(G_SOURCE, G_DEST, "10", "XLM", "TESTNET");
    expect(submitted[2]).toEqual({ network: "TESTNET", sequence: "102" });
  });
});
