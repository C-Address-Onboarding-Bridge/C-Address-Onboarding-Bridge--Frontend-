// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ConfirmationPage from "@/app/confirm/[hash]/page";
import { generateMetadata } from "@/app/confirm/[hash]/layout";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("network=TESTNET"),
}));

const VALID_HASH = "a".repeat(64);

describe("Confirmation page status subtitle, share payload & metadata (#946)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders 'Transaction failed' and no 'confirmed' copy for a failed transaction", async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      share: shareMock,
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          hash: VALID_HASH,
          amount: "50.00",
          asset: "USDC",
          timestamp: 1700000000000,
          fromAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
          toAddress: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
          fee: "0.00001 XLM",
          status: "failed",
        }),
      })
    );

    await act(async () => {
      render(<ConfirmationPage params={Promise.resolve({ hash: VALID_HASH })} />);
    });

    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.getByText("Transaction failed")).toBeTruthy();
    expect(document.body.textContent ?? "").not.toMatch(/confirmed/i);

    await act(async () => {
      fireEvent.click(screen.getByText("Share"));
    });

    expect(shareMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Transaction Failed: 50.00 USDC",
      })
    );
  });

  it("uses neutral 'Transaction Details' metadata before status is known", async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ hash: VALID_HASH }) });
    expect(meta.title).toBe("Transaction Details | C-Address Bridge");
    expect(JSON.stringify(meta)).not.toMatch(/confirmed/i);
  });
});