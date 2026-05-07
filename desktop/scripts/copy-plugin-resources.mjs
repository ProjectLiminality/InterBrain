#!/usr/bin/env node
/**
 * Copies the built Obsidian plugin files (main.js, manifest.json, styles.css)
 * from the repo root into desktop/src-tauri/resources/plugin/ so they get
 * bundled into the Tauri installer and the daemon can read them at runtime
 * via Tauri's resource_dir() API.
 *
 * Run automatically before `tauri build` and `vite build`.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktopDir = dirname(here);
const repoRoot = dirname(desktopDir);
const resourceDir = join(desktopDir, 'src-tauri', 'resources', 'plugin');

// (sourceRelativeToRepo, dstFilenameInResourceDir)
const items = [
  ['manifest.json', 'manifest.json'],
  ['main.js', 'main.js'],
  ['styles.css', 'styles.css'],
  ['theme/interbrain.css', 'interbrain.css'],
];

mkdirSync(resourceDir, { recursive: true });

const missing = [];
for (const [rel, dstName] of items) {
  const src = join(repoRoot, rel);
  if (!existsSync(src)) {
    missing.push(rel);
    continue;
  }
  const dst = join(resourceDir, dstName);
  copyFileSync(src, dst);
  console.log(`copied ${rel} → ${dst}`);
}

if (missing.length > 0) {
  console.error(`\nMissing plugin files at repo root: ${missing.join(', ')}`);
  console.error('Run `npm run build:plugin` from the repo root first.');
  process.exit(1);
}

console.log('plugin resources ready.');
