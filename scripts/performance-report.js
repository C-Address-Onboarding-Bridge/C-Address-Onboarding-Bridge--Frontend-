#!/usr/bin/env node

/**
 * Performance Report Generator
 *
 * Reads the webpack stats emitted by next.config.ts (when BUILD_STATS=true)
 * and generates a summary for CI/PR comments.
 *
 * Usage:
 *   BUILD_STATS=true npm run build
 *   npm run perf:report
 */

const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '..', '.next');
const buildStatsFile = path.join(buildDir, 'build-stats.json');

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

function generateReport() {
  if (!fs.existsSync(buildStatsFile)) {
    console.error(
      `Build stats not found at ${path.relative(process.cwd(), buildStatsFile)}.\n` +
        'Run `BUILD_STATS=true npm run build` first to generate them.'
    );
    process.exit(1);
  }

  let stats;
  try {
    stats = JSON.parse(fs.readFileSync(buildStatsFile, 'utf8'));
  } catch (error) {
    console.error(`Failed to parse build stats: ${error.message}`);
    process.exit(1);
  }

  const assets = Array.isArray(stats.assets) ? stats.assets : [];
  const jsAssets = assets
    .filter((asset) => asset && typeof asset.name === 'string' && asset.name.endsWith('.js'))
    .sort((a, b) => (b.size || 0) - (a.size || 0));

  const totalSize = jsAssets.reduce((sum, asset) => sum + (asset.size || 0), 0);

  console.log('## 📊 Performance Report\n');
  console.log(`**JavaScript assets:** ${jsAssets.length}`);
  console.log(`**Total JS size:** ${formatBytes(totalSize)}\n`);

  if (jsAssets.length > 0) {
    console.log('### Largest JS assets\n');
    console.log('| Asset | Size |');
    console.log('| --- | --- |');
    for (const asset of jsAssets.slice(0, 10)) {
      console.log(`| \`${asset.name}\` | ${formatBytes(asset.size)} |`);
    }
  }
}

generateReport();
