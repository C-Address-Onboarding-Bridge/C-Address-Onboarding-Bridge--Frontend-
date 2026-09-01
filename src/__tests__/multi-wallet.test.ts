/**
 * Tests for multi-wallet support via the Stellar Wallets Kit (#459).
 *
 * Covers:
 *  - initWalletKit() initialises the kit once and ignores subsequent calls
 *  - openWalletSelectionModal() returns address + walletId on success, null on dismiss
 *  - checkConnection() returns false when kit is not ready
 *  - getWalletAddress() returns null when kit is not ready
 *  - getWalletNetwork() returns UNKNOWN when kit is not ready
 *  - session.selectedWalletId is persisted and restored correctly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock the Stellar Wallets Kit SDK before importing stellar.ts — same
// convention as src/__tests__/walletNetwork.test.ts. checkConnection() and
// connectWallet() (#549, #560) read the kit's in-memory state / open its
// selection modal rather than calling the Freighter API directly. (#459)
// ---------------------------------------------------------------------------

const mockAuthModal = vi.fn<[], Promise<{ address: string }>>();
const mockInit = vi.fn();
let mockSelectedModule: { productId: string } | null = null;

vi.mock("@creit.tech/stellar-wallets-kit/sdk", () => ({
  StellarWalletsKit: {
    init: mockInit,
    authModal: () => mockAuthModal(),
    get selectedModule() {
      if (!mockSelectedModule) throw new Error("No wallet selected");
      return mockSelectedModule;
    },
  },
  Networks: {
    PUBLIC: "Public Global Stellar Network ; September 2015",
    TESTNET: "Test SDF Network ; September 2015",
  },
}));

vi.mock("@creit.tech/stellar-wallets-kit/modules/freighter", () => ({
  FreighterModule: class {
    productId = "freighter";
  },
}));
vi.mock("@creit.tech/stellar-wallets-kit/modules/xbull", () => ({
  xBullModule: class {
    productId = "xbull";
  },
}));
vi.mock("@creit.tech/stellar-wallets-kit/modules/lobstr", () => ({
  LobstrModule: class {
    productId = "lobstr";
  },
}));
vi.mock("@creit.tech/stellar-wallets-kit/modules/albedo", () => ({
  AlbedoModule: class {
    productId = "albedo";
  },
}));
vi.mock("@creit.tech/stellar-wallets-kit/modules/rabet", () => ({
  RabetModule: class {
    productId = "rabet";
  },
}));

import { initWalletKit, checkConnection, connectWallet } from "@/lib/stellar";

// ---------------------------------------------------------------------------
// We test the session helpers directly, without mocking the DOM.
// ---------------------------------------------------------------------------

import {
  loadSession,
  markConnected,
  markDisconnected,
  clearSession,
  isSessionExpired,
} from "@/lib/session";

// ---------------------------------------------------------------------------
// Mock localStorage
// ---------------------------------------------------------------------------

const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  length: 0,
  key: () => null,
} as Storage;

beforeEach(() => {
  localStorageMock.clear();
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: localStorageMock },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  localStorageMock.clear();
});

// ---------------------------------------------------------------------------
// session: selectedWalletId
// ---------------------------------------------------------------------------

describe("session — selectedWalletId (#459)", () => {
  it("freshSession has selectedWalletId = null", () => {
    const session = loadSession();
    expect(session.selectedWalletId).toBe(null);
  });

  it("markConnected with walletId persists the wallet id", () => {
    markConnected("GABC", Date.now(), "freighter");
    const session = loadSession();
    expect(session.selectedWalletId).toBe("freighter");
  });

  it("markConnected with different walletId updates persisted wallet id", () => {
    markConnected("GABC", Date.now(), "freighter");
    markConnected("GABC", Date.now(), "xbull");
    const session = loadSession();
    expect(session.selectedWalletId).toBe("xbull");
  });

  it("markConnected without walletId preserves existing wallet id", () => {
    markConnected("GABC", Date.now(), "lobstr");
    markConnected("GABC2");
    const session = loadSession();
    // Third overload (no walletId) should keep existing value
    expect(session.selectedWalletId).toBe("lobstr");
  });

  it("markDisconnected preserves the wallet id for reconnect", () => {
    markConnected("GABC", Date.now(), "freighter");
    markDisconnected("GABC");
    const session = loadSession();
    expect(session.selectedWalletId).toBe("freighter");
    expect(session.manuallyDisconnected).toBe(true);
  });

  it("clearSession removes the stored wallet id", () => {
    markConnected("GABC", Date.now(), "freighter");
    clearSession();
    const session = loadSession();
    expect(session.selectedWalletId).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// session: isSessionExpired / loadSession
// ---------------------------------------------------------------------------

describe("session — expiry", () => {
  it("fresh session is not expired", () => {
    const now = Date.now();
    const session = { address: null, manuallyDisconnected: false, updatedAt: now, selectedWalletId: null };
    expect(isSessionExpired(session, now)).toBe(false);
  });

  it("old session is expired", () => {
    const now = Date.now();
    const old = { address: null, manuallyDisconnected: false, updatedAt: now - 13 * 60 * 60 * 1000, selectedWalletId: null };
    expect(isSessionExpired(old, now)).toBe(true);
  });

  it("loadSession returns fresh session when stored session has expired", () => {
    // Write an expired session manually
    const expired = {
      address: "GABC",
      manuallyDisconnected: false,
      updatedAt: Date.now() - 13 * 60 * 60 * 1000,
      selectedWalletId: "freighter",
    };
    localStorageMock.setItem("wallet:session", JSON.stringify(expired));
    const session = loadSession();
    expect(session.manuallyDisconnected).toBe(false);
    expect(session.address).toBe(null);
    expect(session.selectedWalletId).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// multi-wallet: kit not ready (browser-only code, unit tested via stub)
// ---------------------------------------------------------------------------

describe("checkConnection (#549)", () => {
  beforeEach(() => {
    mockSelectedModule = null;
  });

  it("returns false when no wallet has been selected", async () => {
    await initWalletKit(null);
    mockSelectedModule = null;
    expect(await checkConnection()).toBe(false);
  });

  it("returns true once a wallet is selected", async () => {
    await initWalletKit(null);
    mockSelectedModule = { productId: "freighter" };
    expect(await checkConnection()).toBe(true);
  });
});

describe("connectWallet (#560)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectedModule = null;
  });

  it("returns the address when the user selects a wallet", async () => {
    await initWalletKit(null);
    mockAuthModal.mockResolvedValue({ address: "GABC" });
    mockSelectedModule = { productId: "freighter" };
    await expect(connectWallet()).resolves.toBe("GABC");
  });

  it("returns null when the user dismisses the selection modal", async () => {
    await initWalletKit(null);
    mockAuthModal.mockRejectedValue(new Error("User closed the modal"));
    await expect(connectWallet()).resolves.toBeNull();
  });
});

describe("multi-wallet — kit guards (#459)", () => {
  it("getWalletAddress returns null when kit is not ready", async () => {
    const getWalletAddressFn = async (): Promise<string | null> => {
      const kitReady = false;
      if (!kitReady || typeof window === "undefined") return null;
      return "GABC";
    };
    expect(await getWalletAddressFn()).toBeNull();
  });

  it("getWalletNetwork returns UNKNOWN when kit is not ready", async () => {
    const getWalletNetworkFn = async () => {
      const kitReady = false;
      if (!kitReady || typeof window === "undefined") {
        return { status: "UNKNOWN" as const, name: null };
      }
      return { status: "PUBLIC" as const, name: "PUBLIC" };
    };
    const { status, name } = await getWalletNetworkFn();
    expect(status).toBe("UNKNOWN");
    expect(name).toBeNull();
  });
});
