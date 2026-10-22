import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import BridgePage from "@/app/bridge/page";

type SimulateResult =
  | { ok: true; feeXlm: string; netXlm: string }
  | { ok: false; reason: string; message?: string };

function mockFetchOnce(simulate: SimulateResult) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/simulate")) {
      return new Response(JSON.stringify(simulate), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function goToReview() {
  const amountInput = await screen.findByLabelText(/amount/i);
  fireEvent.change(amountInput, { target: { value: "10" } });
  const reviewButton = screen.getByRole("button", { name: /review/i });
  fireEvent.click(reviewButton);
}

describe("bridge review simulation panel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders predicted fee and net amount on a successful simulation", async () => {
    mockFetchOnce({ ok: true, feeXlm: "0.0123", netXlm: "9.9877" });
    render(<BridgePage />);

    await goToReview();

    await waitFor(() => {
      expect(screen.getByText(/0\.0123/)).toBeInTheDocument();
    });
    expect(screen.getByText(/9\.9877/)).toBeInTheDocument();

    const confirm = screen.getByRole("button", { name: /confirm/i });
    expect(confirm).toBeEnabled();
  });

  it("shows a blocking failure message and disables Confirm", async () => {
    mockFetchOnce({
      ok: false,
      reason: "insufficient_balance",
      message: "Insufficient balance to cover the transfer and fee.",
    });
    render(<BridgePage />);

    await goToReview();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/insufficient balance/i);

    const confirm = screen.getByRole("button", { name: /confirm/i });
    expect(confirm).toBeDisabled();
  });

  it("treats simulation_unavailable as non-blocking and keeps Confirm enabled", async () => {
    mockFetchOnce({ ok: false, reason: "simulation_unavailable" });
    render(<BridgePage />);

    await goToReview();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/simulation/i);

    const confirm = screen.getByRole("button", { name: /confirm/i });
    expect(confirm).toBeEnabled();
  });
});
