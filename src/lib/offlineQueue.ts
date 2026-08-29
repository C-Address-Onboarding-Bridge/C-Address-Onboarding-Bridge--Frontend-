/**
 * Minimal offline operation queue. (#475)
 *
 * The bridge UI targets an intermittent-connectivity audience, so actions that
 * cannot run while offline are parked here instead of failing silently. Two
 * kinds of operation exist:
 *
 *  - `safe`     — replayed automatically when connectivity returns (e.g. a
 *                 non-destructive metadata update).
 *  - `funding`  — a money movement that must never be blind-replayed. It stays
 *                 queued and is surfaced for explicit user confirmation.
 *
 * These are pure helpers so the queueing/replay/cancel decisions are unit
 * tested without a DOM.
 */

export type QueuedOperationKind = "safe" | "funding";

export interface QueuedOperation {
  id: string;
  label: string;
  kind: QueuedOperationKind;
  /** The action to run on replay/confirm. Absent in serialized snapshots. */
  run?: () => Promise<void> | void;
}

let sequence = 0;

/** Generates a unique id for a queued operation. */
export function createOperationId(): string {
  sequence += 1;
  return `op-${Date.now().toString(36)}-${sequence}`;
}

export function enqueueOperation(
  operations: QueuedOperation[],
  operation: QueuedOperation,
): QueuedOperation[] {
  return [...operations, operation];
}

export function cancelOperation(operations: QueuedOperation[], id: string): QueuedOperation[] {
  return operations.filter((op) => op.id !== id);
}

/** Safe operations replay automatically when connectivity returns. */
export function operationsToReplay(operations: QueuedOperation[]): QueuedOperation[] {
  return operations.filter((op) => op.kind === "safe");
}

/** Funding submissions are surfaced for explicit confirmation, never auto-sent. */
export function fundingOperations(operations: QueuedOperation[]): QueuedOperation[] {
  return operations.filter((op) => op.kind === "funding");
}

export function removeOperations(
  operations: QueuedOperation[],
  ids: string[],
): QueuedOperation[] {
  const remove = new Set(ids);
  return operations.filter((op) => !remove.has(op.id));
}
