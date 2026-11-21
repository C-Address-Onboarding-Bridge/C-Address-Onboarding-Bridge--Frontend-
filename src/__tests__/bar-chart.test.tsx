// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRoot, Root } from "react-dom/client";
import { BarChart, type BarChartDatum } from "@/components/bar-chart";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface TestDatum extends BarChartDatum {
  date: string;
  label: string;
  count: number;
}

describe("BarChart accessibility and edge cases (#1112)", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
  });

  const renderChart = async (props: {
    buckets: TestDatum[];
    getValue?: (b: TestDatum) => number;
    formatValue?: (v: number) => string;
    ariaLabel?: string;
    color?: string;
  }) => {
    const valueAccessor = props.getValue ?? ((b: TestDatum) => b.count);
    await act(async () => {
      root?.render(
        <BarChart
          buckets={props.buckets}
          valueOf={valueAccessor}
          formatValue={props.formatValue ?? ((v) => `${v} units`)}
          ariaLabel={props.ariaLabel ?? "Test Volume Chart"}
          color={props.color ?? "#3b82f6"}
        />
      );
    });
  };

  it("handles empty buckets gracefully with accessible empty state", async () => {
    await renderChart({ buckets: [] });

    expect(container?.querySelector("svg")).toBeNull();
    const emptyState = container?.querySelector('[role="region"]');
    expect(emptyState).not.toBeNull();
    expect(emptyState?.textContent).toContain("No activity in this period");
    expect(emptyState?.getAttribute("aria-label")).toBe("Test Volume Chart");
  });

  it("renders SVG with role='img' and links to accessible description list via aria-describedby", async () => {
    const buckets: TestDatum[] = [
      { date: "2026-08-01", label: "Aug 1", count: 100 },
      { date: "2026-08-02", label: "Aug 2", count: 250 },
      { date: "2026-08-03", label: "Aug 3", count: 400 },
    ];

    await renderChart({ buckets });

    const svg = container?.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-label")).toBe("Test Volume Chart");

    const descId = svg?.getAttribute("aria-describedby");
    expect(descId).toBeTruthy();

    const descList = container?.querySelector(`#${descId}`);
    expect(descList).not.toBeNull();
    expect(descList?.className).toContain("sr-only");

    // Must include every bucket label and formatted value
    expect(descList?.textContent).toContain("Aug 1");
    expect(descList?.textContent).toContain("100 units");
    expect(descList?.textContent).toContain("Aug 2");
    expect(descList?.textContent).toContain("250 units");
    expect(descList?.textContent).toContain("Aug 3");
    expect(descList?.textContent).toContain("400 units");
  });

  it("clamps negative values to 0 so bar heights and coordinates never become negative", async () => {
    const buckets: TestDatum[] = [
      { date: "2026-08-01", label: "Aug 1", count: -50 },
      { date: "2026-08-02", label: "Aug 2", count: 100 },
    ];

    await renderChart({ buckets });

    const rects = container?.querySelectorAll("rect");
    expect(rects).toHaveLength(2);

    const firstRect = rects![0];
    const secondRect = rects![1];

    // First rect with negative value should have height 0 and non-negative y
    expect(Number(firstRect.getAttribute("height"))).toBe(0);
    expect(Number(firstRect.getAttribute("y"))).toBeGreaterThan(0);

    // Second rect should have positive height
    expect(Number(secondRect.getAttribute("height"))).toBeGreaterThan(0);

    // The accessible description should show 0 units for the clamped negative value
    const descList = container?.querySelector("dl");
    expect(descList?.textContent).toContain("0 units");
  });

  it("renders <title> tooltips on every rect", async () => {
    const buckets: TestDatum[] = [
      { date: "2026-08-01", label: "Aug 1", count: 15 },
    ];

    await renderChart({ buckets });

    const title = container?.querySelector("rect title");
    expect(title).not.toBeNull();
    expect(title?.textContent).toBe("Aug 1: 15 units");
  });
});
