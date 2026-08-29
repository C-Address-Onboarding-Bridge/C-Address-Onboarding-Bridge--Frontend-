// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import OnrampPage from "@/components/routes/onramp-page";

afterEach(cleanup);

// The onramp page renders provider names in two places: the selector grid
// (buttons with aria-pressed) and the "Supported Providers" sidebar (divs).
// We target buttons using aria-pressed to unambiguously target the selector.

function getSelectorButtons() {
  // Only the toggle buttons have aria-pressed attribute
  return screen
    .getAllByRole("button")
    .filter((btn) => btn.hasAttribute("aria-pressed"));
}

describe("OnrampPage — provider selector", () => {
  it("renders both Moonpay and Transak selector buttons with aria-pressed", () => {
    render(<OnrampPage />);
    const btns = getSelectorButtons();
    expect(btns.some((b) => /moonpay/i.test(b.textContent ?? ""))).toBe(true);
    expect(btns.some((b) => /transak/i.test(b.textContent ?? ""))).toBe(true);
  });

  it("Moonpay is selected by default (aria-pressed=true)", () => {
    render(<OnrampPage />);
    const btns = getSelectorButtons();
    const moonpay = btns.find((b) => /moonpay/i.test(b.textContent ?? ""))!;
    const transak = btns.find((b) => /transak/i.test(b.textContent ?? ""))!;
    expect(moonpay.getAttribute("aria-pressed")).toBe("true");
    expect(transak.getAttribute("aria-pressed")).toBe("false");
  });

  it("clicking Transak switches the selection", () => {
    render(<OnrampPage />);
    const btns = getSelectorButtons();
    const transakBtn = btns.find((b) => /transak/i.test(b.textContent ?? ""))!;
    fireEvent.click(transakBtn);

    const btns2 = getSelectorButtons();
    const moonpay2 = btns2.find((b) => /moonpay/i.test(b.textContent ?? ""))!;
    const transak2 = btns2.find((b) => /transak/i.test(b.textContent ?? ""))!;
    expect(transak2.getAttribute("aria-pressed")).toBe("true");
    expect(moonpay2.getAttribute("aria-pressed")).toBe("false");
  });

  it("only one provider is selected at a time", () => {
    render(<OnrampPage />);
    getSelectorButtons().find((b) => /transak/i.test(b.textContent ?? ""))!;
    fireEvent.click(getSelectorButtons().find((b) => /transak/i.test(b.textContent ?? ""))!);
    fireEvent.click(getSelectorButtons().find((b) => /moonpay/i.test(b.textContent ?? ""))!);

    const selected = getSelectorButtons().filter(
      (b) => b.getAttribute("aria-pressed") === "true"
    );
    expect(selected).toHaveLength(1);
    expect(/moonpay/i.test(selected[0].textContent ?? "")).toBe(true);
  });

  it("continue button label updates to match the selected provider", () => {
    render(<OnrampPage />);
    expect(screen.getByRole("button", { name: /continue with moonpay/i })).not.toBeNull();

    fireEvent.click(
      getSelectorButtons().find((b) => /transak/i.test(b.textContent ?? ""))!
    );
    expect(screen.getByRole("button", { name: /continue with transak/i })).not.toBeNull();
  });

  it("fee display in the estimated output section updates when switching providers", () => {
    render(<OnrampPage />);
    expect(screen.getByText(/fee \(4\.5%\)/i)).not.toBeNull();

    fireEvent.click(
      getSelectorButtons().find((b) => /transak/i.test(b.textContent ?? ""))!
    );
    expect(screen.getByText(/fee \(5%\)/i)).not.toBeNull();
  });
});
