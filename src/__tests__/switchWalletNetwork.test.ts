// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * switchWalletNetwork (#480) confirms the switch through the Stellar Wallets
 * Kit (`StellarWalletsKit.getNetwork`, via getWalletNetwork) — the
 * @stellar/freighter-api package is no longer a dependency (#722, #846). The
 * kit and its wallet modules are mocked so getWalletNetwork resolves.
 */

const kit = vi.hoisted(() => ({
  init: vi.fn(),
  getNetwork: vi.fn(),
}));

vi.mock("@creit.tech/stellar-wallets-kit/sdk", () => ({ StellarWalletsKit: kit }));
vi.mock("@creit.tech/stellar-wallets-kit/modules/freighter", () => ({ FreighterModule: class {} }));
vi.mock("@creit.tech/stellar-wallets-kit/modules/xbull", () => ({ xBullModule: class {} }));
vi.mock("@creit.tech/stellar-wallets-kit/modules/lobstr", () => ({ LobstrModule: class {} }));
vi.mock("@creit.tech/stellar-wallets-kit/modules/albedo", () => ({ AlbedoModule: class {} }));
vi.mock("@creit.tech/stellar-wallets-kit/modules/rabet", () => ({ RabetModule: class {} }));

import { switchWalletNetwork } from "@/lib/stellar";

function injectFreighter(setNetwork: unknown) {
  (window as unknown as { freighter?: { setNetwork: unknown } }).freighter = {
    setNetwork,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete (window as unknown as { freighter?: unknown }).freighter;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("switchWalletNetwork (#480, #846)", () => {
  it("falls back to manual when the wallet exposes no programmatic switch API", async () => {
    await expect(switchWalletNetwork("TESTNET")).resolves.toBe("manual");
    expect(kit.getNetwork).not.toHaveBeenCalled();
  });

  it("requests the change through the wallet and confirms it via the kit", async () => {
    const setNetwork = vi.fn().mockResolvedValue(undefined);
    injectFreighter(setNetwork);
    kit.getNetwork.mockResolvedValue({ network: "TESTNET", networkPassphrase: "" });

    await expect(switchWalletNetwork("TESTNET")).resolves.toBe("switched");

    expect(setNetwork).toHaveBeenCalledWith(
      "Test SDF Network ; September 2015",
      "Test SDF Network ; September 2015",
      "https://horizon-testnet.stellar.org"
    );
    expect(kit.getNetwork).toHaveBeenCalled();
  });

  it("passes the mainnet passphrase, name, and URL for a PUBLIC switch", async () => {
    const setNetwork = vi.fn().mockResolvedValue(undefined);
    injectFreighter(setNetwork);
    kit.getNetwork.mockResolvedValue({ network: "PUBLIC", networkPassphrase: "" });

    await expect(switchWalletNetwork("PUBLIC")).resolves.toBe("switched");

    expect(setNetwork).toHaveBeenCalledWith(
      "Public Global Stellar Network ; September 2015",
      "Public Global Stellar Network ; September 2015",
      "https://horizon.stellar.org"
    );
  });

  it("returns cancelled when the user declines the prompt in the wallet", async () => {
    const setNetwork = vi.fn().mockRejectedValue(new Error("User declined"));
    injectFreighter(setNetwork);

    await expect(switchWalletNetwork("PUBLIC")).resolves.toBe("cancelled");
    expect(setNetwork).toHaveBeenCalledOnce();
    expect(kit.getNetwork).not.toHaveBeenCalled();
  });

  it("keeps polling until the wallet lands on the target", async () => {
    const setNetwork = vi.fn().mockResolvedValue(undefined);
    injectFreighter(setNetwork);
    kit.getNetwork
      .mockResolvedValueOnce({ network: "TESTNET", networkPassphrase: "" })
      .mockResolvedValue({ network: "PUBLIC", networkPassphrase: "" });

    vi.useFakeTimers();
    const pending = switchWalletNetwork("PUBLIC");
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toBe("switched");
    expect(kit.getNetwork.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("returns cancelled when the wallet never lands on the target within the timeout", async () => {
    const setNetwork = vi.fn().mockResolvedValue(undefined);
    injectFreighter(setNetwork);
    // The wallet stays on TESTNET while we ask for PUBLIC.
    kit.getNetwork.mockResolvedValue({ network: "TESTNET", networkPassphrase: "" });

    vi.useFakeTimers();
    const pending = switchWalletNetwork("PUBLIC");
    await vi.advanceTimersByTimeAsync(8_500);

    await expect(pending).resolves.toBe("cancelled");
  });

  it("does not count a failed network read as switched", async () => {
    const setNetwork = vi.fn().mockResolvedValue(undefined);
    injectFreighter(setNetwork);
    kit.getNetwork.mockResolvedValue({ error: "locked" });

    vi.useFakeTimers();
    const pending = switchWalletNetwork("TESTNET");
    await vi.advanceTimersByTimeAsync(8_500);

    await expect(pending).resolves.toBe("cancelled");
  });
});
