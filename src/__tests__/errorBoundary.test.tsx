// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import * as errorsModule from "@/lib/errors";
import ErrorPage from "@/app/error";
import ErrorBoundary, { IN_FLIGHT_TRANSACTION_KEY } from "@/components/error-boundary";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderError(error: Error & { digest?: string }, reset: () => void): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<ErrorPage error={error} reset={reset} />);
  });
  return container;
}

describe("Error page (src/app/error.tsx)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders a short user-safe error message from the Error object", () => {
    const reset = vi.fn();
    const container = renderError(Object.assign(new Error("Something exploded"), {}), reset);
    expect(container.textContent).toContain("Something exploded");
    container.remove();
  });

  it("falls back to the default message when error.message is empty", () => {
    const reset = vi.fn();
    const err = Object.assign(new Error(""), {});
    const container = renderError(err, reset);
    expect(container.textContent).toContain("An unexpected error occurred");
    container.remove();
  });

  it("replaces raw JSON or >200-char error payloads with the safe fallback text (#999)", () => {
    const reset = vi.fn();

    const jsonErr = Object.assign(new Error('{"status":500,"extras":{"result_codes":"tx_failed"}}'), {});
    const jsonContainer = renderError(jsonErr, reset);
    expect(jsonContainer.textContent).toContain("An unexpected error occurred. Please try again.");
    expect(jsonContainer.textContent).not.toContain("result_codes");
    jsonContainer.remove();

    const longErr = Object.assign(new Error("x".repeat(300)), {});
    const longContainer = renderError(longErr, reset);
    expect(longContainer.textContent).toContain("An unexpected error occurred. Please try again.");
    expect(longContainer.textContent).not.toContain("x".repeat(50));
    longContainer.remove();
  });

  it("reports the error via handleError and surfaces the in-flight transaction link from sessionStorage (#999)", () => {
    const handleErrorSpy = vi.spyOn(errorsModule, "handleError");
    const txHash = "b".repeat(64);
    sessionStorage.setItem(
      IN_FLIGHT_TRANSACTION_KEY,
      JSON.stringify({
        hash: txHash,
        network: "TESTNET",
        from: "GFROM",
        to: "CTO",
        amount: "10",
        asset: "XLM",
      }),
    );

    const reset = vi.fn();
    const err = Object.assign(new Error("Page render crash"), { digest: "digest-42" });
    const container = renderError(err, reset);

    expect(handleErrorSpy).toHaveBeenCalledWith(err, "app-error:digest-42");

    const link = container.querySelector('[data-testid="in-flight-transaction-link"]') as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe(`/transactions/${txHash}?network=TESTNET`);
    expect(link!.textContent).toContain(txHash);
    container.remove();
  });

  it("renders targeted wallet messaging for wallet errors (#999)", () => {
    const reset = vi.fn();
    const err = Object.assign(new Error("Freighter not detected"), {});
    const container = renderError(err, reset);
    expect(container.textContent).toContain("Wallet connection issue");
    container.remove();
  });

  it("renders a Try Again button that calls reset on click", () => {
    const reset = vi.fn();
    const container = renderError(Object.assign(new Error("Oops"), {}), reset);

    const button = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Try Again")
    );
    expect(button).toBeDefined();

    act(() => { button!.click(); });
    expect(reset).toHaveBeenCalledTimes(1);
    container.remove();
  });

  it("handles an error with a digest property without crashing", () => {
    const reset = vi.fn();
    const err = Object.assign(new Error("Digest error"), { digest: "abc123" });
    const container = renderError(err, reset);
    expect(container.textContent).toContain("Digest error");
    container.remove();
  });

  it("renders the heading 'Something went wrong'", () => {
    const reset = vi.fn();
    const container = renderError(Object.assign(new Error("test"), {}), reset);
    expect(container.textContent).toContain("Something went wrong");
    container.remove();
  });
});

function Boom(): React.ReactElement {
  throw new Error("bridge crashed");
}

function renderBoundary(): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  act(() => {
    root.render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
  });
  spy.mockRestore();
  return container;
}

describe("ErrorBoundary in-flight recovery", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("does not show the in-flight hint when no transaction is recorded", () => {
    const container = renderBoundary();
    expect(container.textContent).not.toContain("A transaction was already submitted");
    container.remove();
  });

  it("surfaces the recovery UI when an in-flight transaction is recorded", () => {
    sessionStorage.setItem("bridge:in-flight", JSON.stringify({ hash: "0xabc", at: Date.now() }));
    const container = renderBoundary();
    expect(container.textContent).toContain("A transaction was already submitted");
    container.remove();
  });
});