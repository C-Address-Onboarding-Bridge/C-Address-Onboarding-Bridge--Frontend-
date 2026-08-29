// @vitest-environment jsdom
//
// Accessibility coverage for the app's notification surfaces — the transient
// status messages (clipboard feedback, fetch/validation errors, redirect
// confirmations, loading states) that are otherwise conveyed only by swapping
// icons, colors and inline text. Each test pins the mechanism that makes one of
// those changes perceivable to a screen reader, so a future refactor that drops
// a role or a live region fails here instead of silently regressing.
import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { StrKey } from "@stellar/stellar-sdk";
import LiveRegion from "@/components/live-region";
import TransactionHistory from "@/components/transaction-history";
import DashboardPage from "@/components/routes/dashboard-page";
import CexPage from "@/components/routes/cex-page";

const ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5V3VQ";
// A real contract StrKey with a valid checksum, encoded from fixed bytes rather
// than hardcoded, so isCAddress() accepts it for the right reason. (Keypair
// .random() is unusable here: its RNG shim does not work under jsdom.)
const VALID_C_ADDRESS = StrKey.encodeContract(Buffer.alloc(32, 7));

// Only the network calls are stubbed; isCAddress and friends stay real so the
// CEX validation path under test is the production one.
const getAccountBalances = vi.fn();
const fetchRecentTransactions = vi.fn();

vi.mock("@/lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stellar")>();
  return {
    ...actual,
    getAccountBalances: (...args: unknown[]) => getAccountBalances(...args),
    fetchRecentTransactions: (...args: unknown[]) => fetchRecentTransactions(...args),
    getExplorerUrl: (_network: unknown, _type: unknown, id: string) => `https://stellar.expert/explorer/testnet/tx/${id}`,
  };
});

vi.mock("@/hooks/useCopyToClipboard", () => ({
  useCopyToClipboard: () => ({ status: "idle", copy: vi.fn(), reset: vi.fn() }),
}));

const wallet = {
  isConnected: true,
  address: ADDRESS,
  network: "TESTNET" as const,
  networkStatus: "TESTNET" as const,
  walletNetworkName: "TESTNET",
  isNetworkSupported: true,
  connect: vi.fn(),
};

