// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { switchWalletNetwork } from "@/lib/stellar";
import * as freighter from "@stellar/freighter-api";

vi.mock("@stellar/freighter-api", () => ({
  isConnected: vi.fn(),
  getAddress: vi.fn(),
  signTransaction: vi.fn(),
  getNetwork: vi.fn(),
}));

const getNetwork = vi.mocked(freighter.getNetwork);

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

describe("switchWalletNetwork (#480)", () => {
  it("falls back to manual when the wallet exposes no programmatic switch API", async () => {
    await expect(switchWalletNetwork("TESTNET")).resolves.toBe("manual");
  });

  it("requests the change through the wallet and confirms once it lands on the target", async () => {
    const setNetwork = vi.fn().mockResolvedValue(undefined);
    injectFreighter(setNetwork);
    getNetwork.mockResolvedValue({ network: "TESTNET", networkPassphrase: "" } as never);

    await expect(switchWalletNetwork("TESTNET")).resolves.toBe("switched");

    expect(setNetwork).toHaveBeenCalledWith(
      "Test SDF Network ; September 2015",
      "Test SDF Network ; September 2015",
      "https://horizon-testnet.stellar.org"
    );
  });

  it("passes the mainnet passphrase, name, and URL for a PUBLIC switch", async () => {
    const setNetwork = vi.fn().mockResolvedValue(undefined);
    injectFreighter(setNetwork);
    getNetwork.mockResolvedValue({ network: "PUBLIC", networkPassphrase: "" } as never);

    await switchWalletNetwork("PUBLIC");

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
  });

  it("returns cancelled when the wallet never lands on the target within the timeout", async () => {
    const setNetwork = vi.fn().mockResolvedValue(undefined);
    injectFreighter(setNetwork);
    // The wallet stays on TESTNET while we ask for PUBLIC.
    getNetwork.mockResolvedValue({ network: "TESTNET", networkPassphrase: "" } as never);

    vi.useFakeTimers();
    const pending = switchWalletNetwork("PUBLIC");
    await vi.advanceTimersByTimeAsync(8_500);

    await expect(pending).resolves.toBe("cancelled");
  });
});
