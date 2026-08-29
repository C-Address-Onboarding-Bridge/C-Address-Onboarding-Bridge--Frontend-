// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Keypair } from "@stellar/stellar-sdk";
import AddressBookPage from "@/components/routes/address-book-page";
import { addressBookStorageKey, saveRecipient } from "@/lib/addressBook";

/**
 * Unit tests for the Address Book page (#466).
 *
 * Covers add/edit/delete, the export/import round trip, and — the two cases
 * the issue calls out specifically — a corrupted stored entry not crashing
 * the page, and a malformed import file being surfaced rather than thrown.
 * Pure storage/validation rules live in `src/lib/__tests__/addressBook.test.ts`.
 */

const VALID_ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
// A second, genuinely checksum-valid address — hand-writing one is not
// possible since the checksum is a real CRC16 over the payload bytes.
const VALID_ADDRESS_2 = Keypair.random().publicKey();

describe("AddressBookPage (#466)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows an empty state with no saved recipients", () => {
    render(<AddressBookPage />);
    expect(screen.getByText("No saved recipients yet.")).toBeInTheDocument();
  });

  it("loads recipients saved before mount", async () => {
    saveRecipient("Alice", VALID_ADDRESS);
    render(<AddressBookPage />);

    expect(await screen.findByText("Alice")).toBeInTheDocument();
  });

  it("adds a recipient through the form", async () => {
    render(<AddressBookPage />);

    fireEvent.change(screen.getByTestId("recipient-label-input"), { target: { value: "Alice" } });
    fireEvent.change(screen.getByTestId("recipient-address-input"), { target: { value: VALID_ADDRESS } });
    fireEvent.click(screen.getByTestId("add-recipient-button"));

    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(screen.getByTestId("recipient-label-input")).toHaveValue("");
  });

  it("rejects an invalid address and shows why, without saving", async () => {
    render(<AddressBookPage />);

    fireEvent.change(screen.getByTestId("recipient-label-input"), { target: { value: "Alice" } });
    fireEvent.change(screen.getByTestId("recipient-address-input"), { target: { value: "not-an-address" } });
    fireEvent.click(screen.getByTestId("add-recipient-button"));

    expect(await screen.findByTestId("add-recipient-error")).toHaveTextContent(/start with G/);
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });

  it("edits a recipient in place", async () => {
    const saved = saveRecipient("Alice", VALID_ADDRESS)!;
    render(<AddressBookPage />);
    await screen.findByText("Alice");

    fireEvent.click(screen.getByTestId(`edit-button-${saved.id}`));
    fireEvent.change(screen.getByTestId(`edit-label-input-${saved.id}`), { target: { value: "Alice Updated" } });
    fireEvent.click(screen.getByTestId(`save-edit-${saved.id}`));

    expect(await screen.findByText("Alice Updated")).toBeInTheDocument();
  });

  it("cancels an edit without saving changes", async () => {
    const saved = saveRecipient("Alice", VALID_ADDRESS)!;
    render(<AddressBookPage />);
    await screen.findByText("Alice");

    fireEvent.click(screen.getByTestId(`edit-button-${saved.id}`));
    fireEvent.change(screen.getByTestId(`edit-label-input-${saved.id}`), { target: { value: "Discarded" } });
    fireEvent.click(screen.getByTestId(`cancel-edit-${saved.id}`));

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("Discarded")).not.toBeInTheDocument();
  });

  it("deletes a recipient", async () => {
    const saved = saveRecipient("Alice", VALID_ADDRESS)!;
    render(<AddressBookPage />);
    await screen.findByText("Alice");

    fireEvent.click(screen.getByTestId(`delete-button-${saved.id}`));

    await waitFor(() => {
      expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    });
    expect(screen.getByText("No saved recipients yet.")).toBeInTheDocument();
  });

  it("ignores a corrupted stored entry instead of crashing the page", async () => {
    window.localStorage.setItem(
      addressBookStorageKey(),
      JSON.stringify([
        { id: "1", label: "Good", address: VALID_ADDRESS, createdAt: 1 },
        { id: "2", label: "Bad", address: "not-an-address", createdAt: 2 },
        "not even an object",
      ])
    );

    expect(() => render(<AddressBookPage />)).not.toThrow();
    expect(await screen.findByText("Good")).toBeInTheDocument();
    expect(screen.queryByText("Bad")).not.toBeInTheDocument();
  });

  describe("export / import", () => {
    it("disables export when there is nothing to export", () => {
      render(<AddressBookPage />);
      expect(screen.getByTestId("export-button")).toBeDisabled();
    });

    it("imports recipients from a well-formed JSON file", async () => {
      render(<AddressBookPage />);
      const file = new File(
        [JSON.stringify([{ label: "Alice", address: VALID_ADDRESS }, { label: "Bob", address: VALID_ADDRESS_2 }])],
        "recipients.json",
        { type: "application/json" }
      );

      fireEvent.change(screen.getByTestId("import-file-input"), { target: { files: [file] } });

      expect(await screen.findByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    it("surfaces a malformed import file's errors without crashing", async () => {
      render(<AddressBookPage />);
      const file = new File(["{not valid json"], "recipients.json", { type: "application/json" });

      expect(() => fireEvent.change(screen.getByTestId("import-file-input"), { target: { files: [file] } })).not.toThrow();

      expect(await screen.findByTestId("import-errors")).toHaveTextContent(/not valid JSON/i);
    });

    it("reports per-entry errors for a JSON array with some invalid entries", async () => {
      render(<AddressBookPage />);
      const file = new File(
        [JSON.stringify([{ label: "Alice", address: VALID_ADDRESS }, { label: "Bad", address: "nope" }])],
        "recipients.json",
        { type: "application/json" }
      );

      fireEvent.change(screen.getByTestId("import-file-input"), { target: { files: [file] } });

      expect(await screen.findByText("Alice")).toBeInTheDocument();
      expect(screen.getByTestId("import-errors")).toBeInTheDocument();
    });
  });
});
