/**
 * UUID consolidation migration.
 *
 * Walks every DreamNode in the vault and:
 *   1. Builds a radicleId → uuid lookup table from each .udd that has both.
 *   2. Rewrites .udd.supermodules entries from `radicleId`-keyed to
 *      `parentUuid`-keyed where the radicleId can be resolved to a UUID.
 *      Entries that can't be resolved are left untouched (the parent isn't
 *      in this vault) so we don't silently drop relationships.
 *   3. Rewrites .gitmodules submodule URLs from relative paths (`../Name`)
 *      to canonical `interbrain://<child-uuid>` URLs by reading each
 *      submodule path's .udd to find its UUID.
 *
 * Idempotent: safe to run repeatedly. Supports a dry-run mode that reports
 * what would change without touching any files.
 */

const fs = require('fs');
const path = require('path');

export interface MigrationReport {
  scannedDreamNodes: number;
  /** Per-node summary of changes that were (or would be) applied. */
  perNode: PerNodeReport[];
  /** Submodule URLs we couldn't resolve to a UUID. */
  unresolvedSubmodules: { parent: string; submodulePath: string; reason: string }[];
  /** SupermoduleEntry entries we couldn't resolve to a UUID. */
  unresolvedSupermodules: { node: string; radicleId: string }[];
}

export interface PerNodeReport {
  path: string;
  uuid: string;
  changes: string[];
}

interface UDD {
  uuid?: string;
  radicleId?: string;
  submodules?: unknown[];
  supermodules?: unknown[];
  [key: string]: unknown;
}

interface SupermoduleEntryShape {
  parentUuid?: string;
  radicleId?: string;
  title?: string;
  atCommit?: string;
  addedAt?: number;
}

const SKIP_DIRS = new Set([
  '.git', '.obsidian', '.trash', '.DS_Store',
  'node_modules', 'target', 'dist', 'viewer-bundle', 'venv',
]);

export async function migrateRadicleIdsToUuids(
  vaultPath: string,
  options: { dryRun?: boolean } = {}
): Promise<MigrationReport> {
  const dryRun = !!options.dryRun;
  const report: MigrationReport = {
    scannedDreamNodes: 0,
    perNode: [],
    unresolvedSubmodules: [],
    unresolvedSupermodules: [],
  };

  // Pass 1: index every DreamNode with its .udd.
  const dreamNodes: { dirPath: string; udd: UDD }[] = [];
  walk(vaultPath, dirPath => {
    const uddPath = path.join(dirPath, '.udd');
    if (!fs.existsSync(uddPath)) return;
    try {
      const text = fs.readFileSync(uddPath, 'utf-8');
      const udd: UDD = JSON.parse(text);
      if (!udd.uuid) return;
      dreamNodes.push({ dirPath, udd });
    } catch {
      // Malformed .udd — skip
    }
  });

  report.scannedDreamNodes = dreamNodes.length;

  // Build the radicleId → uuid map.
  const ridToUuid = new Map<string, string>();
  for (const node of dreamNodes) {
    if (typeof node.udd.radicleId === 'string' && node.udd.radicleId && node.udd.uuid) {
      ridToUuid.set(node.udd.radicleId, node.udd.uuid);
    }
  }

  // Build a path → uuid map for .gitmodules URL rewriting.
  const pathToUuid = new Map<string, string>();
  for (const node of dreamNodes) {
    if (node.udd.uuid) pathToUuid.set(node.dirPath, node.udd.uuid);
  }

  // Pass 2: for each node, compute (and apply) UDD + .gitmodules rewrites.
  for (const node of dreamNodes) {
    const changes: string[] = [];
    const newUdd = { ...node.udd } as UDD;

    // Rewrite supermodules entries.
    if (Array.isArray(newUdd.supermodules)) {
      const before = JSON.stringify(newUdd.supermodules);
      const next: unknown[] = [];
      for (const entry of newUdd.supermodules) {
        if (typeof entry === 'string') {
          // Legacy bare-string format (could be uuid or rid). If it looks
          // like a rid, try to resolve; otherwise pass through.
          if (entry.startsWith('rad:') && ridToUuid.has(entry)) {
            next.push(ridToUuid.get(entry)!);
          } else {
            next.push(entry);
          }
          continue;
        }
        if (entry && typeof entry === 'object') {
          const e = entry as SupermoduleEntryShape;
          if (e.parentUuid) {
            // Already canonical.
            next.push(e);
            continue;
          }
          if (e.radicleId && ridToUuid.has(e.radicleId)) {
            const { radicleId, ...rest } = e;
            next.push({ parentUuid: ridToUuid.get(radicleId)!, ...rest });
            continue;
          }
          // Can't resolve — preserve as-is, surface in report.
          if (e.radicleId) {
            report.unresolvedSupermodules.push({
              node: node.udd.uuid!,
              radicleId: e.radicleId,
            });
          }
          next.push(e);
        }
      }
      const after = JSON.stringify(next);
      if (before !== after) {
        newUdd.supermodules = next;
        changes.push('supermodules: radicleId → parentUuid');
      }
    }

    // Drop the deprecated top-level radicleId.
    if (typeof newUdd.radicleId === 'string') {
      delete newUdd.radicleId;
      changes.push('removed deprecated top-level radicleId');
    }

    // Pass 3: rewrite .gitmodules URLs.
    const gitmodulesPath = path.join(node.dirPath, '.gitmodules');
    let newGitmodulesContent: string | null = null;
    if (fs.existsSync(gitmodulesPath)) {
      const original = fs.readFileSync(gitmodulesPath, 'utf-8') as string;
      const rewritten = rewriteGitmodules(
        original,
        node.dirPath,
        pathToUuid,
        ridToUuid,
        report
      );
      if (rewritten !== original) {
        newGitmodulesContent = rewritten;
        changes.push('.gitmodules: urls → interbrain://<uuid>');
      }
    }

    if (changes.length === 0) continue;

    if (!dryRun) {
      try {
        fs.writeFileSync(node.dirPath + '/.udd', JSON.stringify(newUdd, null, 2));
        if (newGitmodulesContent !== null) {
          fs.writeFileSync(gitmodulesPath, newGitmodulesContent);
        }
      } catch (err) {
        changes.push(`WRITE FAILED: ${(err as Error).message}`);
      }
    }

    report.perNode.push({
      path: node.dirPath,
      uuid: node.udd.uuid!,
      changes,
    });
  }

  return report;
}

