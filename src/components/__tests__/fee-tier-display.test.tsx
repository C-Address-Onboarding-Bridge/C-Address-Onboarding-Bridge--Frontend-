// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import FeeTierDisplay from "../fee-tier-display";
import type { FeeTier, FeeTierStatus } from "@/lib/feeTiers";

/**
 * Unit tests for FeeTierDisplay (#468), covering the three lock/tier states
 * the issue calls out:
 *  - top tier (max discount, no "next tier")
 *  - an intermediate tier (current tier + progress toward next)
 *  - no tiers configured at all (display hidden entirely)
 */

const BASE: FeeTier = { name: "Base", volumeThreshold: 0, feeRate: 0.005 };
const SILVER: FeeTier = { name: "Silver", volumeThreshold: 1000, feeRate: 0.003 };
const GOLD: FeeTier = { name: "Gold", volumeThreshold: 10000, feeRate: 0.001 };

const intermediateStatus: FeeTierStatus = {
  currentVolume: 4000,
  currentTier: SILVER,
  nextTier: GOLD,
  tiers: [BASE, SILVER, GOLD],
};

const topStatus: FeeTierStatus = {
  currentVolume: 15000,
  currentTier: GOLD,
  nextTier: null,
  tiers: [BASE, SILVER, GOLD],
};

afterEach(() => {
  cleanup();
});

describe("FeeTierDisplay — no tiers configured", () => {
  it("renders nothing for a null status", () => {
    const { container } = render(<FeeTierDisplay status={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for an empty tiers array (API/contract returned no tier data)", () => {
    const { container } = render(
      <FeeTierDisplay status={{ currentVolume: 0, currentTier: BASE, nextTier: null, tiers: [] }} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("FeeTierDisplay — intermediate tier", () => {
  it("shows the current tier name and effective rate", () => {
    render(<FeeTierDisplay status={intermediateStatus} />);
    expect(screen.getByTestId("current-tier-name")).toHaveTextContent("Silver tier");
    expect(screen.getByTestId("current-tier-rate")).toHaveTextContent("0.30%");
  });

  it("shows progress toward the next tier, not the top-tier message", () => {
    render(<FeeTierDisplay status={intermediateStatus} />);
    expect(screen.getByTestId("tier-progress")).toBeInTheDocument();
    expect(screen.queryByTestId("top-tier-message")).not.toBeInTheDocument();
    expect(screen.getByText(/4,000 \/ 10,000 volume/)).toBeInTheDocument();
    expect(screen.getByText(/Next: Gold/)).toBeInTheDocument();
  });

  it("renders the progress bar with the correct percentage", () => {
    render(<FeeTierDisplay status={intermediateStatus} />);
    const bar = screen.getByRole("progressbar");
    // (4000 - 1000) / (10000 - 1000) = 33.33%
    expect(bar).toHaveAttribute("aria-valuenow", "33");
  });

  it("quotes the fee for a given amount at the current (discounted) rate, not a flat rate", () => {
    render(<FeeTierDisplay status={intermediateStatus} amount={1000} asset="XLM" />);
    // 1000 * 0.003 (Silver) = 3, not 1000 * 0.005 (Base)
    expect(screen.getByTestId("tiered-fee-quote")).toHaveTextContent("3.0000000 XLM");
  });
});

describe("FeeTierDisplay — top tier (max discount, no next tier)", () => {
  it("shows the top-tier message instead of a progress bar", () => {
    render(<FeeTierDisplay status={topStatus} />);
    expect(screen.getByTestId("top-tier-message")).toBeInTheDocument();
    expect(screen.queryByTestId("tier-progress")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("still shows the current tier name and rate", () => {
    render(<FeeTierDisplay status={topStatus} />);
    expect(screen.getByTestId("current-tier-name")).toHaveTextContent("Gold tier");
    expect(screen.getByTestId("current-tier-rate")).toHaveTextContent("0.10%");
  });

  it("quotes the fee at the top tier's rate", () => {
    render(<FeeTierDisplay status={topStatus} amount={1000} asset="XLM" />);
    expect(screen.getByTestId("tiered-fee-quote")).toHaveTextContent("1.0000000 XLM");
  });
});

describe("FeeTierDisplay — tier breakdown popover", () => {
  it("is closed by default and opens on click", () => {
    render(<FeeTierDisplay status={intermediateStatus} />);
    expect(screen.queryByTestId("tier-info-panel")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("tier-info-button"));

    const panel = screen.getByTestId("tier-info-panel");
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent("Base");
    expect(panel).toHaveTextContent("Silver");
    expect(panel).toHaveTextContent("Gold");
  });

  it("closes on Escape", () => {
    render(<FeeTierDisplay status={intermediateStatus} />);
    fireEvent.click(screen.getByTestId("tier-info-button"));
    expect(screen.getByTestId("tier-info-panel")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByTestId("tier-info-panel")).not.toBeInTheDocument();
  });

  it("closes on an outside click", () => {
    render(
      <div>
        <div data-testid="outside">outside</div>
        <FeeTierDisplay status={intermediateStatus} />
      </div>
    );
    fireEvent.click(screen.getByTestId("tier-info-button"));
    expect(screen.getByTestId("tier-info-panel")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId("outside"));

    expect(screen.queryByTestId("tier-info-panel")).not.toBeInTheDocument();
  });
});
