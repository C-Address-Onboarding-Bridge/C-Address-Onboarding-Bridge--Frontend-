import { describe, it, expect } from "vitest";
import {
  cancelOperation,
  createOperationId,
  enqueueOperation,
  fundingOperations,
  operationsToReplay,
  removeOperations,
} from "@/lib/offlineQueue";

describe("offline queue helpers (#475)", () => {
  const safe = { id: "a", label: "safe", kind: "safe" as const, run: () => {} };
  const funding = { id: "b", label: "fund", kind: "funding" as const, run: () => {} };

  it("enqueues operations", () => {
    expect(enqueueOperation([], safe)).toEqual([safe]);
  });

  it("cancels a queued operation by id", () => {
    expect(cancelOperation([safe, funding], "a")).toEqual([funding]);
  });

  it("replays only safe operations on reconnect", () => {
    expect(operationsToReplay([safe, funding])).toEqual([safe]);
  });

  it("keeps funding operations separate for explicit confirmation", () => {
    expect(fundingOperations([safe, funding])).toEqual([funding]);
  });

  it("removes several operations at once", () => {
    expect(removeOperations([safe, funding], ["a", "b"])).toEqual([]);
  });

  it("produces unique ids", () => {
    expect(createOperationId()).not.toBe(createOperationId());
  });
});
