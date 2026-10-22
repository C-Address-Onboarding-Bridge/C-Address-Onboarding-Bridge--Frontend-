// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMainnetConfirmation } from "@/hooks/useMainnetConfirmation";
import { hasConfirmedMainnetThisSession } from "@/lib/mainnetConfirmation";
import type { StellarNetwork } from "@/lib/types";

function setup(network: StellarNetwork, recentlyChangedNetwork = false) {
  return renderHook(
    ({ net, recent }) => useMainnetConfirmation(net, recent),
    { initialProps: { net: network, recent: recentlyChangedNetwork } }
  );
}

beforeEach(() => window.sessionStorage.clear());
afterEach(() => window.sessionStorage.clear());

describe("useMainnetConfirmation (#759)", () => {
  it("asks before the first mainnet transaction when the app opened on mainnet", async () => {
    const { result } = setup("PUBLIC");

    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.request();
    });
    expect(result.current.prompt).toBe("session");

    act(() => result.current.answer(true));
    await expect(pending).resolves.toBe(true);
    expect(result.current.prompt).toBeNull();
    expect(hasConfirmedMainnetThisSession()).toBe(true);
  });

  it("does not ask again in the same session", async () => {
    const first = setup("PUBLIC");
    let pending!: Promise<boolean>;
    act(() => {
      pending = first.result.current.request();
    });
    act(() => first.result.current.answer(true));
    await pending;
    first.unmount();

    // A remount (new page visit) in the same session goes straight through.
    const { result } = setup("PUBLIC");
    await expect(result.current.request()).resolves.toBe(true);
    expect(result.current.prompt).toBeNull();
  });

  it("cancelling blocks the transaction and asks again next time", async () => {
    const { result } = setup("PUBLIC");
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.request();
    });
    act(() => result.current.answer(false));
    await expect(pending).resolves.toBe(false);
    expect(hasConfirmedMainnetThisSession()).toBe(false);

    act(() => {
      void result.current.request();
    });
    expect(result.current.prompt).toBe("session");
  });

  it("never asks on testnet", async () => {
    const { result } = setup("TESTNET", true);
    await expect(result.current.request()).resolves.toBe(true);
    expect(result.current.prompt).toBeNull();
  });

  it("warns after a network switch even when the session was already confirmed", async () => {
    const { result, rerender } = setup("PUBLIC");
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.request();
    });
    act(() => result.current.answer(true));
    await pending;

    rerender({ net: "PUBLIC", recent: true });
    act(() => {
      pending = result.current.request();
    });
    expect(result.current.prompt).toBe("network_switch");
    act(() => result.current.answer(true));
    await expect(pending).resolves.toBe(true);

    // Acknowledged: the same switch does not warn twice.
    await expect(result.current.request()).resolves.toBe(true);
  });

  it("cancels a superseded prompt and a prompt left open on unmount", async () => {
    const { result, unmount } = setup("PUBLIC");
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.request();
    });
    act(() => {
      second = result.current.request();
    });
    await expect(first).resolves.toBe(false);

    unmount();
    await expect(second).resolves.toBe(false);
    expect(hasConfirmedMainnetThisSession()).toBe(false);
  });
});
