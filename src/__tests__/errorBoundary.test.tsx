// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import ErrorPage from "@/app/error";
import ErrorBoundary from "@/components/error-boundary";

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
  it("renders the error message from the Error object", () => {
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
    expect(container.textContent).not.toContain("may still be in flight");
    container.remove();
  });

  it("surfaces the recovery UI when an in-flight transaction is recorded", () => {
    sessionStorage.setItem("bridge:in-flight", JSON.stringify({ hash: "0xabc", at: Date.now() }));
    const container = renderBoundary();
    expect(container.textContent).toContain("may still be in flight");
    container.remove();
  });
});
