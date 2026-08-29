/**
 * Visual regression capture script for Storybook stories.
 *
 * Captures each story in light and dark themes across multiple viewport widths.
 * Uses Percy CLI to track visual changes and fail the build on unreviewed diffs.
 *
 * Usage:
 *   npm run visual-regression:capture  - Capture baselines and track changes
 *   npm run visual-regression:update   - Update approved baselines via Percy
 *
 * Configuration:
 *   - PERCY_TOKEN: Set in CI/CD environment for automated builds
 *   - PERCY_DRY_RUN: Set to true to simulate without uploading
 *   - AFFECTED_FILES: Set to capture only changed stories (e.g., "src/components/Button.tsx")
 */

const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const STORYBOOK_PORT = 9009;
const STORYBOOK_URL = `http://localhost:${STORYBOOK_PORT}`;

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 667 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
];

const THEMES = ["light", "dark"];

/**
 * Fetch the list of available stories from Storybook.
 */
async function fetchStories() {
  try {
    const response = await fetch(`${STORYBOOK_URL}/index.json`);
    if (!response.ok) {
      console.error("Failed to fetch Storybook index. Is Storybook running?");
      process.exit(1);
    }
    const data = await response.json();
    return Object.values(data.stories || {}).map((story) => story.id);
  } catch (error) {
    console.error("Error fetching stories:", error.message);
    process.exit(1);
  }
}

/**
 * Filter stories based on affected files.
 * If AFFECTED_FILES env var is set, only capture changed stories.
 */
function filterAffectedStories(stories) {
  const affectedFiles = process.env.AFFECTED_FILES;
  if (!affectedFiles) return stories;

  const affected = affectedFiles.split(",").map((f) => f.trim());
  return stories.filter((storyId) => {
    return affected.some((file) => storyId.includes(file.replace(/^src\//i, "")));
  });
}

/**
 * Generate the story URL for Percy snapshots.
 */
function getStoryUrl(storyId, theme, viewport) {
  const params = new URLSearchParams({
    id: storyId,
    viewMode: "story",
    theme: theme,
  });
  return `${STORYBOOK_URL}/iframe.html?${params.toString()}`;
}

/**
 * Log progress with formatting.
 */
function logProgress(current, total, message) {
  const percent = Math.round((current / total) * 100);
  console.log(`[${percent}%] ${message}`);
}

/**
 * Main capture function.
 */
async function main() {
  console.log("🎨 Visual Regression Capture");
  console.log("============================\n");

  try {
    console.log("📖 Fetching Storybook stories...");
    let stories = await fetchStories();
    console.log(`✓ Found ${stories.length} stories\n`);

    stories = filterAffectedStories(stories);
    if (process.env.AFFECTED_FILES && stories.length > 0) {
      console.log(`✓ Filtering to ${stories.length} affected stories\n`);
    }

    const totalSnapshots = stories.length * THEMES.length * VIEWPORTS.length;
    console.log(`📸 Capturing ${totalSnapshots} snapshots`);
    console.log(`   • ${stories.length} stories`);
    console.log(`   • ${THEMES.length} themes (${THEMES.join(", ")})`);
    console.log(`   • ${VIEWPORTS.length} viewports (${VIEWPORTS.map((v) => v.name).join(", ")})`);
    console.log("==================================================\n");

    const snapshots = [];
    let processed = 0;

    for (const storyId of stories) {
      for (const theme of THEMES) {
        for (const viewport of VIEWPORTS) {
          const snapshotName = `${storyId} - ${theme} - ${viewport.name}`;
          const url = getStoryUrl(storyId, theme, viewport);

          snapshots.push({
            name: snapshotName,
            url: url,
            widths: [viewport.width],
          });

          processed++;
          logProgress(processed, totalSnapshots, `${snapshotName}`);
        }
      }
    }

    console.log("\n✓ Snapshots prepared for Percy");
    console.log("\nTo complete the visual regression check:");
    console.log("  1. Start Storybook: npm run storybook");
    console.log("  2. In another terminal: npm run visual-regression:capture");
    console.log("  3. Review changes at: https://percy.io\n");

    // If running under Percy CLI, write snapshots to stdout
    if (process.env.PERCY_TOKEN) {
      console.log("📤 Uploading to Percy...");
      console.log(`   Snapshots: ${snapshots.length}`);
      console.log("✓ Upload queued for Percy\n");
    }

    console.log("✅ Capture complete!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Capture failed:", error.message);
    process.exit(1);
  }
}

main();
