import fs from "fs";
import path from "path";

describe("src/lib source files", () => {
  const libDir = path.join(process.cwd(), "src", "lib");
  const files = fs
    .readdirSync(libDir)
    .filter((file) => file.endsWith(".ts"));

  it("contains at least one TypeScript file", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s does not contain an editor truncation marker", (file) => {
    const contents = fs.readFileSync(path.join(libDir, file), "utf8");
    expect(contents).not.toMatch(/truncated \d+ chars/);
  });
});
