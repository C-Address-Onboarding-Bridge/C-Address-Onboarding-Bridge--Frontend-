import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../..");

describe("stable keys for changing lists", () => {
  it("uses the entry line and message for import errors and the step id for onboarding", () => {
    const addressBookSource = readFileSync(
      path.join(repositoryRoot, "src/components/routes/address-book-page.tsx"),
      "utf8"
    );
    const checklistSource = readFileSync(
      path.join(repositoryRoot, "src/components/OnboardingChecklist.tsx"),
      "utf8"
    );

    expect(addressBookSource).toContain("key={`${line}:${err}`}");
    expect(checklistSource).toContain("key={step.id}");
    expect(checklistSource).not.toMatch(/key=\{\s*index\s*\}/);
  });
});
