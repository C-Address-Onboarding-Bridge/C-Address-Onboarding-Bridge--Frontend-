// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement } from "react";
import { render, cleanup } from "@testing-library/react";
import { useWallet } from "../components/wallet-provider";

// The guard has to be reached through an actual render. Calling useWallet()
// directly from the test body throws React's "dispatcher is null" TypeError
// before useContext ever returns, so the assertion would pass on the wrong
// error — or, as it did here, fail while the guard itself was fine.
function Probe() {
  useWallet();
  return null;
}

describe("useWallet", () => {
  afterEach(cleanup);

  it("throws an actionable error when rendered outside of WalletProvider", () => {
    // React re-logs the render error to console.error; silence it so an
    // expected failure doesn't read as a real one in the test output.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      expect(() => render(createElement(Probe))).toThrow(
        "useWallet must be used within a WalletProvider"
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
