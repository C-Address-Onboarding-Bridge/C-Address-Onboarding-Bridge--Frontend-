// @vitest-environment node
import React from "react";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { AddressForm } from "../AddressForm";
import AddressBookPage from "../routes/address-book-page";

/**
 * Component-level SSR tests (#466).
 *
 * `renderToString` runs in vitest's `node` environment, where `window` and
 * `localStorage` are genuinely undefined — the same condition Next.js's
 * server render sees — rather than jsdom's stand-ins. Both components read
 * the address book via `useEffect` (see `src/lib/addressBook.ts`'s SSR
 * guard), which SSR never runs, so this also confirms neither component
 * reaches into storage during the render pass itself.
 */
describe("Address book — SSR rendering (no window)", () => {
  it("has no window in this environment", () => {
    expect(typeof window).toBe("undefined");
  });

  it("renders AddressForm to a string without throwing", () => {
    expect(() => renderToString(<AddressForm onSubmit={() => {}} />)).not.toThrow();
    const html = renderToString(<AddressForm onSubmit={() => {}} />);
    expect(html).toContain("address-form");
  });

  it("renders AddressBookPage to a string without throwing", () => {
    expect(() => renderToString(<AddressBookPage />)).not.toThrow();
    const html = renderToString(<AddressBookPage />);
    expect(html).toContain("Address Book");
  });
});