/**
 * Rewrite a `.gitmodules` file in-place: any submodule entry whose URL is
 * a relative path (`../Foo`) is rewritten to `interbrain://<uuid>` if the
 * referenced path's .udd contains a UUID. Existing absolute URLs (https://,
 * git@, rad:) are left alone.
 */
function rewriteGitmodules(
  content: string,
  parentDir: string,
  pathToUuid: Map<string, string>,
  ridToUuid: Map<string, string>,
  report: MigrationReport
): string {
  const lines = content.split('\n');
  const out: string[] = [];
  let currentSubmodulePath: string | null = null;

  for (const line of lines) {
    // [submodule "Name"]
    const sectionMatch = line.match(/^\s*\[submodule\s+"([^"]+)"\]/);
    if (sectionMatch) {
      currentSubmodulePath = null;
      out.push(line);
      continue;
    }
    const pathMatch = line.match(/^\s*path\s*=\s*(.+?)\s*$/);
    if (pathMatch) {
      currentSubmodulePath = pathMatch[1];
      out.push(line);
      continue;
    }
    const urlMatch = line.match(/^(\s*url\s*=\s*)(.+?)\s*$/);
    if (urlMatch && currentSubmodulePath) {
      const prefix = urlMatch[1];
      const url = urlMatch[2];
      const newUrl = resolveSubmoduleUrl(
        url,
        currentSubmodulePath,
        parentDir,
        pathToUuid,
        ridToUuid,
        report
      );
      out.push(`${prefix}${newUrl}`);
      continue;
    }
    out.push(line);
  }

  return out.join('\n');
}

function resolveSubmoduleUrl(
  url: string,
  submodulePath: string,
  parentDir: string,
  pathToUuid: Map<string, string>,
  ridToUuid: Map<string, string>,
  report: MigrationReport
): string {
  // Already an interbrain:// URL — leave alone.
  if (url.startsWith('interbrain://')) return url;

  // Radicle ID URL — try to resolve.
  if (url.startsWith('rad:')) {
    const uuid = ridToUuid.get(url);
    if (uuid) return `interbrain://${uuid}`;
    report.unresolvedSubmodules.push({
      parent: parentDir, submodulePath,
      reason: `rad ID ${url} not in vault`,
    });
    return url;
  }

  // Relative or absolute path — resolve against the parent's directory.
  if (url.startsWith('./') || url.startsWith('../') || url.startsWith('/')) {
    const resolved = path.resolve(parentDir, url);
    const uuid = pathToUuid.get(resolved);
    if (uuid) return `interbrain://${uuid}`;
    report.unresolvedSubmodules.push({
      parent: parentDir, submodulePath,
      reason: `path ${resolved} not in vault index`,
    });
    return url;
  }

  // External (https://, git@, etc.) — leave alone.
  return url;
}

function walk(start: string, visit: (dirPath: string) => void) {
  const stack: string[] = [start];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    visit(dir);
    let entries: any[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;
      stack.push(path.join(dir, entry.name));
    }
  }
}

/** Format a migration report for console / Notice display. */
export function formatMigrationReport(report: MigrationReport, dryRun: boolean): string {
  const verb = dryRun ? 'Would update' : 'Updated';
  const lines: string[] = [];
  lines.push(`Scanned ${report.scannedDreamNodes} DreamNodes.`);
  lines.push(`${verb} ${report.perNode.length} of them.`);
  if (report.unresolvedSupermodules.length > 0) {
    lines.push(
      `${report.unresolvedSupermodules.length} supermodule entries could not be resolved (parent not in vault).`
    );
  }
  if (report.unresolvedSubmodules.length > 0) {
    lines.push(
      `${report.unresolvedSubmodules.length} submodule URLs could not be resolved.`
    );
  }
  return lines.join(' ');
}
