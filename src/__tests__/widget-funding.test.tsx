// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const bridgeViaContractMock = vi.fn();
const connectWalletMock = vi.fn();
const postWidgetMessageMock = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/stellar", () => ({
  bridgeViaContract: (...args: unknown[]) => bridgeViaContractMock(...args),
  connectWallet: (...args: unknown[]) => connectWalletMock(...args),
  getEstimatedFeeXLM: vi.fn().mockResolvedValue("~0.00001 XLM"),
  getExplorerUrl: vi.fn().mockReturnValue("https://stellar.expert/explorer/testnet/tx/tx_123"),
  isValidStellarAmount: vi.fn().mockReturnValue(true),
  toSafeErrorMessage: vi.fn((_err: unknown, fallback: string) => fallback),
}));

vi.mock("@/lib/widget", () => ({
  WIDGET_MESSAGE_SOURCE: "caddress-widget",
  getAllowedEmbedderOrigins: vi.fn().mockReturnValue(["https://host.example.com"]),
  isTrustedParentOrigin: vi.fn().mockReturnValue(true),
  postWidgetMessage: (...args: unknown[]) => postWidgetMessageMock(...args),
  parseWidgetConfig: vi.fn().mockReturnValue({
    ok: true,
    config: {
      address: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H",
      asset: "XLM",
      amount: "25",
      theme: "light",
      network: "TESTNET",
      parentOrigin: "https://host.example.com",
    },
  }),
}));

import WidgetPage from "@/app/widget/page";

describe("WidgetPage funding submission (#1000)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    class ResizeObserverStub {
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  });

  it("calls bridgeViaContract and posts a success message to the parent window", async () => {
    const senderAddress = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
    const destinationAddress = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
    connectWalletMock.mockResolvedValue(senderAddress);
    bridgeViaContractMock.mockResolvedValue({ hash: "tx_abc123" });

    render(<WidgetPage />);

    const connectButton = await screen.findByRole("button", { name: /connect wallet/i });
    fireEvent.click(connectButton);

    const sendButton = await screen.findByRole("button", { name: /^send$/i });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(bridgeViaContractMock).toHaveBeenCalledWith(
        senderAddress,
        destinationAddress,
        "25",
        "XLM",
        "TESTNET",
        expect.any(Function),
      );
    });

    expect(await screen.findByText("Payment sent")).toBeTruthy();
    expect(postWidgetMessageMock).toHaveBeenCalledWith(
      window.parent,
      {
        source: "caddress-widget",
        type: "success",
        txHash: "tx_abc123",
        amount: "25",
        asset: "XLM",
      },
      "https://host.example.com",
    );
  });
});