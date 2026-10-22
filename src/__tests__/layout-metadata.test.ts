import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { metadata as bridgeMetadata } from "@/app/bridge/layout";
import { metadata as cexMetadata } from "@/app/cex/layout";
import { metadata as onrampMetadata } from "@/app/onramp/layout";
import { generateMetadata as confirmGenerateMetadata } from "@/app/confirm/[hash]/layout";

/**
 * #942: the root layout hard-coded every URL (canonical, openGraph, twitter,
 * JSON-LD) to the placeholder "https://c-address-bridge.example.com", and
 * child layouts for /bridge, /cex, /onramp and /confirm/[hash] never set
 * their own `alternates.canonical`, so Next merged the root's homepage
 * canonical into all of them. #727 fixed the same hard-coding in
 * sitemap.ts/robots.ts by reading NEXT_PUBLIC_SITE_URL; this is the
 * equivalent fix for metadata.
 */
describe("Route metadata has its own canonical and no example.com (#942)", () => {
  it("bridge layout: canonical is /bridge, not inherited from root", () => {
    expect(bridgeMetadata.alternates?.canonical).toBe("/bridge");
    expect(JSON.stringify(bridgeMetadata)).not.toContain("example.com");
  });

  it("cex layout: canonical is /cex, not inherited from root", () => {
    expect(cexMetadata.alternates?.canonical).toBe("/cex");
    expect(JSON.stringify(cexMetadata)).not.toContain("example.com");
  });

  it("onramp layout: canonical is /onramp, not inherited from root", () => {
    expect(onrampMetadata.alternates?.canonical).toBe("/onramp");
    expect(JSON.stringify(onrampMetadata)).not.toContain("example.com");
  });

  it("confirm/[hash] layout: canonical is /confirm/<hash>, not inherited from root", async () => {
    const hash = "a".repeat(64);
    const meta = await confirmGenerateMetadata({ params: Promise.resolve({ hash }) });
    expect(meta.alternates?.canonical).toBe(`/confirm/${hash}`);
    expect(JSON.stringify(meta)).not.toContain("example.com");
  });

  it("root layout source sets metadataBase from NEXT_PUBLIC_SITE_URL and uses only relative URLs", () => {
    // next/font calls at module scope (Geist(...)) make importing
    // src/app/layout.tsx directly unsafe under vitest, so this asserts
    // against the source the same way src/__tests__/onramp-layout.test.ts
    // does for Tailwind-class regressions.
    const source = fs.readFileSync(
      path.resolve(__dirname, "../app/layout.tsx"),
      "utf-8"
    );
    expect(source).toContain("process.env.NEXT_PUBLIC_SITE_URL");
    expect(source).toContain("metadataBase: new URL(SITE_URL)");
    expect(source).not.toContain("c-address-bridge.example.com");
  });
});
