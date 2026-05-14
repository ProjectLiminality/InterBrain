#!/usr/bin/env node
/**
 * After `vite build`, assemble the Obsidian plugin's final artifacts at
 * the repo root:
 *   - dist/main.js → main.js
 *   - styles.base.css + dist/main.css → styles.css (concatenated)
 *
 * Replaces the POSIX `cp ... && cat ... > ...` pipeline that broke on
 * Windows. Cross-platform, idempotent.
 */
import { copyFileSync, readFileSync, writeFileSync, existsSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(here);

const distMainJs  = join(repoRoot, 'dist', 'main.js');
const distMainCss = join(repoRoot, 'dist', 'main.css');
const baseCss     = join(repoRoot, 'styles.base.css');
const outMainJs   = join(repoRoot, 'main.js');
const outStyles   = join(repoRoot, 'styles.css');

if (!existsSync(distMainJs)) {
  console.error(`assemble-plugin: missing ${distMainJs}; run \`vite build\` first.`);
  process.exit(1);
}

copyFileSync(distMainJs, outMainJs);
console.log(`copied ${distMainJs} → ${outMainJs}`);

const base = existsSync(baseCss) ? readFileSync(baseCss, 'utf8') : '';
const main = existsSync(distMainCss) ? readFileSync(distMainCss, 'utf8') : '';
writeFileSync(outStyles, base + main, 'utf8');
console.log(`wrote ${outStyles} (${base.length} + ${main.length} bytes)`);

// Bundle the DreamNode git-init template into the plugin install dir.
// `git init --template=<dir>` seeds every new DreamNode's .git/ with the
// `udd` placeholder + hooks. It MUST travel with the plugin itself —
// keying it off the InterBrain DreamNode repo (as we did before) breaks
// on fresh installs: the daemon clones that repo from `main`, which is
// docs-only and has no `src/` tree at all. The plugin reads this copy
// from its own install dir via `<pluginDir>/DreamNode-template`.
const templateSrc = join(repoRoot, 'src', 'features', 'dreamnode', 'DreamNode-template');
const templateDst = join(repoRoot, 'DreamNode-template');
if (existsSync(templateSrc)) {
  cpSync(templateSrc, templateDst, { recursive: true });
  console.log(`copied ${templateSrc} → ${templateDst}`);
} else {
  console.error(`assemble-plugin: missing template dir ${templateSrc}`);
  process.exit(1);
}
