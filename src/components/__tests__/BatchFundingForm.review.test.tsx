// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/stellar", () => ({
  isValidStellarAddress: (address: string) => /^[GC][A-Z0-9]{55}$/.test(address),
  isCAddress: (address: string) => /^C[A-Z0-9]{55}$/.test(address),
  isValidStellarAmount: (amount: string) =>
    /^\d+(\.\d{1,7})?$/.test(amount) && parseFloat(amount) > 0,
}));

import { BatchFundingForm } from "../BatchFundingForm";

const VALID_C = `C${"A".repeat(55)}`;
const VALID_C_2 = `C${"B".repeat(55)}`;

function pasteRows(text: string) {
  fireEvent.change(screen.getByTestId("batch-textarea"), { target: { value: text } });
}

describe("BatchFundingForm review step", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reviews only valid rows and displays the total and estimated fee", async () => {
    const estimateFee = vi.fn().mockResolvedValue("0.00002 XLM");
    render(<BatchFundingForm onSubmit={vi.fn()} estimateFee={estimateFee} />);
    pasteRows(`${VALID_C},10\nbad-address,5\n${VALID_C_2},2.5`);

    fireEvent.click(screen.getByTestId("batch-review-button"));

    expect(await screen.findByTestId("batch-recipient-count")).toHaveTextContent("2");
    expect(screen.getByText("Skipped (errors)")).toBeInTheDocument();
    expect(screen.getByTestId("batch-total")).toHaveTextContent("12.5");
    expect(await screen.findByTestId("batch-fee")).toHaveTextContent("0.00002 XLM");
    expect(estimateFee).toHaveBeenCalledTimes(1);
  });

  it("returns to input when the user chooses Back", async () => {
    render(<BatchFundingForm onSubmit={vi.fn()} />);
    pasteRows(`${VALID_C},10`);
    fireEvent.click(screen.getByTestId("batch-review-button"));

    await screen.findByTestId("batch-submit-button");
    fireEvent.click(screen.getByTestId("batch-back-button"));

    expect(screen.getByTestId("batch-textarea")).toHaveValue(`${VALID_C},10`);
    expect(screen.getByTestId("batch-review-button")).toBeInTheDocument();
  });
});
