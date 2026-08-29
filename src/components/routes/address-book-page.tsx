"use client";

import { useEffect, useRef, useState } from "react";
import { BookUser, Download, Pencil, Trash2, Upload, X } from "lucide-react";
import { truncateAddress } from "@/components/AddressForm";
import LiveRegion from "@/components/live-region";
import {
  RECIPIENT_LABEL_MAX_LENGTH,
  deleteRecipient,
  exportAddressBook,
  importAddressBook,
  loadAddressBook,
  saveRecipient,
  updateRecipient,
  validateRecipient,
  type SavedRecipient,
} from "@/lib/addressBook";

/**
 * Address book page (#466).
 *
 * Lets the user save labelled recipients so funding no longer requires
 * pasting a full address every time. Recipients are stored in this browser
 * only (`src/lib/addressBook.ts`) and surfaced as autocomplete suggestions in
 * `AddressForm`.
 *
 * Not wallet-gated: unlike the profile/avatar stores, the address book isn't
 * keyed to the connected wallet's own address, so it's usable (and editable)
 * whether or not a wallet is connected.
 */
export default function AddressBookPage() {
  const [recipients, setRecipients] = useState<SavedRecipient[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const [notice, setNotice] = useState("");
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Read from storage after mount only: touching localStorage during render
  // would produce different server and client output and break hydration —
  // same guard AvatarUpload/ProfilePage use for their own stores.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecipients(loadAddressBook());
  }, []);

  const refresh = () => setRecipients(loadAddressBook());

  const handleAdd = (event: React.FormEvent) => {
    event.preventDefault();
    const validation = validateRecipient(newLabel, newAddress);
    if (!validation.ok) {
      setAddError(validation.error);
      setNotice("");
      return;
    }
    const saved = saveRecipient(newLabel, newAddress);
    if (!saved) {
      setAddError("Couldn't save — browser storage may be full.");
      setNotice("");
      return;
    }
    setAddError(null);
    setNewLabel("");
    setNewAddress("");
    refresh();
    setNotice(`Saved "${saved.label}".`);
  };

  const startEdit = (recipient: SavedRecipient) => {
    setEditingId(recipient.id);
    setEditLabel(recipient.label);
    setEditAddress(recipient.address);
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError(null);
  };

  const handleSaveEdit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingId) return;

    const validation = validateRecipient(editLabel, editAddress);
    if (!validation.ok) {
      setEditError(validation.error);
      return;
    }
    if (!updateRecipient(editingId, editLabel, editAddress)) {
      setEditError("Couldn't save — browser storage may be full.");
      return;
    }
    setEditingId(null);
    setEditError(null);
    refresh();
    setNotice(`Updated "${validation.label}".`);
  };

  const handleDelete = (recipient: SavedRecipient) => {
    deleteRecipient(recipient.id);
    if (editingId === recipient.id) setEditingId(null);
    refresh();
    setNotice(`Removed "${recipient.label}".`);
  };

  const handleExport = () => {
    const json = exportAddressBook();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "address-book.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setNotice("Address book exported.");
  };

  const handleImportClick = () => {
    setImportErrors([]);
    fileInputRef.current?.click();
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Always reset the input so re-picking the same file fires `change` again.
    event.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const result = importAddressBook(text);
      refresh();
      setImportErrors(result.errors);
      setNotice(
        `Imported ${result.imported} recipient${result.imported === 1 ? "" : "s"}` +
          (result.skipped > 0 ? `, skipped ${result.skipped}.` : ".")
      );
    };
    reader.onerror = () => {
      setImportErrors(["Could not read the selected file."]);
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Address Book</h1>
        <p className="text-[var(--text-muted)]">
          Save labelled recipients so you don&apos;t have to paste a full address every time. Stored in
          this browser only.
        </p>
      </div>

      <section aria-labelledby="address-book-add" className="card p-6 mb-6">
        <h2 id="address-book-add" className="text-lg font-semibold mb-4">
          Add Recipient
        </h2>
        <form onSubmit={handleAdd} noValidate className="space-y-4">
          <div>
            <label htmlFor="recipient-label" className="block text-sm font-medium mb-1.5">
              Label
            </label>
            <input
              id="recipient-label"
              type="text"
              value={newLabel}
              onChange={(e) => {
                setNewLabel(e.target.value);
                setAddError(null);
              }}
              maxLength={RECIPIENT_LABEL_MAX_LENGTH * 2}
              placeholder="e.g. Alice's wallet"
              data-testid="recipient-label-input"
              className="w-full px-4 py-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)] transition-colors"
            />
          </div>
          <div>
            <label htmlFor="recipient-address" className="block text-sm font-medium mb-1.5">
              Address
            </label>
            <input
              id="recipient-address"
              type="text"
              value={newAddress}
              onChange={(e) => {
                setNewAddress(e.target.value);
                setAddError(null);
              }}
              placeholder="G..."
              data-testid="recipient-address-input"
              className="w-full px-4 py-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm font-mono focus:outline-none focus:border-[var(--primary)] transition-colors"
            />
          </div>
          {addError && (
            <p role="alert" data-testid="add-recipient-error" className="text-xs text-[var(--error)]">
              {addError}
            </p>
          )}
          <button
            type="submit"
            data-testid="add-recipient-button"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:bg-[var(--primary)]/90 transition-colors"
          >
            <BookUser className="w-4 h-4" />
            Save Recipient
          </button>
        </form>
      </section>

      <section aria-labelledby="address-book-list" className="card p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 id="address-book-list" className="text-lg font-semibold">
            Saved Recipients ({recipients.length})
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={recipients.length === 0}
              data-testid="export-button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            <button
              type="button"
              onClick={handleImportClick}
              data-testid="import-button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium hover:bg-[var(--surface-2)] transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              Import
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={handleImportFile}
              data-testid="import-file-input"
              className="hidden"
            />
          </div>
        </div>

        {importErrors.length > 0 && (
          <div
            data-testid="import-errors"
            className="mb-4 p-3 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 space-y-1"
          >
            {importErrors.map((err, i) => (
              <p key={i} className="text-xs text-[var(--error)]">
                {err}
              </p>
            ))}
          </div>
        )}

        {recipients.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No saved recipients yet.</p>
        ) : (
          <ul className="space-y-2">
            {recipients.map((recipient) =>
              editingId === recipient.id ? (
                <li key={recipient.id} className="p-3 rounded-lg bg-[var(--surface-2)]">
                  <form onSubmit={handleSaveEdit} className="space-y-2">
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      data-testid={`edit-label-input-${recipient.id}`}
                      className="w-full px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm"
                    />
                    <input
                      type="text"
                      value={editAddress}
                      onChange={(e) => setEditAddress(e.target.value)}
                      data-testid={`edit-address-input-${recipient.id}`}
                      className="w-full px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm font-mono"
                    />
                    {editError && (
                      <p role="alert" data-testid="edit-recipient-error" className="text-xs text-[var(--error)]">
                        {editError}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        data-testid={`save-edit-${recipient.id}`}
                        className="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-white text-xs font-medium"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        data-testid={`cancel-edit-${recipient.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium"
                      >
                        <X className="w-3 h-3" />
                        Cancel
                      </button>
                    </div>
                  </form>
                </li>
              ) : (
                <li
                  key={recipient.id}
                  data-testid={`recipient-row-${recipient.id}`}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[var(--surface-2)]"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{recipient.label}</p>
                    <p className="text-xs font-mono text-[var(--text-muted)]">
                      {truncateAddress(recipient.address)}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(recipient)}
                      aria-label={`Edit ${recipient.label}`}
                      data-testid={`edit-button-${recipient.id}`}
                      className="p-1.5 rounded hover:bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(recipient)}
                      aria-label={`Delete ${recipient.label}`}
                      data-testid={`delete-button-${recipient.id}`}
                      className="p-1.5 rounded hover:bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--error)] transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              )
            )}
          </ul>
        )}
      </section>

      <LiveRegion message={notice} />
    </div>
  );
}
