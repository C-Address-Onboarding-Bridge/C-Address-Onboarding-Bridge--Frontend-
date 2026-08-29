// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, Root } from "react-dom/client";
import Footer from "@/components/footer";
import TransactionHistory from "@/components/transaction-history";
import CexPage from "@/components/routes/cex-page";
import type { BridgeTransactionData } from "@/lib/types";
import { accessibleName, auditAccessibility, summarizeViolations } from "./helpers/a11y";

/**
 * Accessibility coverage for the unit test suite. (#347)
 *
 * Two halves:
 *  1. the shared audit harness in helpers/a11y.ts is itself unit-tested against
 *     hand-built DOM fixtures, so a broken rule fails loudly instead of
 *     silently passing every component, and
 *  2. real components are rendered and audited end to end.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// `<Footer>` renders `PrefetchLink`, which calls `useRouter()` and throws
// "invariant expected app router to be mounted" outside a Next app tree.
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    push: vi.fn(),
    prefetch: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock("@/lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stellar")>();
  return {
    ...actual,
    getExplorerUrl: (_network: unknown, _type: unknown, id: string) => `https://stellar.expert/explorer/testnet/tx/${id}`,
  };
});

vi.mock("@/hooks/useCopyToClipboard", () => ({
  useCopyToClipboard: () => ({ status: "idle", copy: vi.fn(), reset: vi.fn() }),
}));

function fixture(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
}

describe("accessibleName", () => {
  it("prefers aria-label over text content", () => {
    const host = fixture('<button aria-label="Close dialog">×</button>');
    expect(accessibleName(host.querySelector("button")!)).toBe("Close dialog");
  });

  it("resolves aria-labelledby against the document", () => {
    const host = fixture('<span id="lbl">Connect wallet</span><button aria-labelledby="lbl"></button>');
    expect(accessibleName(host.querySelector("button")!)).toBe("Connect wallet");
  });

  it("falls back to text, then nested image alt, then title", () => {
    expect(accessibleName(fixture("<button>Send</button>").querySelector("button")!)).toBe("Send");
    expect(
      accessibleName(fixture('<button><img alt="Binance" src="/b.svg"></button>').querySelector("button")!),
    ).toBe("Binance");
    expect(accessibleName(fixture('<button title="More"></button>').querySelector("button")!)).toBe("More");
  });

  it("is empty for an unnamed control", () => {
    expect(accessibleName(fixture("<button></button>").querySelector("button")!)).toBe("");
  });
});

describe("auditAccessibility rules", () => {
  function rules(html: string): string[] {
    return auditAccessibility(fixture(html)).map((v) => v.rule);
  }

  it("flags images without an alt attribute but accepts alt=''", () => {
    expect(rules('<img src="/a.svg">')).toContain("image-alt");
    expect(rules('<img src="/a.svg" alt="">')).not.toContain("image-alt");
  });

  it("flags unnamed interactive elements", () => {
    expect(rules("<button></button>")).toContain("interactive-name");
    expect(rules('<a href="/bridge"></a>')).toContain("interactive-name");
    expect(rules('<button aria-label="Open menu"></button>')).not.toContain("interactive-name");
  });

  it("flags unlabelled form fields and accepts every labelling strategy", () => {
    expect(rules('<input type="text">')).toContain("form-label");
    expect(rules('<input type="text" aria-label="C-address">')).not.toContain("form-label");
    expect(rules('<label for="amt">Amount</label><input id="amt" type="text">')).not.toContain("form-label");
    expect(rules("<label>Amount<input type='text'></label>")).not.toContain("form-label");
    expect(rules('<input type="hidden" name="csrf">')).not.toContain("form-label");
  });

  it("flags positive tabindex but allows -1 and 0", () => {
    expect(rules('<div tabindex="3">x</div>')).toContain("positive-tabindex");
    expect(rules('<main tabindex="-1">x</main>')).not.toContain("positive-tabindex");
    expect(rules('<div tabindex="0">x</div>')).not.toContain("positive-tabindex");
  });

  it("flags focusable content inside aria-hidden", () => {
    expect(rules('<div aria-hidden="true"><button>Send</button></div>')).toContain("aria-hidden-focusable");
    expect(rules('<span aria-hidden="true">→</span>')).not.toContain("aria-hidden-focusable");
  });

  it("flags duplicate ids", () => {
    expect(rules('<div id="dup"></div><div id="dup"></div>')).toContain("duplicate-id");
    expect(rules('<div id="a"></div><div id="b"></div>')).not.toContain("duplicate-id");
  });

  it("flags skipped heading levels", () => {
    expect(rules("<h2>A</h2><h4>B</h4>")).toContain("heading-order");
    expect(rules("<h2>A</h2><h3>B</h3><h2>C</h2>")).not.toContain("heading-order");
  });

  it("flags target=_blank without a safe rel", () => {
    expect(rules('<a href="https://x.test" target="_blank">x</a>')).toContain("blank-target-rel");
    expect(rules('<a href="https://x.test" target="_blank" rel="noopener noreferrer">x</a>')).not.toContain(
      "blank-target-rel",
    );
  });

  it("reports nothing for a clean subtree", () => {
    expect(auditAccessibility(fixture('<h2>Bridge</h2><button aria-label="Connect">C</button>'))).toEqual([]);
  });
});

describe("rendered components pass the accessibility audit", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = "";
  });

  function render(element: React.ReactElement) {
    act(() => root.render(element));
    return container;
  }

  it("Footer", () => {
    const violations = auditAccessibility(render(<Footer />));
    expect(summarizeViolations(violations)).toEqual([]);
  });

  it("TransactionHistory (loading)", () => {
    const violations = auditAccessibility(
      render(<TransactionHistory transactions={[]} loading network="TESTNET" />),
    );
    expect(summarizeViolations(violations)).toEqual([]);
  });

  it("TransactionHistory (empty)", () => {
    const violations = auditAccessibility(
      render(<TransactionHistory transactions={[]} loading={false} network="TESTNET" />),
    );
    expect(summarizeViolations(violations)).toEqual([]);
  });

  it("TransactionHistory (populated, one row per status)", () => {
    const transactions: BridgeTransactionData[] = [
      {
        id: "1",
        fromAddress: "GABC",
        toAddress: "CABC",
        amount: "10",
        asset: "XLM",
        status: "confirmed",
        timestamp: 1_700_000_000_000,
        type: "g-to-c",
        hash: "abc123",
      },
      {
        id: "2",
        fromAddress: "GABC",
        toAddress: "CABC",
        amount: "5",
        asset: "USDC",
        status: "pending",
        timestamp: 1_700_000_100_000,
        type: "cex",
      },
      {
        id: "3",
        fromAddress: "GABC",
        toAddress: "CABC",
        amount: "1",
        asset: "USDC",
        status: "failed",
        timestamp: 1_700_000_200_000,
        type: "fiat",
      },
    ];

    const violations = auditAccessibility(
      render(
        <TransactionHistory
          transactions={transactions}
          loading={false}
          network="TESTNET"
          address="GABC"
        />,
      ),
    );
    expect(summarizeViolations(violations)).toEqual([]);
  });

  it("CexPage", () => {
    const violations = auditAccessibility(render(<CexPage />));
    expect(summarizeViolations(violations)).toEqual([]);
  });
});
