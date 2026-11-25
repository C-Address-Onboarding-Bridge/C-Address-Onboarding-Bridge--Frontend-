// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { AppProviders } from "@/components/AppProviders";
import { setInFlightTransaction } from "@/components/error-boundary";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Thrower(): React.ReactElement {
  throw new Error("boom");
}

describe("AppProviders error boundaries", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("links to the in-flight transaction when a child throws", () => {
    setInFlightTransaction({
      hash: "abc123",
      network: "TESTNET",
      from: "G1",
      to: "C1",
      amount: "10",
      asset: "XLM",
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <AppProviders>
          <Thrower />
        </AppProviders>
      );
    });
    const link = container.querySelector('[data-testid="in-flight-transaction-link"]');
    expect(link?.getAttribute("href")).toBe("/transactions/abc123?network=TESTNET");
    act(() => root.unmount());
    container.remove();
  });
});