vi.mock("@/components/wallet-provider", () => ({
  useWallet: () => wallet,
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

/** Install a clipboard whose writeText either resolves or rejects. */
function stubClipboard(outcome: "success" | "failure") {
  const writeText = vi.fn(() =>
    outcome === "success" ? Promise.resolve() : Promise.reject(new Error("denied")),
  );
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
  return writeText;
}

/** Click and flush the click handler's promise chain inside act(). */
async function clickAndSettle(el: Element) {
  await act(async () => {
    fireEvent.click(el);
  });
}

/**
 * Text of the `<LiveRegion>` announcement region.
 *
 * Matched on `aria-atomic` as well as `aria-live`, which is what distinguishes a
 * `<LiveRegion>` from an ordinary polite region. Pages carry both: the avatar
 * control on the dashboard, for instance, has its own `aria-live` hint
 * paragraph, and a bare `[aria-live="polite"]` selector picked up whichever came
 * first in the DOM rather than the announcement under test.
 */
const politeText = (container: HTMLElement) =>
  container.querySelector('[aria-live="polite"][aria-atomic="true"]')?.textContent ?? null;

describe("LiveRegion", () => {
  afterEach(cleanup);

  it("renders a visually hidden atomic polite region by default", () => {
    const { container } = render(<LiveRegion message="Saved." />);
    const region = container.querySelector("[aria-live]") as HTMLElement;

    expect(region).not.toBeNull();
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.getAttribute("aria-atomic")).toBe("true");
    expect(region.className).toContain("sr-only");
    expect(region.textContent).toBe("Saved.");
  });

  it("honours an assertive politeness", () => {
    const { container } = render(<LiveRegion politeness="assertive" message="Failed." />);
    expect(container.querySelector("[aria-live]")?.getAttribute("aria-live")).toBe("assertive");
  });

  it("stays mounted while idle so the first announcement is not missed", () => {
    // An AT that registers a live region only on insertion must see it before
    // it has text; an empty region is the idle state, not an absent one.
    const { container, rerender } = render(<LiveRegion message="" />);
    const region = container.querySelector("[aria-live]");
    expect(region).not.toBeNull();
    expect(region?.textContent).toBe("");

    rerender(<LiveRegion message="Now announcing." />);
    expect(container.querySelector("[aria-live]")).toBe(region);
    expect(region?.textContent).toBe("Now announcing.");
  });
});

describe("Dashboard notifications", () => {
  beforeEach(() => {
    getAccountBalances.mockResolvedValue({ total: "100.0000000" });
    fetchRecentTransactions.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const renderDashboard = async () => {
    let result!: ReturnType<typeof render>;
    await act(async () => {
      result = render(<DashboardPage />);
    });
    return result;
  };

  it("names the copy button independently of its title attribute", async () => {
    stubClipboard("success");
    await renderDashboard();

    const button = screen.getByRole("button", { name: "Copy wallet address" });
    expect(button.getAttribute("title")).toBe("Copy address");
  });

  it("announces a successful address copy", async () => {
    const writeText = stubClipboard("success");
    const { container } = await renderDashboard();

    expect(politeText(container)).toBe("");

    await clickAndSettle(screen.getByRole("button", { name: "Copy wallet address" }));

    expect(writeText).toHaveBeenCalledWith(ADDRESS);
    expect(politeText(container)).toBe("Wallet address copied to clipboard.");
  });

  it("announces a failed address copy instead of reporting success", async () => {
    stubClipboard("failure");
    const { container } = await renderDashboard();

    await clickAndSettle(screen.getByRole("button", { name: "Copy wallet address" }));

    expect(politeText(container)).toBe("Copy failed. Check clipboard permissions and try again.");
  });

  it("announces a balance/activity fetch failure via an alert", async () => {
    getAccountBalances.mockRejectedValue(new Error("Horizon unreachable"));
    await renderDashboard();

    // The banner arrives asynchronously — role="alert" is what makes it audible.
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Horizon unreachable");
  });
});

describe("CEX page notifications", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const enterAddress = (value: string) => {
    fireEvent.change(screen.getByLabelText("Soroban C-address"), { target: { value } });
  };

  it("announces validation success, not only failure", () => {
    render(<CexPage />);

    enterAddress("not-a-c-address");
    expect(screen.getByRole("alert").textContent).toContain("Invalid C-address");

    enterAddress(VALID_C_ADDRESS);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Valid C-address");
  });

  it("announces a successful C-address copy", async () => {
    const writeText = stubClipboard("success");
    const { container } = render(<CexPage />);

    // Mounted with the card, before any copy is possible.
    expect(politeText(container)).toBe("");

    enterAddress(VALID_C_ADDRESS);
    await clickAndSettle(screen.getByRole("button", { name: "Copy C-address" }));

    expect(writeText).toHaveBeenCalledWith(VALID_C_ADDRESS);
    expect(politeText(container)).toBe("C-address copied to clipboard.");
  });

  it("announces a failed C-address copy", async () => {
    stubClipboard("failure");
    const { container } = render(<CexPage />);

    enterAddress(VALID_C_ADDRESS);
    await clickAndSettle(screen.getByRole("button", { name: "Copy C-address" }));

    expect(politeText(container)).toBe("Copy failed. Check clipboard permissions and try again.");
  });
});

describe("Onramp page notifications", () => {
  const originalOpen = window.open;

  afterEach(() => {
    cleanup();
    window.open = originalOpen;
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.clearAllMocks();
  });

  /**
   * The provider API keys are read at module scope, so the module has to be
   * re-imported after stubbing the env to exercise the configured path.
   */
  const loadOnramp = async (moonpayKey: string) => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_MOONPAY_API_KEY", moonpayKey);
    const mod = await import("@/components/routes/onramp-page");
    return mod.default;
  };

  const fillForm = () => {
    const [addressInput, amountInput] = screen.getAllByRole("textbox");
    fireEvent.change(addressInput, { target: { value: VALID_C_ADDRESS } });
    fireEvent.change(amountInput, { target: { value: "100.00" } });
  };

  it("announces a redirect failure via an alert", async () => {
    // No API key configured — the Continue click fails before opening a tab.
    const OnrampPage = await loadOnramp("");
    render(<OnrampPage />);
    fillForm();

    fireEvent.click(screen.getByRole("button", { name: /continue with moonpay/i }));

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("API key is not configured");
  });

  it("announces that a new tab was opened for checkout", async () => {
    const open = vi.fn();
    window.open = open as unknown as typeof window.open;

    const OnrampPage = await loadOnramp("test-moonpay-key");
    const { container } = render(<OnrampPage />);
    fillForm();

    expect(politeText(container)).toBe("");

    fireEvent.click(screen.getByRole("button", { name: /continue with moonpay/i }));

    expect(open).toHaveBeenCalled();
    // The form is replaced and focus does not move, so this announcement is the
    // only signal an AT user gets that checkout opened elsewhere.
    expect(politeText(container)).toBe(
      "Opened a new tab to complete your purchase with Moonpay.",
    );
  });
});

describe("Transaction history loading state", () => {
  afterEach(cleanup);

  it("exposes the spinner-only loading panel as a status with text", () => {
    render(<TransactionHistory transactions={[]} loading network="TESTNET" address={ADDRESS} />);

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Loading recent transactions");
  });

  it("drops the loading status once results arrive", () => {
    render(<TransactionHistory transactions={[]} loading={false} network="TESTNET" address={ADDRESS} />);

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText(/No transactions found/i)).not.toBeNull();
  });
});
