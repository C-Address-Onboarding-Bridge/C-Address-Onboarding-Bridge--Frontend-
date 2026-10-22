import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HealthStatus } from "@/lib/api";

/**
 * StatusBanner takes no props: it reads `useHealthStatus()` (#842). These
 * tests drive it by mocking that hook, not by passing `status`/`message`.
 */
const hookState: { health: HealthStatus | null; isDegraded: boolean } = {
  health: null,
  isDegraded: false,
};

vi.mock("@/hooks/useHealthStatus", () => ({
  useHealthStatus: () => ({
    health: hookState.health,
    isDegraded: hookState.isDegraded,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

import { StatusBanner } from "../components/status-banner";

function health(status: HealthStatus["status"], services: HealthStatus["services"] = {}): HealthStatus {
  return { status, timestamp: "2026-01-01T00:00:00.000Z", services, circuitBreakers: {} };
}

function setHealth(status: HealthStatus | null, isDegraded: boolean) {
  hookState.health = status;
  hookState.isDegraded = isDegraded;
}

describe("StatusBanner", () => {
  beforeEach(() => setHealth(null, false));

  it("renders nothing when the service is healthy", () => {
    setHealth(health("healthy"), false);
    const { container } = render(<StatusBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing before the first health check resolves", () => {
    const { container } = render(<StatusBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the degraded services", () => {
    setHealth(health("degraded", { horizon: "degraded", soroban_rpc: "up" }), true);
    render(<StatusBanner />);
    expect(screen.getByText("Service Degradation")).toBeInTheDocument();
    expect(screen.getByText(/Service degradation detected: horizon\./)).toBeInTheDocument();
  });

  it("shows the outage message for an unhealthy status", () => {
    setHealth(health("unhealthy"), true);
    render(<StatusBanner />);
    expect(screen.getByText("Service Unavailable")).toBeInTheDocument();
    expect(screen.getByText(/currently unavailable/)).toBeInTheDocument();
  });

  it("hides the banner after it is dismissed", () => {
    setHealth(health("degraded", { horizon: "degraded" }), true);
    render(<StatusBanner />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("re-shows the banner when the severity worsens after dismissal (#711)", () => {
    setHealth(health("degraded", { horizon: "degraded" }), true);
    const { rerender } = render(<StatusBanner />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    setHealth(health("unhealthy"), true);
    rerender(<StatusBanner />);
    expect(screen.getByText("Service Unavailable")).toBeInTheDocument();
  });

  it("re-shows the banner when the message changes after dismissal (#711)", () => {
    setHealth(health("degraded", { horizon: "degraded" }), true);
    const { rerender } = render(<StatusBanner />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));

    setHealth(health("degraded", { horizon: "degraded", soroban_rpc: "degraded" }), true);
    rerender(<StatusBanner />);
    expect(screen.getByText(/horizon, soroban rpc/)).toBeInTheDocument();
  });

  it("uses a single consistent live-region politeness", () => {
    setHealth(health("unhealthy"), true);
    render(<StatusBanner />);
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
  });
});
