/* eslint-disable @typescript-eslint/no-require-imports */
import { migrateRadicleIdsToUuids, formatMigrationReport } from '../src/features/dreamnode/utils/uuid-migration';

async function main() {
  const vault = process.argv[2] || '/Users/davidrug/InterBrainDemo/DemoVault';
  const dryRun = !process.argv.includes('--apply');
  console.log(`[dry-run=${dryRun}] vault=${vault}`);
  const report = await migrateRadicleIdsToUuids(vault, { dryRun });
  console.log(formatMigrationReport(report, dryRun));
  console.log('---per-node changes---');
  for (const node of report.perNode.slice(0, 30)) {
    console.log(`  ${node.path}`);
    for (const c of node.changes) console.log(`    - ${c}`);
  }
  if (report.perNode.length > 30) console.log(`  ... and ${report.perNode.length - 30} more`);
  if (report.unresolvedSubmodules.length) {
    console.log('---unresolved submodules---');
    for (const u of report.unresolvedSubmodules.slice(0, 10)) {
      console.log(`  ${u.parent}/${u.submodulePath}: ${u.reason}`);
    }
    if (report.unresolvedSubmodules.length > 10) {
      console.log(`  ... and ${report.unresolvedSubmodules.length - 10} more`);
    }
  }
  if (report.unresolvedSupermodules.length) {
    console.log('---unresolved supermodules---');
    for (const u of report.unresolvedSupermodules.slice(0, 10)) {
      console.log(`  ${u.node}: ${u.radicleId}`);
    }
  }
}

void main();
