import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusBanner } from "../components/status-banner";

describe("StatusBanner", () => {
  it("renders nothing when status is healthy", () => {
    const { container } = render(<StatusBanner status="healthy" message="All good" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the message for a degraded status", () => {
    render(<StatusBanner status="degraded" message="Service is slow" />);
    expect(screen.getByText("Service is slow")).toBeInTheDocument();
  });

  it("hides the banner after it is dismissed", () => {
    render(<StatusBanner status="degraded" message="Service is slow" />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText("Service is slow")).not.toBeInTheDocument();
  });

  it("re-shows the banner when the severity worsens after dismissal", () => {
    const { rerender } = render(<StatusBanner status="degraded" message="Service is slow" />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText("Service is slow")).not.toBeInTheDocument();

    rerender(<StatusBanner status="unhealthy" message="Service is down" />);
    expect(screen.getByText("Service is down")).toBeInTheDocument();
  });

  it("re-shows the banner when the message changes after dismissal", () => {
    const { rerender } = render(<StatusBanner status="degraded" message="Service is slow" />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText("Service is slow")).not.toBeInTheDocument();

    rerender(<StatusBanner status="degraded" message="Service is very slow" />);
    expect(screen.getByText("Service is very slow")).toBeInTheDocument();
  });

  it("uses a single consistent live-region politeness", () => {
    render(<StatusBanner status="unhealthy" message="Service is down" />);
    const banner = screen.getByRole("alert");
    expect(banner).toHaveAttribute("aria-live", "assertive");
  });
});
