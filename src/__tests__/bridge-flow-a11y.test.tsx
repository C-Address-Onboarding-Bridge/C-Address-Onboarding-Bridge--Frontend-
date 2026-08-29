// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BridgePage from "@/app/bridge/page";
import { useStepTransition } from "@/hooks/useStepTransition";
import { auditAccessibility } from "./helpers/a11y";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/components/wallet-provider", () => ({
  useWallet: () => ({
    isConnected: true,
    address: "GABCDEF1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCD",
    network: "TESTNET",
    networkStatus: "TESTNET",
    walletNetworkName: "Testnet",
    isNetworkSupported: true,
    connect: vi.fn(),
  }),
}));

// src/lib/stellar ships stubbed (throwing) function bodies; provide minimal
// pure implementations so the page can render under test. (#476)
vi.mock("@/hooks/useDebounce", () => ({
  useDebounce: (value: unknown) => value,
}));

vi.mock("@/lib/stellar", () => {
  const isValidStellarAddress = (a: string) => /^G[A-Z0-9]{55}$/.test(a);
  const isCAddress = (a: string) => /^C[A-Z0-9]{55}$/.test(a);
  return {
    isValidStellarAddress,
    isCAddress,
    isValidStellarAmount: (a: string) => /^\d+(\.\d{1,7})?$/.test(a),
    isGAddress: (a: string) => /^G[A-Z0-9]{55}$/.test(a),
    formatNetworkLabel: () => "Testnet",
    bridgeViaContract: vi.fn(),
    getExplorerUrl: () => "https://stellar.expert",
    getAccountBalances: vi.fn().mockResolvedValue(null),
    getAccountMinimumBalance: () => "1",
    getEstimatedFeeXLM: vi.fn().mockResolvedValue("~0.00001 XLM"),
    toSafeErrorMessage: (_e: unknown, fallback: string) => fallback,
  };
});

describe("Bridge flow — accessibility (#476)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("has no static accessibility violations on the form step", () => {
    const { container } = render(<BridgePage />);
    expect(auditAccessibility(container)).toEqual([]);
  });

  it("exposes a focusable heading for the active step", () => {
    const { container } = render(<BridgePage />);
    const heading = container.querySelector("#step-form-heading");
    expect(heading).not.toBeNull();
    expect(heading?.tagName).toBe("H2");
    expect(heading?.getAttribute("tabindex")).toBe("-1");
  });

  it("announces and focuses step changes", async () => {
    function Harness({ step }: { step: string }) {
      const { headingRef, announcement } = useStepTransition(step);
      return (
        <div>
          <h2 ref={headingRef} tabIndex={-1} data-testid="heading">
            Heading
          </h2>
          <div data-testid="announcement">{announcement}</div>
        </div>
      );
    }

    const { rerender } = render(<Harness step="form" />);

    await act(async () => {
      rerender(<Harness step="review" />);
    });

    const heading = screen.getByTestId("heading");
    expect(document.activeElement).toBe(heading);
    expect(screen.getByTestId("announcement").textContent).toContain("Review transaction");
  });

  it("links validation errors to their input via aria-describedby", async () => {
    const { container } = render(<BridgePage />);
    const input = container.querySelector("#to-address") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "NOT-A-CADDRESS" } });

    await waitFor(() => {
      expect(input.getAttribute("aria-invalid")).toBe("true");
    });
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const error = container.querySelector(`#${describedBy}`);
    expect(error).not.toBeNull();
    expect(error?.getAttribute("role")).toBe("alert");
    expect(error?.textContent).toMatch(/Invalid C-address/i);
  });

  it("renders live regions for screen-reader announcements", () => {
    const { container } = render(<BridgePage />);
    const liveRegions = container.querySelectorAll('[aria-live]');
    // polite (tx status) + assertive (tx errors) + polite (step changes)
    expect(liveRegions.length).toBeGreaterThanOrEqual(3);
  });
});
