import { afterEach, describe, expect, it, vi } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { requestTestXLM } from "@/lib/stellar";

/**
 * #760: friendbot only funds testnet accounts, so requestTestXLM must refuse
 * any other network itself rather than relying on the UI to hide the button.
 */

/** Minimal fetch response, in the same shape the other suites mock. */
function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const VALID_G_ADDRESS = Keypair.random().publicKey();

afterEach(() => {
  vi.restoreAllMocks();
});

describe("requestTestXLM network guard (#760)", () => {
  it("refuses mainnet without calling friendbot", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await requestTestXLM(VALID_G_ADDRESS, "PUBLIC");

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/only available on Testnet/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses before validating the address, so no mainnet success is ever shown", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await requestTestXLM("not-an-address", "PUBLIC");

    expect(result.message).toMatch(/only available on Testnet/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls friendbot on testnet", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ hash: "abc123def456789" }, 200));

    const result = await requestTestXLM(VALID_G_ADDRESS, "TESTNET");

    expect(result.success).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toContain("friendbot.stellar.org");
  });
});
