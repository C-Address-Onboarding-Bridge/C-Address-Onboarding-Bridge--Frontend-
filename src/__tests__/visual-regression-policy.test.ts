import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../..");

describe("visual testing policy", () => {
  it("does not leave an un-runnable Storybook/Percy workflow or stories behind", () => {
    expect(
      existsSync(path.join(repositoryRoot, ".github/workflows/visual-regression.yml"))
    ).toBe(false);
    const storiesDirectory = path.join(repositoryRoot, "src/stories");
    const stories = existsSync(storiesDirectory)
      ? readdirSync(storiesDirectory, { recursive: true }).filter((file) =>
          String(file).endsWith(".stories.tsx")
        )
      : [];
    expect(stories).toEqual([]);

    const contributing = readFileSync(
      path.join(repositoryRoot, "CONTRIBUTING.md"),
      "utf8"
    );
    expect(contributing).toContain("## Visual Testing Decision");
    expect(contributing.replace(/\s+/g, " ")).toContain(
      "not approved visual baselines"
    );
  });
});
