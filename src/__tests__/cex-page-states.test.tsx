// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { Keypair, StrKey } from "@stellar/stellar-sdk";

/**
 * The three Step 3 states of /cex (#841). The #827 merge left this block as a
 * half-applied ternary, so the page failed to compile at all; each state below
 * is one branch of `!CEX_DEPOSIT_ADDRESS ? … : !addressValid ? … : …`.
 *
 * `isCAddress` is mocked with the SDK's own contract check so this test only
 * depends on the page, not on the rest of src/lib/stellar.ts.
 */
vi.mock("@/lib/stellar", () => ({
  isCAddress: (value: string) => StrKey.isValidContract(value),
}));

import CexPage from "@/components/routes/cex-page";
import { setLocale } from "@/lib/i18n";

const ENV_KEY = "NEXT_PUBLIC_CEX_BRIDGE_DEPOSIT_ADDRESS";
const originalDepositAddress = process.env[ENV_KEY];
const C_ADDRESS = StrKey.encodeContract(Keypair.random().rawPublicKey());
const DEPOSIT_ADDRESS = Keypair.random().publicKey();

async function enterAddress(value: string) {
  fireEvent.change(screen.getByLabelText(/soroban c-address/i), { target: { value } });
}

beforeEach(() => setLocale("en"));

afterEach(() => {
  cleanup();
  if (originalDepositAddress === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalDepositAddress;
});

describe("CexPage Step 3 states (#841)", () => {
  it("unset env var: shows the not-configured notice and no deposit details", async () => {
    delete process.env[ENV_KEY];
    render(<CexPage />);
    await enterAddress(C_ADDRESS);
    await waitFor(() => expect(screen.getByText("Valid C-address")).not.toBeNull());

    expect(screen.getByText("Bridge deposit address not yet configured")).not.toBeNull();
    expect(screen.queryByLabelText(/copy deposit address/i)).toBeNull();
    expect(screen.queryByLabelText(/copy memo/i)).toBeNull();
  });

  it("env var set, invalid address: prompts for a valid C-address", async () => {
    process.env[ENV_KEY] = DEPOSIT_ADDRESS;
    render(<CexPage />);
    await enterAddress(DEPOSIT_ADDRESS); // a G-address is not a C-address
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/invalid c-address/i));

    expect(screen.getByText(/enter a valid c-address above to get your deposit address/i)).not.toBeNull();
    expect(screen.queryByText("Bridge deposit address not yet configured")).toBeNull();
    expect(screen.queryByLabelText(/copy deposit address/i)).toBeNull();
  });

  it("env var set, valid address: shows the deposit address, memo and warning", async () => {
    process.env[ENV_KEY] = DEPOSIT_ADDRESS;
    render(<CexPage />);
    await enterAddress(C_ADDRESS);
    await waitFor(() => expect(screen.getByText(DEPOSIT_ADDRESS)).not.toBeNull());

    expect(screen.getByText(`bridge:binance:${C_ADDRESS.slice(-8)}`)).not.toBeNull();
    expect(screen.getByText(/must include the memo/i)).not.toBeNull();
    expect(screen.getByLabelText(/copy deposit address/i)).not.toBeNull();
    expect(screen.queryByText("Bridge deposit address not yet configured")).toBeNull();
  });

  it("fills {name} placeholders instead of rendering them literally", () => {
    render(<CexPage />);
    expect(screen.getByText("3. Withdrawal Details for Binance")).not.toBeNull();
    expect(screen.queryByText(/\{name\}|\{amount\}/)).toBeNull();
  });
});
