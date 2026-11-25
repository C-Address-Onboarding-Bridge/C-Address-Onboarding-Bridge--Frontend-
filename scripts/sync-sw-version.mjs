import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const swLibPath = path.join(repoRoot, "src/lib/serviceWorker.ts");
const swPublicPath = path.join(repoRoot, "public/sw.js");

const swLibSource = readFileSync(swLibPath, "utf8");
const libMatch = swLibSource.match(/export const SW_CACHE_VERSION = "([^"]+)";/);
if (!libMatch) {
  throw new Error("Could not find SW_CACHE_VERSION in src/lib/serviceWorker.ts");
}

const buildVersion =
  process.env.NEXT_PUBLIC_BUILD_ID?.trim() ||
  process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
  process.env.GITHUB_SHA?.trim() ||
  libMatch[1];

const swSource = readFileSync(swPublicPath, "utf8");
const updatedSwSource = swSource.replace(
  /const CACHE_VERSION = "[^"]+";/,
  `const CACHE_VERSION = ${JSON.stringify(buildVersion)};`,
);

if (updatedSwSource !== swSource) {
  writeFileSync(swPublicPath, updatedSwSource, "utf8");
}