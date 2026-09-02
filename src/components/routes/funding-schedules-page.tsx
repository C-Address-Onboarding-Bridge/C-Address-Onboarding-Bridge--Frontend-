"use client";

import { useEffect, useState } from "react";
import { CalendarClock, ExternalLink, Pause, Pencil, Play, Plus, Trash2, X } from "lucide-react";
import { truncateAddress } from "@/components/AddressForm";
import LiveRegion from "@/components/live-region";
import {
  FUNDING_FREQUENCIES,
  SCHEDULE_LABEL_MAX_LENGTH,
  buildScheduleFundingLink,
  checkAndNotifyDueSchedules,
  createFundingSchedule,
  deleteFundingSchedule,
  dueSchedules,
  formatFrequency,
  loadFundingSchedules,
  markScheduleCompleted,
  pauseFundingSchedule,
  resumeFundingSchedule,
  updateFundingSchedule,
  validateFundingSchedule,
  type FundingSchedule,
} from "@/lib/fundingSchedules";
import { FUNDING_LINK_ASSETS } from "@/lib/fundingLink";
import { ROUTES } from "@/lib/routes";

/**
 * Recurring funding schedules page (#557).
 *
 * Lets the user save a recurring "fund this C-address" reminder. There is no
 * backend and nothing here executes automatically (see `fundingSchedules.ts`'s
 * module docs) — a due schedule surfaces in the notification centre and,
 * from this page, opens a pre-filled bridge link so completing it is a click
 * plus a signature, not a re-typed address. Not wallet-gated, same reasoning
 * as the address book: the store isn't keyed to the connected wallet.
 */
