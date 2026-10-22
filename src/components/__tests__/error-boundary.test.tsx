// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/errors", () => ({
  handleError: vi.fn(),
}));

import { handleError } from "@/lib/errors";
import { ErrorBoundary, IN_FLIGHT_TRANSACTION_KEY } from "../error-boundary";

function ThrowingChild({ error = new Error("Render failed") }: { error?: Error }): never {
  throw error;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("renders its children before an error occurs", () => {
    render(
      <ErrorBoundary>
        <p>Working page</p>
      </ErrorBoundary>
    );

    expect(screen.getByText("Working page")).toBeInTheDocument();
  });

  it("reports a render error and displays its recovery fallback", () => {
    const error = new Error("Render failed");
    const onError = vi.fn();

    render(
      <ErrorBoundary context="bridge" onError={onError}>
        <ThrowingChild error={error} />
      </ErrorBoundary>
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(handleError).toHaveBeenCalledWith(error, "bridge");
    expect(onError).toHaveBeenCalledWith(error, { componentStack: expect.any(String) });
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("passes the caught error to a custom fallback", () => {
    const error = new Error("Temporary failure");

    render(
      <ErrorBoundary fallback={(caughtError) => <p>Custom: {caughtError.message}</p>}>
        <ThrowingChild error={error} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Custom: Temporary failure")).toBeInTheDocument();
  });

  it("lets users retry rendering", () => {
    const error = new Error("Temporary failure");
    let shouldThrow = true;
    const onReset = vi.fn();
    function RecoverableChild() {
      if (shouldThrow) throw error;
      return <p>Recovered</p>;
    }

    render(
      <ErrorBoundary onReset={onReset}>
        <RecoverableChild />
      </ErrorBoundary>
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("Recovered")).toBeInTheDocument();
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("links to a submitted in-flight transaction after a crash", async () => {
    const transaction = {
      hash: "tx #1",
      network: "testnet",
      from: "sender",
      to: "recipient",
      amount: "10",
      asset: "XLM",
    };
    sessionStorage.setItem(IN_FLIGHT_TRANSACTION_KEY, JSON.stringify(transaction));

    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    );

    const link = await screen.findByTestId("in-flight-transaction-link");
    expect(link).toHaveAttribute("href", "/transactions/tx%20%231");
    expect(link).toHaveTextContent(transaction.hash);
  });
});
