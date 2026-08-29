/**
 * Tests for getCurrentNetwork, getWalletNetwork, formatNetworkLabel,
 * and assertActiveAccountMatches.
 *
 * Updated for #459: these functions now delegate to the Stellar Wallets Kit
 * rather than calling the Freighter API directly.
 */

import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Networks } from "@creit.tech/stellar-wallets-kit/types";

// ---------------------------------------------------------------------------
// Mock the Stellar Wallets Kit SDK before importing stellar.ts
// ---------------------------------------------------------------------------

const mockGetNetwork = vi.fn<[], Promise<{ network: string; networkPassphrase: string }>>();
const mockGetAddress = vi.fn<[], Promise<{ address: string }>>();
const mockInit = vi.fn();

vi.mock("@creit.tech/stellar-wallets-kit/sdk", () => ({
  StellarWalletsKit: {
    getNetwork: () => mockGetNetwork(),
    getAddress: () => mockGetAddress(),
    init: mockInit,
    authModal: vi.fn(),
    get selectedModule() { return { productId: "freighter" }; },
  },
  Networks: {
    PUBLIC: "Public Global Stellar Network ; September 2015",
    TESTNET: "Test SDF Network ; September 2015",
    FUTURENET: "Test SDF Future Network ; October 2022",
    SANDBOX: "Local Sandbox Stellar Network ; September 2022",
    STANDALONE: "Standalone Network ; February 2017",
  },
}));

// Mock the wallet modules so initWalletKit dynamic imports resolve
vi.mock("@creit.tech/stellar-wallets-kit/modules/freighter", () => ({
  FreighterModule: class { productId = "freighter"; },
  FREIGHTER_ID: "freighter",
}));
vi.mock("@creit.tech/stellar-wallets-kit/modules/xbull", () => ({
  xBullModule: class { productId = "xbull"; },
}));
vi.mock("@creit.tech/stellar-wallets-kit/modules/lobstr", () => ({
  LobstrModule: class { productId = "lobstr"; },
}));
vi.mock("@creit.tech/stellar-wallets-kit/modules/albedo", () => ({
  AlbedoModule: class { productId = "albedo"; },
}));
vi.mock("@creit.tech/stellar-wallets-kit/modules/rabet", () => ({
  RabetModule: class { productId = "rabet"; },
}));

import {
  initWalletKit,
  getCurrentNetwork,
  getWalletNetwork,
  formatNetworkLabel,
  assertActiveAccountMatches,
} from "@/lib/stellar";
import { isSupportedNetwork } from "@/lib/types";

const ACTIVE = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5V3VQ";
const OTHER = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBTUMXBQ";

beforeAll(async () => {
  // Initialise the kit once so _kitReady = true for all tests
  await initWalletKit(null);
});

beforeEach(() => {
  vi.clearAllMocks();
  // Re-register mocks cleared by clearAllMocks
  mockInit.mockReturnValue(undefined);
});

// #289: every non-PUBLIC value — including Futurenet and a failed query — used
// to collapse into "TESTNET", so the app read the wrong chain and built
// transactions with the wrong passphrase while confidently displaying "Testnet".
describe("getCurrentNetwork", () => {
  it("returns PUBLIC for a mainnet wallet", async () => {
    mockGetNetwork.mockResolvedValue({
      network: "PUBLIC",
      networkPassphrase: Networks.PUBLIC,
    });
    await expect(getCurrentNetwork()).resolves.toBe("PUBLIC");
  });

  it("returns TESTNET for a testnet wallet", async () => {
    mockGetNetwork.mockResolvedValue({
      network: "TESTNET",
      networkPassphrase: Networks.TESTNET,
    });
    await expect(getCurrentNetwork()).resolves.toBe("TESTNET");
  });

  it("returns UNSUPPORTED for FUTURENET rather than pretending it's testnet", async () => {
    mockGetNetwork.mockResolvedValue({
      network: "FUTURENET",
      networkPassphrase: Networks.FUTURENET,
    });
    await expect(getCurrentNetwork()).resolves.toBe("UNSUPPORTED");
  });

  it("returns UNSUPPORTED for a custom/standalone network", async () => {
    mockGetNetwork.mockResolvedValue({
      network: "STANDALONE",
      networkPassphrase: Networks.STANDALONE,
    });
    await expect(getCurrentNetwork()).resolves.toBe("UNSUPPORTED");
  });

  it("returns UNKNOWN when the kit throws", async () => {
    mockGetNetwork.mockRejectedValue(new Error("wallet locked"));
    await expect(getCurrentNetwork()).resolves.toBe("UNKNOWN");
  });

  it("never reports an unsupported or unknown network as supported", async () => {
    for (const passphrase of [Networks.FUTURENET, Networks.STANDALONE, Networks.SANDBOX]) {
      mockGetNetwork.mockResolvedValue({ network: "OTHER", networkPassphrase: passphrase });
      expect(isSupportedNetwork(await getCurrentNetwork())).toBe(false);
    }
  });
});

describe("getWalletNetwork", () => {
  it("reports the raw network name so the UI can name it", async () => {
    mockGetNetwork.mockResolvedValue({
      network: "FUTURENET",
      networkPassphrase: Networks.FUTURENET,
    });
    await expect(getWalletNetwork()).resolves.toEqual({
      status: "UNSUPPORTED",
      name: "FUTURENET",
    });
  });

  it("has no name when the network could not be read", async () => {
    mockGetNetwork.mockRejectedValue(new Error("locked"));
    await expect(getWalletNetwork()).resolves.toEqual({ status: "UNKNOWN", name: null });
  });
});

describe("formatNetworkLabel", () => {
  it("labels the supported networks", () => {
    expect(formatNetworkLabel("PUBLIC")).toBe("Mainnet");
    expect(formatNetworkLabel("TESTNET")).toBe("Testnet");
  });

  it("names the unsupported network when known", () => {
    expect(formatNetworkLabel("UNSUPPORTED", "FUTURENET")).toBe("Futurenet");
    expect(formatNetworkLabel("UNSUPPORTED", null)).toBe("Unsupported");
  });

  it("labels an unreadable network as unknown", () => {
    expect(formatNetworkLabel("UNKNOWN")).toBe("Unknown");
  });
});

// #287: The kit signs with its active wallet's account, not with whatever address
// the transaction names as its source, so a mismatch could only fail at submission
// with an opaque tx_bad_auth. (#459: updated to use kit's getAddress)
describe("assertActiveAccountMatches", () => {
  it("passes when the source is the active account", async () => {
    mockGetAddress.mockResolvedValue({ address: ACTIVE });
    await expect(assertActiveAccountMatches(ACTIVE)).resolves.toBeUndefined();
  });

  it("throws before signing when the source is a different account", async () => {
    mockGetAddress.mockResolvedValue({ address: ACTIVE });
    await expect(assertActiveAccountMatches(OTHER)).rejects.toThrow(
      /does not match the source address/
    );
  });

  it("names both addresses, truncated", async () => {
    mockGetAddress.mockResolvedValue({ address: ACTIVE });
    const error = await assertActiveAccountMatches(OTHER).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(ACTIVE.slice(0, 8));
    expect((error as Error).message).toContain(OTHER.slice(0, 8));
    // Truncated, not the full 56-character keys.
    expect((error as Error).message).not.toContain(ACTIVE);
    expect((error as Error).message).not.toContain(OTHER);
  });

  it("throws when no wallet is connected", async () => {
    mockGetAddress.mockResolvedValue({ address: "" });
    await expect(assertActiveAccountMatches(ACTIVE)).rejects.toThrow(
      /No wallet is connected/
    );
  });
});
