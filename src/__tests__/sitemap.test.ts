import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import sitemap from "@/app/sitemap";
import { metadata as referralsMetadata } from "@/app/referrals/layout";
import { metadata as schedulesMetadata } from "@/app/schedules/layout";

describe("sitemap and route metadata (#944)", () => {
  it("maps every sitemap URL to an existing src/app/**/page.tsx and excludes /onboarding", () => {
    const entries = sitemap();
    const paths = entries.map((entry) => new URL(entry.url).pathname);

    expect(paths).toEqual(["/", "/bridge", "/onramp", "/cex"]);
    expect(paths).not.toContain("/onboarding");

    for (const routePath of paths) {
      const pageFile =
        routePath === "/"
          ? path.resolve(process.cwd(), "src/app/page.tsx")
          : path.resolve(process.cwd(), `src/app${routePath}/page.tsx`);
      expect(fs.existsSync(pageFile)).toBe(true);
    }
  });

  it("returns a stable lastModified timestamp across calls", () => {
    const first = sitemap().map((e) => e.lastModified);
    const second = sitemap().map((e) => e.lastModified);
    expect(second).toEqual(first);
  });

  it("sets title and noindex/nofollow robots metadata on /referrals and /schedules layouts", () => {
    expect(referralsMetadata.title).toBeTruthy();
    expect(referralsMetadata.robots).toEqual({ index: false, follow: false });

    expect(schedulesMetadata.title).toBeTruthy();
    expect(schedulesMetadata.robots).toEqual({ index: false, follow: false });
  });
});