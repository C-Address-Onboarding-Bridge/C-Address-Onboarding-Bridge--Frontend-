import { describe, expect, it } from "vitest";
import { fromStroops, toStroops } from "@/lib/stroops";

describe("stroops helpers", () => {
  it("adds 0.1 + 0.2 exactly", () => {
    expect(fromStroops(toStroops("0.1") + toStroops("0.2"))).toBe(0.3);
  });
  it("handles 7-decimal amounts", () => {
    expect(toStroops("1.2345678")).toBe(12345678n);
    expect(fromStroops(12345678n)).toBe(1.2345678);
  });
  it("handles the maximum amount", () => {
    expect(toStroops("922337203685.4775807")).toBe(9223372036854775807n);
  });
  it("rejects more than 7 decimals", () => {
    expect(() => toStroops("1.12345678")).toThrow(RangeError);
  });
});
