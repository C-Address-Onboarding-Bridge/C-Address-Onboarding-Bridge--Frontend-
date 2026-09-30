// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import CexPage from "@/components/routes/cex-page";
import { CEX_LIST } from "@/lib/types";
import { setLocale, t } from "@/lib/i18n";

afterEach(() => {
  cleanup();
  setLocale("en");
});

beforeEach(() => {
  setLocale("en");
});

describe("CexPage — CEX exchange selector", () => {
  it("renders all three CEX options", () => {
    render(<CexPage />);
    for (const cex of CEX_LIST) {
      // CEX names appear in both the button and the sidebar; use getAllByText
      expect(screen.getAllByText(cex.name).length).toBeGreaterThan(0);
    }
  });

  it("first CEX option (Binance) is selected by default", () => {
    render(<CexPage />);
    const binanceBtn = screen.getByRole("button", { name: /binance/i });
    expect(binanceBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("clicking a different CEX switches the selection", () => {
    render(<CexPage />);
    const coinbaseBtn = screen.getByRole("button", { name: /coinbase/i });
    fireEvent.click(coinbaseBtn);
    expect(coinbaseBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("only one CEX option has aria-pressed=true at a time", () => {
    render(<CexPage />);
    const krakenBtn = screen.getByRole("button", { name: /kraken/i });
    fireEvent.click(krakenBtn);

    const pressedButtons = CEX_LIST.map((cex) =>
      screen.getByRole("button", { name: new RegExp(cex.name, "i") })
    ).filter((btn) => btn.getAttribute("aria-pressed") === "true");

    expect(pressedButtons).toHaveLength(1);
    expect(pressedButtons[0]).toBe(krakenBtn);
  });

  it("sidebar Exchange Details updates when a different CEX is selected", () => {
    render(<CexPage />);
    fireEvent.click(screen.getByRole("button", { name: /coinbase/i }));

    const coinbase = CEX_LIST.find((c) => c.name === "Coinbase")!;
    expect(screen.getByText(coinbase.minWithdrawal)).not.toBeNull();
    expect(screen.getByText(coinbase.fee)).not.toBeNull();
  });

  it("external withdrawal link points to the selected CEX", () => {
    render(<CexPage />);
    fireEvent.click(screen.getByRole("button", { name: /kraken/i }));
    const kraken = CEX_LIST.find((c) => c.name === "Kraken")!;
    const link = screen.getByRole("link", { name: /open kraken withdrawal/i });
    expect(link.getAttribute("href")).toBe(kraken.withdrawalUrl);
  });

  it("renders translated strings in a non-English locale", () => {
    setLocale("es");
    render(<CexPage />);

    // The page heading must come from the i18n catalog, not hard-coded English.
    const heading = t("cex.title");
    expect(heading).not.toBe("cex.title");
    expect(screen.getByText(heading)).not.toBeNull();

    // The English heading should no longer be present once translated.
    expect(screen.queryByText("CEX Exchange")).toBeNull();
  });
});
