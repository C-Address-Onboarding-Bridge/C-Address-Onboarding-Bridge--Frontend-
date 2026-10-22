// @vitest-environment jsdom
import React from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Keypair } from "@stellar/stellar-sdk";
import AddressBookPage from "@/components/routes/address-book-page";

/**
 * #847: the page ended in a truncation placeholder after the Saved
 * Recipients section, so it did not compile and the `notice` set by every
 * handler was never announced. The tail (LiveRegion and closing tags) is
 * restored.
 */

const ADDRESS = Keypair.random().publicKey();
const source = readFileSync(
  path.join(process.cwd(), "src/components/routes/address-book-page.tsx"),
  "utf8"
);

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe("AddressBookPage tail (#847)", () => {
  it("contains no truncation placeholder and ends with the component", () => {
    expect(source).not.toMatch(/truncated \d+ chars/);
    expect(source.trimEnd().endsWith("}")).toBe(true);
    expect(source).toContain("<LiveRegion message={notice} />");
  });

  it("announces the handler's notice in a polite live region", async () => {
    const { container } = render(<AddressBookPage />);

    fireEvent.change(screen.getByTestId("recipient-label-input"), { target: { value: "Alice" } });
    fireEvent.change(screen.getByTestId("recipient-address-input"), { target: { value: ADDRESS } });
    fireEvent.click(screen.getByTestId("add-recipient-button"));

    await waitFor(() => {
      const region = container.querySelector('[aria-live="polite"]');
      expect(region).toHaveTextContent('Saved "Alice".');
    });
  });

  it("renders the list section inside the page container", () => {
    render(<AddressBookPage />);
    const list = screen.getByRole("heading", { name: /Saved Recipients/ });
    expect(list.closest("section")?.parentElement?.className).toContain("max-w-4xl");
  });
});
