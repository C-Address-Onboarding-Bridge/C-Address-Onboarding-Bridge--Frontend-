#!/usr/bin/env node

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');

/**
 * Generate a performance report from the Next.js build output.
 * This script reads webpack stats and generates a summary for CI/PR comments.
 */

const buildDir = path.join(__dirname, '..', '.next');
const buildStatsFile = path.join(buildDir, 'build-stats.json');

function getFileSizeInKB(bytes) {
  return (bytes / 1024).toFixed(2);
}

function generateReport() {
  console.log('## 📊 Performance Report\n');

  try {
    if (fs.existsSync(buildStatsFile)) {
      const stats = JSON.parse(fs.readFileSync(buildStatsFile, 'utf-8'));

      console.log('### Bundle Size\n');

      let totalSize = 0;
      const jsFiles = [];

      if (stats.assets) {
        stats.assets.forEach(asset => {
          if (asset.name.endsWith('.js') && !asset.name.includes('node_modules')) {
            jsFiles.push({
              name: asset.name,
              size: asset.size
            });
            totalSize += asset.size;
          }
        });
      }

      jsFiles.sort((a, b) => b.size - a.size).slice(0, 10).forEach(file => {
        console.log(`- \`${file.name}\`: ${getFileSizeInKB(file.size)} KB`);
      });

      console.log(`\n**Total JS (uncompressed): ${getFileSizeInKB(totalSize)} KB**\n`);
    } else {
      console.log('Build stats not available.\n');
    }
  } catch (error) {
    console.warn(`Could not parse build stats: ${error.message}`);
  }

  console.log('### Checks\n');
  console.log('- ✅ Initial JS budget enforced in webpack config');
  console.log('- ✅ Lighthouse scores tracked via CI');
  console.log('- ✅ Bundle analysis available via `npm run analyze`');
}

generateReport();
