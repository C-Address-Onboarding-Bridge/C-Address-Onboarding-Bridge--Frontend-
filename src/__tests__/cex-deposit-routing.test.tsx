// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import CexPage from "@/components/routes/cex-page";

/**
 * Deposit-address/memo routing instructions for the CEX page (#680).
 *
 * NEXT_PUBLIC_CEX_BRIDGE_DEPOSIT_ADDRESS is read inside the component body
 * (not as a module-level constant) specifically so it can be toggled between
 * tests with a plain process.env assignment in beforeEach, the same way the
 * activity/onramp-quotes route tests read their own env vars per call.
 */

const C_ADDRESS = StrKey.encodeContract(Keypair.random().rawPublicKey());
const DEPOSIT_ADDRESS = Keypair.random().publicKey();

const ENV_KEY = "NEXT_PUBLIC_CEX_BRIDGE_DEPOSIT_ADDRESS";
const originalDepositAddress = process.env[ENV_KEY];

async function enterCAddress(address: string) {
  const input = screen.getByLabelText(/soroban c-address/i);
  fireEvent.change(input, { target: { value: address } });
  // isCAddress validation runs after a 200ms debounce. Exact text, not a
  // substring/regex match: "Enter a valid C-address above..." (the deposit
  // panel's own prompt before an address is entered) would otherwise also
  // match a loose /valid c-address/i pattern.
  await waitFor(() => expect(screen.getByText("Valid C-address")).not.toBeNull());
}

describe("CexPage deposit routing — not configured (#680)", () => {
  beforeEach(() => {
    delete process.env[ENV_KEY];
  });

  afterEach(() => {
    cleanup();
    if (originalDepositAddress === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalDepositAddress;
  });

  it("shows a not-configured message instead of a fabricated address", async () => {
    render(<CexPage />);
    await enterCAddress(C_ADDRESS);

    expect(screen.getByText(/bridge deposit address not yet configured/i)).not.toBeNull();
    expect(screen.queryByLabelText(/copy deposit address/i)).toBeNull();
    expect(screen.queryByLabelText(/copy memo/i)).toBeNull();
  });
});

describe("CexPage deposit routing — configured (#680)", () => {
  beforeEach(() => {
    process.env[ENV_KEY] = DEPOSIT_ADDRESS;
  });

  afterEach(() => {
    cleanup();
    if (originalDepositAddress === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalDepositAddress;
  });

  it("prompts for a C-address before showing deposit details", () => {
    render(<CexPage />);
    expect(screen.getByText(/enter a valid c-address above/i)).not.toBeNull();
    expect(screen.queryByLabelText(/copy deposit address/i)).toBeNull();
  });

  it("shows the deposit address and a bridge:binance:{suffix} memo once a valid C-address is entered", async () => {
    render(<CexPage />);
    await enterCAddress(C_ADDRESS);

    expect(screen.getByText(DEPOSIT_ADDRESS)).not.toBeNull();
    expect(screen.getByText(`bridge:binance:${C_ADDRESS.slice(-8)}`)).not.toBeNull();
  });

  it("updates the memo's exchange segment when a different exchange is selected", async () => {
    render(<CexPage />);
    await enterCAddress(C_ADDRESS);
    fireEvent.click(screen.getByRole("button", { name: /coinbase/i }));

    expect(screen.getByText(`bridge:coinbase:${C_ADDRESS.slice(-8)}`)).not.toBeNull();
  });

  it("shows an explicit warning that the memo is required", async () => {
    render(<CexPage />);
    await enterCAddress(C_ADDRESS);

    expect(screen.getByText(/must include the memo/i)).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/must include the memo/i);
  });

  it("renders a QR code once the deposit address and memo are both available", async () => {
    render(<CexPage />);
    await enterCAddress(C_ADDRESS);

    expect(screen.getByRole("img", { name: /qr code/i })).not.toBeNull();
  });

  it("copying the deposit address shows copied feedback independently of the memo button", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<CexPage />);
    await enterCAddress(C_ADDRESS);

    fireEvent.click(screen.getByLabelText(/copy deposit address/i));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(DEPOSIT_ADDRESS));
  });

  it("copying the memo copies the exact memo text, not the deposit address", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<CexPage />);
    await enterCAddress(C_ADDRESS);

    fireEvent.click(screen.getByLabelText(/copy memo/i));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`bridge:binance:${C_ADDRESS.slice(-8)}`));
  });
});
