/**
 * Cross-platform post-build asset script.
 *
 * Replaces the POSIX `cp` and `cat` commands in the build script so the build
 * works on Windows, macOS, and Linux without requiring WSL or Git Bash.
 *
 * Also copies Python scripts and the GitHub viewer bundle into the plugin root
 * so they are present in both dev (symlinked) and production installs.
 */

import { readFileSync, writeFileSync, copyFileSync, cpSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, sep } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// ── 1. Copy main.js from dist/ to plugin root ─────────────────────────────────
copyFileSync(join(root, 'dist', 'main.js'), join(root, 'main.js'));
console.log('✅ main.js copied to plugin root');

// ── 2. Concatenate CSS ────────────────────────────────────────────────────────
writeFileSync(
  join(root, 'styles.css'),
  readFileSync(join(root, 'styles.base.css'), 'utf8') +
  readFileSync(join(root, 'dist', 'main.css'), 'utf8')
);
console.log('✅ styles.css generated');

// ── 3. Copy Python scripts to plugin root (skip venv dirs) ────────────────────
const pythonScripts = [
  ['src/features/realtime-transcription/scripts', 'scripts/realtime-transcription'],
  ['src/features/web-link-analyzer/scripts',      'scripts/web-link-analyzer'],
];

for (const [src, dest] of pythonScripts) {
  const srcPath  = join(root, src);
  const destPath = join(root, dest);
  if (existsSync(srcPath)) {
    mkdirSync(destPath, { recursive: true });
    cpSync(srcPath, destPath, {
      recursive: true,
      filter: (source, _dest) => !source.includes(`${sep}venv${sep}`) &&
                               !source.endsWith(`${sep}venv`),
    });
    console.log(`✅ ${src} → ${dest}`);
  } else {
    console.warn(`⚠️  Skipped (not found): ${src}`);
  }
}

// ── 4. Copy viewer bundle to plugin root ──────────────────────────────────────
const viewerSrc  = join(root, 'src/features/github-publishing/viewer-bundle');
const viewerDest = join(root, 'viewer-bundle');
if (existsSync(viewerSrc)) {
  mkdirSync(viewerDest, { recursive: true });
  cpSync(viewerSrc, viewerDest, { recursive: true });
  console.log('✅ viewer-bundle copied to plugin root');
} else {
  console.warn('⚠️  Skipped viewer-bundle (run build-github-viewer first)');
}