export default function FundingSchedulesPage() {
  const [schedules, setSchedules] = useState<FundingSchedule[]>([]);

  const [newLabel, setNewLabel] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newAsset, setNewAsset] = useState<string>(FUNDING_LINK_ASSETS[0]);
  const [newFrequency, setNewFrequency] = useState<string>(FUNDING_FREQUENCIES[0]);
  const [addError, setAddError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editAsset, setEditAsset] = useState<string>(FUNDING_LINK_ASSETS[0]);
  const [editFrequency, setEditFrequency] = useState<string>(FUNDING_FREQUENCIES[0]);
  const [editError, setEditError] = useState<string | null>(null);

  const [notice, setNotice] = useState("");

  // Read from storage (and check for due schedules) after mount only —
  // touching localStorage during render would break hydration, same guard
  // AddressBookPage uses for its own store.
  useEffect(() => {
    checkAndNotifyDueSchedules();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSchedules(loadFundingSchedules());
  }, []);

  const refresh = () => setSchedules(loadFundingSchedules());

  const handleAdd = (event: React.FormEvent) => {
    event.preventDefault();
    const validation = validateFundingSchedule(newLabel, newAddress, newAmount, newAsset, newFrequency);
    if (!validation.ok) {
      setAddError(validation.error);
      setNotice("");
      return;
    }
    const created = createFundingSchedule(newLabel, newAddress, newAmount, newAsset, newFrequency);
    if (!created) {
      setAddError("Couldn't save — you may have reached the schedule limit, or browser storage is full.");
      setNotice("");
      return;
    }
    setAddError(null);
    setNewLabel("");
    setNewAddress("");
    setNewAmount("");
    refresh();
    setNotice(`Saved "${created.label}".`);
  };

  const startEdit = (schedule: FundingSchedule) => {
    setEditingId(schedule.id);
    setEditLabel(schedule.label);
    setEditAddress(schedule.targetAddress);
    setEditAmount(schedule.amount);
    setEditAsset(schedule.asset);
    setEditFrequency(schedule.frequency);
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError(null);
  };

  const handleSaveEdit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingId) return;

    const validation = validateFundingSchedule(editLabel, editAddress, editAmount, editAsset, editFrequency);
    if (!validation.ok) {
      setEditError(validation.error);
      return;
    }
    if (!updateFundingSchedule(editingId, editLabel, editAddress, editAmount, editAsset, editFrequency)) {
      setEditError("Couldn't save — browser storage may be full.");
      return;
    }
    setEditingId(null);
    setEditError(null);
    refresh();
    setNotice(`Updated "${validation.label}".`);
  };

  const handleDelete = (schedule: FundingSchedule) => {
    deleteFundingSchedule(schedule.id);
    if (editingId === schedule.id) setEditingId(null);
    refresh();
    setNotice(`Removed "${schedule.label}".`);
  };

  const handleTogglePause = (schedule: FundingSchedule) => {
    if (schedule.paused) {
      resumeFundingSchedule(schedule.id);
      setNotice(`Resumed "${schedule.label}".`);
    } else {
      pauseFundingSchedule(schedule.id);
      setNotice(`Paused "${schedule.label}".`);
    }
    refresh();
  };

  const handleMarkCompleted = (schedule: FundingSchedule) => {
    markScheduleCompleted(schedule.id);
    refresh();
    setNotice(`Marked "${schedule.label}" as sent. Next due: one ${schedule.frequency.replace("ly", "")} from now.`);
  };

  const openFundingLink = (schedule: FundingSchedule) => {
    const baseUrl = `${window.location.origin}${ROUTES.BRIDGE}`;
    const link = buildScheduleFundingLink(baseUrl, schedule);
    window.open(link, "_blank", "noopener,noreferrer");
  };

  const due = dueSchedules(schedules);
  const dueIds = new Set(due.map((s) => s.id));

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Recurring Funding Schedules</h1>
        <p className="text-[var(--text-muted)]">
          Set reminders to fund a C-address on a schedule. Stored in this browser only — nothing here sends
          funds automatically; a due schedule opens a pre-filled bridge link for you to complete and sign.
        </p>
      </div>

      {due.length > 0 && (
        <div
          role="status"
          data-testid="due-banner"
          className="mb-6 p-4 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/20 flex items-center gap-3"
        >
          <CalendarClock className="w-5 h-5 text-[var(--primary)] flex-shrink-0" />
          <p className="text-sm">
            {due.length} schedule{due.length === 1 ? "" : "s"} due: {due.map((s) => s.label).join(", ")}.
          </p>
        </div>
      )}

      <section aria-labelledby="schedule-add" className="card p-6 mb-6">
        <h2 id="schedule-add" className="text-lg font-semibold mb-4">
          New Schedule
        </h2>
        <form onSubmit={handleAdd} noValidate className="space-y-4">
          <div>
            <label htmlFor="schedule-label" className="block text-sm font-medium mb-1.5">
              Label
            </label>
            <input
              id="schedule-label"
              type="text"
              value={newLabel}
              onChange={(e) => {
                setNewLabel(e.target.value);
                setAddError(null);
              }}
              maxLength={SCHEDULE_LABEL_MAX_LENGTH * 2}
              placeholder="e.g. Monthly savings top-up"
              data-testid="schedule-label-input"
              className="w-full px-4 py-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)] transition-colors"
            />
          </div>
          <div>
            <label htmlFor="schedule-address" className="block text-sm font-medium mb-1.5">
              Target C-Address
            </label>
            <input
              id="schedule-address"
              type="text"
              value={newAddress}
              onChange={(e) => {
                setNewAddress(e.target.value);
                setAddError(null);
              }}
              placeholder="C..."
              data-testid="schedule-address-input"
              className="w-full px-4 py-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm font-mono focus:outline-none focus:border-[var(--primary)] transition-colors"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="schedule-amount" className="block text-sm font-medium mb-1.5">
                Amount
              </label>
              <input
                id="schedule-amount"
                type="text"
                value={newAmount}
                onChange={(e) => {
                  setNewAmount(e.target.value);
                  setAddError(null);
                }}
                placeholder="100"
                data-testid="schedule-amount-input"
                className="w-full px-4 py-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)] transition-colors"
              />
            </div>
            <div>
              <label htmlFor="schedule-asset" className="block text-sm font-medium mb-1.5">
                Asset
              </label>
              <select
                id="schedule-asset"
                value={newAsset}
                onChange={(e) => setNewAsset(e.target.value)}
                data-testid="schedule-asset-select"
                className="w-full px-4 py-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)] transition-colors"
              >
                {FUNDING_LINK_ASSETS.map((asset) => (
                  <option key={asset} value={asset}>
                    {asset}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="schedule-frequency" className="block text-sm font-medium mb-1.5">
                Frequency
              </label>
              <select
                id="schedule-frequency"
                value={newFrequency}
                onChange={(e) => setNewFrequency(e.target.value)}
                data-testid="schedule-frequency-select"
                className="w-full px-4 py-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)] transition-colors"
              >
                {FUNDING_FREQUENCIES.map((freq) => (
                  <option key={freq} value={freq}>
                    {formatFrequency(freq)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {addError && (
            <p role="alert" data-testid="add-schedule-error" className="text-xs text-[var(--error)]">
              {addError}
            </p>
          )}
          <button
            type="submit"
            data-testid="add-schedule-button"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:bg-[var(--primary)]/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Save Schedule
          </button>
        </form>
      </section>

      <section aria-labelledby="schedule-list" className="card p-6 mb-6">
        <h2 id="schedule-list" className="text-lg font-semibold mb-4">
          Saved Schedules ({schedules.length})
        </h2>

        {schedules.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No recurring schedules yet.</p>
        ) : (
          <ul className="space-y-2">
            {schedules.map((schedule) =>
              editingId === schedule.id ? (
                <li key={schedule.id} className="p-3 rounded-lg bg-[var(--surface-2)]">
                  <form onSubmit={handleSaveEdit} className="space-y-2">
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      data-testid={`edit-label-input-${schedule.id}`}
                      className="w-full px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm"
                    />
                    <input
                      type="text"
                      value={editAddress}
                      onChange={(e) => setEditAddress(e.target.value)}
                      data-testid={`edit-address-input-${schedule.id}`}
                      className="w-full px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm font-mono"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        data-testid={`edit-amount-input-${schedule.id}`}
                        className="w-full px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm"
                      />
                      <select
                        value={editAsset}
                        onChange={(e) => setEditAsset(e.target.value)}
                        data-testid={`edit-asset-select-${schedule.id}`}
                        className="w-full px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm"
                      >
                        {FUNDING_LINK_ASSETS.map((asset) => (
                          <option key={asset} value={asset}>
                            {asset}
                          </option>
                        ))}
                      </select>
                      <select
                        value={editFrequency}
                        onChange={(e) => setEditFrequency(e.target.value)}
                        data-testid={`edit-frequency-select-${schedule.id}`}
                        className="w-full px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm"
                      >
                        {FUNDING_FREQUENCIES.map((freq) => (
                          <option key={freq} value={freq}>
                            {formatFrequency(freq)}
                          </option>
                        ))}
                      </select>
                    </div>
                    {editError && (
                      <p role="alert" data-testid="edit-schedule-error" className="text-xs text-[var(--error)]">
                        {editError}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        data-testid={`save-edit-${schedule.id}`}
                        className="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-white text-xs font-medium"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        data-testid={`cancel-edit-${schedule.id}`}
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
                  key={schedule.id}
                  data-testid={`schedule-row-${schedule.id}`}
                  className={`p-3 rounded-lg border ${
                    dueIds.has(schedule.id)
                      ? "border-[var(--primary)] bg-[var(--primary)]/5"
                      : "border-transparent bg-[var(--surface-2)]"
                  } ${schedule.paused ? "opacity-60" : ""}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {schedule.label}
                        {schedule.paused && <span className="ml-2 text-xs text-[var(--text-muted)]">(paused)</span>}
                      </p>
                      <p className="text-xs font-mono text-[var(--text-muted)]">{truncateAddress(schedule.targetAddress)}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        {schedule.amount} {schedule.asset} · {formatFrequency(schedule.frequency)} · Next:{" "}
                        {new Date(schedule.nextRunAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {dueIds.has(schedule.id) && (
                        <>
                          <button
                            type="button"
                            onClick={() => openFundingLink(schedule)}
                            aria-label={`Open funding link for ${schedule.label}`}
                            data-testid={`open-link-${schedule.id}`}
                            className="p-1.5 rounded hover:bg-[var(--surface)] text-[var(--primary)] transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMarkCompleted(schedule)}
                            data-testid={`mark-completed-${schedule.id}`}
                            className="px-2 py-1 rounded text-xs font-medium border border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary)]/10 transition-colors"
                          >
                            Mark sent
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => handleTogglePause(schedule)}
                        aria-label={schedule.paused ? `Resume ${schedule.label}` : `Pause ${schedule.label}`}
                        data-testid={`toggle-pause-${schedule.id}`}
                        className="p-1.5 rounded hover:bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
                      >
                        {schedule.paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(schedule)}
                        aria-label={`Edit ${schedule.label}`}
                        data-testid={`edit-button-${schedule.id}`}
                        className="p-1.5 rounded hover:bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(schedule)}
                        aria-label={`Delete ${schedule.label}`}
                        data-testid={`delete-button-${schedule.id}`}
                        className="p-1.5 rounded hover:bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--error)] transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
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
