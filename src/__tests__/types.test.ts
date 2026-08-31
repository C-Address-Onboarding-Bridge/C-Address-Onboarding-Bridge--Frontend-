import { describe, it, expect } from "vitest";
import {
  CEX_LIST,
  STELLAR_NETWORK,
  SOROBAN_RPC_URL,
  HORIZON_URL,
  isSupportedNetwork,
  isOnrampProvider,
  isTerminalStatus,
  getAddressType,
} from "@/lib/types";

describe("CEX_LIST", () => {
  it("has three exchanges", () => {
    expect(CEX_LIST).toHaveLength(3);
  });

  it("each exchange has required fields", () => {
    for (const cex of CEX_LIST) {
      expect(cex.name).toBeTruthy();
      expect(cex.logo).toBeTruthy();
      expect(cex.supportedNetworks.length).toBeGreaterThan(0);
      expect(cex.minWithdrawal).toBeTruthy();
      expect(cex.fee).toBeTruthy();
      expect(cex.withdrawalUrl).toBeTruthy();
    }
  });
});

describe("Network constants", () => {
  it("has PUBLIC and TESTNET", () => {
    expect(STELLAR_NETWORK.PUBLIC).toBe("PUBLIC");
    expect(STELLAR_NETWORK.TESTNET).toBe("TESTNET");
  });

  it("TESTNET Soroban RPC defaults to the real SDF endpoint", () => {
    // Regression: this used to be "soroban-rpc-testnet.stellar.org", a
    // hostname that never resolved. See issue #286.
    expect(SOROBAN_RPC_URL.TESTNET).toBe("https://soroban-testnet.stellar.org");
  });

  it("PUBLIC Soroban RPC is empty unless explicitly configured", () => {
    // SDF does not operate a free public mainnet Soroban RPC; getSorobanRpcServer
    // throws a clear configuration error rather than resolving to a fake hostname.
    expect(SOROBAN_RPC_URL.PUBLIC).toBe("");
  });

  it("Horizon URLs are valid", () => {
    expect(HORIZON_URL.PUBLIC).toContain("horizon.stellar.org");
    expect(HORIZON_URL.TESTNET).toContain("testnet");
  });
});

describe("isSupportedNetwork", () => {
  it("returns true for PUBLIC and TESTNET", () => {
    expect(isSupportedNetwork("PUBLIC")).toBe(true);
    expect(isSupportedNetwork("TESTNET")).toBe(true);
  });

  it("returns false for UNSUPPORTED and UNKNOWN", () => {
    expect(isSupportedNetwork("UNSUPPORTED")).toBe(false);
    expect(isSupportedNetwork("UNKNOWN")).toBe(false);
  });
});

describe("isOnrampProvider", () => {
  it("accepts known providers", () => {
    expect(isOnrampProvider("moonpay")).toBe(true);
    expect(isOnrampProvider("transak")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isOnrampProvider("stripe")).toBe(false);
    expect(isOnrampProvider(null)).toBe(false);
    expect(isOnrampProvider(42)).toBe(false);
  });
});

describe("isTerminalStatus", () => {
  it("returns true for confirmed and failed", () => {
    expect(isTerminalStatus("confirmed")).toBe(true);
    expect(isTerminalStatus("failed")).toBe(true);
  });

  it("returns false for pending", () => {
    expect(isTerminalStatus("pending")).toBe(false);
  });
});

describe("getAddressType", () => {
  it("returns G for G-addresses", () => {
    expect(getAddressType("GABC123")).toBe("G");
  });

  it("returns C for C-addresses", () => {
    expect(getAddressType("CABC123")).toBe("C");
  });

  it("returns null for unknown prefixes", () => {
    expect(getAddressType("XABC123")).toBe(null);
    expect(getAddressType("")).toBe(null);
  });
});
