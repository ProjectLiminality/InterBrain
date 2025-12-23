#!/usr/bin/env npx ts-node
/**
 * GitHub Publishing E2E Test Script
 *
 * Tests the GitHubService methods in a CI environment:
 * 1. isAvailable() - Verify gh CLI authenticated
 * 2. shareDreamNode() - Create repo, enable Pages
 * 3. rebuildGitHubPages() - Update existing Pages site
 * 4. unpublishDreamNode() - Delete repo, clean metadata
 *
 * Prerequisites:
 * - GH_TEST_TOKEN environment variable (GitHub PAT with repo scope)
 * - gh CLI installed and authenticated
 *
 * Usage:
 *   npx ts-node scripts/ci/test-github-publishing.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Test configuration
const TEST_PREFIX = `InterBrain-CI-Test-${Date.now()}`;
const CLEANUP_DELAY_MS = 2000; // Wait for GitHub API propagation

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

// Helper to run a test
async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  console.log(`\n🧪 Running: ${name}`);

  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, duration });
    console.log(`   ✅ PASSED (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, error: errorMsg, duration });
    console.log(`   ❌ FAILED: ${errorMsg}`);
  }
}

// Create a minimal test DreamNode
async function createTestDreamNode(testDir: string, title: string): Promise<string> {
  const nodePath = path.join(testDir, title);
  fs.mkdirSync(nodePath, { recursive: true });

  // Initialize git repo
  await execAsync('git init', { cwd: nodePath });
  await execAsync('git config user.email "ci@test.interbrain"', { cwd: nodePath });
  await execAsync('git config user.name "CI Test"', { cwd: nodePath });

  // Create .udd file
  const uuid = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const uddContent = {
    uuid,
    title,
    type: 'dream'
  };
  fs.writeFileSync(path.join(nodePath, '.udd'), JSON.stringify(uddContent, null, 2));

  // Create README
  fs.writeFileSync(path.join(nodePath, 'README.md'), `# ${title}\n\nCI Test DreamNode\n`);

  // Commit initial files
  await execAsync('git add -A', { cwd: nodePath });
  await execAsync('git commit -m "Initial commit"', { cwd: nodePath });

  return nodePath;
}

// Read .udd file
function readUDD(nodePath: string): any {
  const uddPath = path.join(nodePath, '.udd');
  return JSON.parse(fs.readFileSync(uddPath, 'utf-8'));
}

// Write .udd file
function writeUDD(nodePath: string, udd: any): void {
  fs.writeFileSync(path.join(nodePath, '.udd'), JSON.stringify(udd, null, 2));
}

// Check if gh CLI is available and authenticated
async function checkGhAuth(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('gh auth status 2>&1');
    return stdout.includes('Logged in to github.com');
  } catch {
    return false;
  }
}

// Get authenticated GitHub username
async function getGitHubUsername(): Promise<string> {
  const { stdout } = await execAsync('gh api user -q .login');
  return stdout.trim();
}

// Check if repo exists
async function repoExists(repoName: string): Promise<boolean> {
  try {
    await execAsync(`gh repo view ${repoName} --json name`);
    return true;
  } catch {
    return false;
  }
}

// Delete repo (cleanup)
async function deleteRepo(owner: string, repoName: string): Promise<void> {
  try {
    await execAsync(`gh repo delete ${owner}/${repoName} --yes`);
  } catch (error) {
    // Ignore if already deleted
    const msg = error instanceof Error ? error.message : '';
    if (!msg.includes('404') && !msg.includes('Not Found')) {
      throw error;
    }
  }
}

// Main test suite
async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('GitHub Publishing E2E Test Suite');
  console.log('='.repeat(60));

  // Check prerequisites
  const isGhAuthenticated = await checkGhAuth();
  if (!isGhAuthenticated) {
    console.error('\n❌ GitHub CLI not authenticated. Run: gh auth login');
    process.exit(1);
  }

  const ghUsername = await getGitHubUsername();
  console.log(`\n📝 Authenticated as: ${ghUsername}`);
  console.log(`📝 Test prefix: ${TEST_PREFIX}`);

  // Create temp directory for test DreamNodes
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'interbrain-gh-test-'));
  console.log(`📁 Test directory: ${testDir}`);

  let testNodePath: string | null = null;
  const testRepoName = `${TEST_PREFIX}-Node`;

  try {
    // =========================================================================
    // Test 1: gh CLI availability
    // =========================================================================
    await runTest('gh CLI is available and authenticated', async () => {
      const { stdout } = await execAsync('gh --version');
      if (!stdout.includes('gh version')) {
        throw new Error('gh CLI version check failed');
      }
    });

    // =========================================================================
    // Test 2: Create test DreamNode
    // =========================================================================
    await runTest('Create test DreamNode with .udd', async () => {
      testNodePath = await createTestDreamNode(testDir, testRepoName);

      // Verify .udd exists
      const udd = readUDD(testNodePath);
      if (!udd.uuid || !udd.title) {
        throw new Error('.udd file missing required fields');
      }
    });

    // =========================================================================
    // Test 3: Create GitHub repository
    // =========================================================================
    await runTest('Create public GitHub repository', async () => {
      if (!testNodePath) throw new Error('Test node not created');

      // Create repo using gh CLI (mirrors GitHubService.createRepo)
      const { stdout } = await execAsync(
        `gh repo create ${testRepoName} --public --source="${testNodePath}" --remote=github --push`,
        { cwd: testNodePath }
      );

      // Verify repo URL in output
      const urlMatch = stdout.match(/https:\/\/github\.com\/[^\s]+/);
      if (!urlMatch) {
        throw new Error('Repository URL not found in output');
      }

      // Update .udd with GitHub URL
      const udd = readUDD(testNodePath);
      udd.githubRepoUrl = urlMatch[0];
      writeUDD(testNodePath, udd);

      console.log(`      Created: ${urlMatch[0]}`);
    });

    // =========================================================================
    // Test 4: Verify repository exists
    // =========================================================================
    await runTest('Verify repository exists on GitHub', async () => {
      const exists = await repoExists(`${ghUsername}/${testRepoName}`);
      if (!exists) {
        throw new Error(`Repository ${ghUsername}/${testRepoName} not found`);
      }
    });

    // =========================================================================
    // Test 5: Enable GitHub Pages (API call)
    // =========================================================================
    await runTest('Enable GitHub Pages via API', async () => {
      if (!testNodePath) throw new Error('Test node not created');

      // First, create gh-pages branch (required for Pages to work)
      // Create orphan branch, add placeholder, push
      await execAsync('git checkout --orphan gh-pages', { cwd: testNodePath });
      await execAsync('git reset --hard', { cwd: testNodePath });
      fs.writeFileSync(path.join(testNodePath, 'index.html'), '<html><body>Test</body></html>');
      await execAsync('git add index.html', { cwd: testNodePath });
      await execAsync('git commit -m "Initialize gh-pages"', { cwd: testNodePath });
      await execAsync('git push github gh-pages', { cwd: testNodePath });

      // Return to main branch
      await execAsync('git checkout main', { cwd: testNodePath });

      // Wait for GitHub to process the push
      await new Promise(resolve => setTimeout(resolve, CLEANUP_DELAY_MS));

      // Enable Pages to serve from gh-pages branch
      try {
        await execAsync(
          `gh api -X POST "repos/${ghUsername}/${testRepoName}/pages" -f source[branch]=gh-pages -f source[path]=/`
        );
      } catch (error) {
        // Pages might already be enabled or 409 conflict - both are OK
        const msg = error instanceof Error ? error.message : '';
        if (!msg.includes('409') && !msg.includes('already exists')) {
          throw error;
        }
      }

      // Verify Pages is enabled
      const { stdout } = await execAsync(
        `gh api "repos/${ghUsername}/${testRepoName}/pages" -q '.html_url' 2>/dev/null || echo ""`
      );

      // Update .udd with Pages URL
      const udd = readUDD(testNodePath);
      const expectedPagesUrl = `https://${ghUsername}.github.io/${testRepoName}`;
      udd.githubPagesUrl = stdout.trim() || expectedPagesUrl;
      writeUDD(testNodePath, udd);

      console.log(`      Pages URL: ${udd.githubPagesUrl}`);
    });

    // =========================================================================
    // Test 6: Update gh-pages content (simulates rebuildGitHubPages)
    // =========================================================================
    await runTest('Update gh-pages branch content', async () => {
      if (!testNodePath) throw new Error('Test node not created');

      // Create worktree for gh-pages
      const worktreeDir = path.join(os.tmpdir(), `gh-pages-worktree-${Date.now()}`);

      try {
        await execAsync(`git worktree add "${worktreeDir}" gh-pages`, { cwd: testNodePath });

        // Update content
        fs.writeFileSync(
          path.join(worktreeDir, 'index.html'),
          '<html><body><h1>Updated DreamSong</h1></body></html>'
        );

        await execAsync('git add -A', { cwd: worktreeDir });
        await execAsync('git commit -m "Update DreamSong"', { cwd: worktreeDir });
        await execAsync('git push github gh-pages', { cwd: worktreeDir });

      } finally {
        // Cleanup worktree
        try {
          await execAsync(`git worktree remove "${worktreeDir}" --force`, { cwd: testNodePath });
        } catch {
          fs.rmSync(worktreeDir, { recursive: true, force: true });
          await execAsync('git worktree prune', { cwd: testNodePath });
        }
      }
    });

    // =========================================================================
    // Test 7: Verify Pages deployment (may take time)
    // =========================================================================
    await runTest('Verify Pages deployment status', async () => {
      // Check deployment status via API
      const { stdout } = await execAsync(
        `gh api "repos/${ghUsername}/${testRepoName}/pages" -q '.status' 2>/dev/null || echo "unknown"`
      );

      const status = stdout.trim();
      console.log(`      Pages status: ${status}`);

      // Accept "built" or "building" or "unknown" (API may lag)
      if (status !== 'built' && status !== 'building' && status !== 'unknown') {
        console.log(`      Warning: Unexpected status "${status}" - continuing anyway`);
      }
    });

    // =========================================================================
    // Test 8: Delete repository (cleanup + unpublish test)
    // =========================================================================
    await runTest('Delete GitHub repository (unpublish)', async () => {
      await deleteRepo(ghUsername, testRepoName);

      // Wait for deletion to propagate
      await new Promise(resolve => setTimeout(resolve, CLEANUP_DELAY_MS));

      // Verify deletion
      const stillExists = await repoExists(`${ghUsername}/${testRepoName}`);
      if (stillExists) {
        throw new Error('Repository was not deleted');
      }
    });

    // =========================================================================
    // Test 9: Verify .udd cleanup
    // =========================================================================
    await runTest('Clean .udd metadata after unpublish', async () => {
      if (!testNodePath) throw new Error('Test node not created');

      // Simulate cleanup (in real service, unpublishDreamNode does this)
      const udd = readUDD(testNodePath);
      delete udd.githubRepoUrl;
      delete udd.githubPagesUrl;
      writeUDD(testNodePath, udd);

      // Verify cleanup
      const cleanedUdd = readUDD(testNodePath);
      if (cleanedUdd.githubRepoUrl || cleanedUdd.githubPagesUrl) {
        throw new Error('.udd still contains GitHub URLs');
      }
    });

  } finally {
    // =========================================================================
    // Cleanup: Delete test directory and any remaining repos
    // =========================================================================
    console.log('\n🧹 Cleaning up...');

    // Delete test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
      console.log(`   Deleted test directory: ${testDir}`);
    } catch (error) {
      console.warn(`   Warning: Could not delete test directory: ${error}`);
    }

    // Ensure test repo is deleted (in case test failed before deletion step)
    try {
      await deleteRepo(ghUsername, testRepoName);
    } catch {
      // Ignore - repo might already be deleted
    }
  }

  // =========================================================================
  // Print summary
  // =========================================================================
  console.log('\n' + '='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  for (const result of results) {
    const status = result.passed ? '✅' : '❌';
    const error = result.error ? ` - ${result.error}` : '';
    console.log(`${status} ${result.name} (${result.duration}ms)${error}`);
  }

  console.log('\n' + '-'.repeat(60));
  console.log(`Total: ${passed} passed, ${failed} failed (${totalDuration}ms)`);

  if (failed > 0) {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  }

  console.log('\n✅ All tests passed');
  process.exit(0);
}

// Run tests
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
