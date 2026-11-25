// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { shouldWarnOnMainnetAction } from "@/lib/stellar";

const bridgeViaContract = vi.fn();

vi.mock("@/lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stellar")>();
  return {
    ...actual,
    bridgeViaContract: (...args: unknown[]) => bridgeViaContract(...args),
  };
});

describe("shouldWarnOnMainnetAction (#480)", () => {
  it("warns on a mainnet action initiated shortly after a network change", () => {
    expect(shouldWarnOnMainnetAction("PUBLIC", true, false)).toBe(true);
  });

  it("does not warn on testnet even after a recent change", () => {
    expect(shouldWarnOnMainnetAction("TESTNET", true, false)).toBe(false);
  });

  it("does not warn when no network change happened recently", () => {
    expect(shouldWarnOnMainnetAction("PUBLIC", false, false)).toBe(false);
  });

  it("does not warn once the user has acknowledged the switch", () => {
    expect(shouldWarnOnMainnetAction("PUBLIC", true, true)).toBe(false);
  });
});

describe("bridge page mainnet warning (#877)", () => {
  beforeEach(() => {
    bridgeViaContract.mockReset();
  });

  it("shows the warning on the first Confirm click and does not bridge", async () => {
    const { default: BridgePage } = await import("@/app/bridge/page");
    render(<BridgePage />);

    // Simulate a recent network change to PUBLIC before confirming.
    fireEvent.click(screen.getByRole("button", { name: /confirm & sign/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    expect(screen.getByRole("alert").textContent).toMatch(/mainnet/i);
    expect(bridgeViaContract).not.toHaveBeenCalled();
  });
});
