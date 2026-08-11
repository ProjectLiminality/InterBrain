/**
 * Collaboration Commands
 *
 * User-facing commands for GitHub-outbox sharing, invites, and the
 * published page. Commands are thin handlers — business logic lives in
 * services (sovereignty-service owns the outbox model).
 */

import { Notice } from 'obsidian';
import type InterBrainPlugin from '../../main';
import { UIService } from '../../core/services/ui-service';
import { useInterBrainStore } from '../../core/store/interbrain-store';

const path = require('path');

/**
 * Get vault path from plugin
 */
function getVaultPath(plugin: InterBrainPlugin): string {
  const adapter = plugin.app.vault.adapter as { path?: string; basePath?: string };
  if (typeof adapter.path === 'string') return adapter.path;
  if (typeof adapter.basePath === 'string') return adapter.basePath;
  return '';
}

/**
 * Register collaboration commands — GitHub outbox sharing, invites, and
 * the published-page window (#409: gh is the one collaboration AND
 * publishing layer).
 */
export function registerCollaborationCommands(
  plugin: InterBrainPlugin,
  _uiService: UIService
): void {

  // View the published page (#409): sharing is publishing, so the Publish
  // verb dissolved — this is its replacement. Derives the Pages URL from
  // the origin remote (never from .udd fields).
  plugin.addCommand({
    id: 'view-published-page',
    name: 'View Published Page',
    callback: async () => {
      const store = useInterBrainStore.getState();
      const selectedNode = store.selectedNode;
      if (!selectedNode) {
        new Notice('Please select a DreamNode first');
        return;
      }
      const vaultPath = getVaultPath(plugin);
      const path = require('path');
      const fullRepoPath = path.join(vaultPath, selectedNode.repoPath);
      try {
        const { promisify } = require('util');
        const { exec } = require('child_process');
        const execAsync = promisify(exec);
        const { stdout } = await execAsync('git config remote.origin.url', { cwd: fullRepoPath });
        const url = stdout.trim();
        const match = url.match(/github\.com[/:]([^/]+)\/([^/\s.]+)(?:\.git)?/);
        if (!match) {
          new Notice('Share this DreamNode first — its page appears once it has an outbox');
          return;
        }
        const pagesUrl = `https://${match[1]}.github.io/${match[2]}`;
        window.open(pagesUrl);
      } catch {
        new Notice('Share this DreamNode first — its page appears once it has an outbox');
      }
    }
  });

  // Share Changes preview (#393) — the outbound mirror of Check-for-Updates:
  // review the committed-but-unpushed commits before publishing. Sharing from
  // the modal delegates to push-to-network below.
  plugin.addCommand({
    id: 'preview-share',
    name: 'Review & Share Changes',
    callback: async () => {
      const store = useInterBrainStore.getState();
      const selectedNode = store.selectedNode;
      if (!selectedNode) {
        new Notice('Please select a DreamNode first');
        return;
      }
      const vaultPath = getVaultPath(plugin);
      const path = require('path');
      const fullRepoPath = path.join(vaultPath, selectedNode.repoPath);
      const { ShareChangesModal } = await import('./ui/share-changes-modal');
      new ShareChangesModal(plugin.app, {
        fullRepoPath,
        dreamNodeName: selectedNode.name,
      }).open();
    }
  });

  // Share Changes — push current DreamNode to the user's GitHub outbox.
  // Creates the outbox on first use; otherwise just pushes.
  plugin.addCommand({
    id: 'push-to-network',
    name: 'Share Changes (push to your GitHub outbox)',
    callback: async () => {
      const store = useInterBrainStore.getState();
      const selectedNode = store.selectedNode;
      if (!selectedNode) {
        new Notice('No DreamNode selected');
        return;
      }

      const vaultPath = getVaultPath(plugin);
      const fullRepoPath = path.join(vaultPath, selectedNode.repoPath);

      const notice = new Notice(`Sharing ${selectedNode.name}…`, 0);
      try {
        const { getSovereigntyService } = await import('./services/sovereignty-service');
        const sovereignty = getSovereigntyService();
        const result = await sovereignty.shareChanges(fullRepoPath, selectedNode.name);
        notice.hide();
        if (result.createdOutbox) {
          new Notice(`Created outbox + pushed ${selectedNode.name}`);
        } else {
          new Notice(`Pushed ${selectedNode.name}`);
        }

        // After a successful push, ignite coherence beacons for every
        // submodule of this DreamNode. Each beacon is a blank commit in
        // the child's sovereign repo that signals "you are part of this
        // supermodule, here's where to find it". Receivers detect them
        // via Check for Updates on the child. Failure here is non-fatal
        // — the share itself already succeeded.
        try {
          const beaconResults = await plugin.coherenceBeaconService.igniteBeacons(selectedNode.repoPath);
          const created = beaconResults.filter(r => r.status === 'created').length;
          if (created > 0) {
            new Notice(`Lit ${created} beacon${created > 1 ? 's' : ''}`);
          }
        } catch (beaconError) {
          console.error('[ShareChanges] Beacon ignition failed:', beaconError);
        }

        // Sharing is publishing (#409 invariant 4): the outbox repo IS the
        // published site. DreamSong present → build + deploy the static
        // site to gh-pages; README-only → Pages serves main directly
        // (GitHub renders the README). Non-fatal — the share succeeded.
        try {
          const fs = require('fs');
          const hasCanvas = fs
            .readdirSync(fullRepoPath)
            .some((f: string) => f.endsWith('.canvas'));
          if (hasCanvas) {
            const { githubService } = await import('../github-publishing/services/github-service');
            await githubService.rebuildGitHubPages(fullRepoPath);
            await sovereignty.ensurePages(fullRepoPath, 'gh-pages');
          } else {
            await sovereignty.ensurePages(fullRepoPath, 'main');
          }
        } catch (pagesError) {
          console.warn('[ShareChanges] Pages publish failed (non-fatal):', pagesError);
        }
      } catch (error) {
        notice.hide();
        console.error('[ShareChanges] Failed:', error);
        new Notice(`Share failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  });

  // Invite Collaborators — generate an interbrain://<uuid>?peer=<owner>/<repo>
  // URL pointing at the user's outbox, and copy it to the clipboard.
  plugin.addCommand({
    id: 'invite-collaborators',
    name: 'Invite Collaborators (copy interbrain:// link)',
    callback: async () => {
      const store = useInterBrainStore.getState();
      const selectedNode = store.selectedNode;
      if (!selectedNode) {
        new Notice('No DreamNode selected');
        return;
      }

      const vaultPath = getVaultPath(plugin);
      const fullRepoPath = path.join(vaultPath, selectedNode.repoPath);

      const notice = new Notice('Preparing invite…', 0);
      try {
        const { getSovereigntyService } = await import('./services/sovereignty-service');
        const sovereignty = getSovereigntyService();
        const sender = await sovereignty.getCurrentUser().catch(() => undefined);
        const { inviteUrl } = await sovereignty.buildInvite(fullRepoPath, selectedNode.name, sender);
        await navigator.clipboard.writeText(inviteUrl);
        notice.hide();
        new Notice(`Invite copied to clipboard`);
      } catch (error) {
        notice.hide();
        console.error('[InviteCollaborators] Failed:', error);
        new Notice(`Invite failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  });

  // Migrate legacy remotes (#409 Phase D) — one idempotent sweep bringing
  // every DreamNode to the unified convention: origin = my outbox; peers =
  // GitHub remotes owned by others; nothing else.
  //   - `github` remote owned by me → adopted as origin (or dropped if a
  //     correct origin already exists)
  //   - `github` remote owned by someone else → renamed to their peer name
  //   - `rad` remotes / rad:// URLs → removed (unresolvable)
  //   - filesystem-path origins → removed (uuid resolution owns local links)
  plugin.addCommand({
    id: 'migrate-legacy-remotes',
    name: 'Migrate Legacy Remotes (vault-wide)',
    callback: async () => {
      const { promisify } = require('util');
      const { exec } = require('child_process');
      const execAsync = promisify(exec);
      const fs = require('fs');
      const vaultPath = getVaultPath(plugin);

      const notice = new Notice('Migrating legacy remotes…', 0);
      let adopted = 0, peered = 0, removedRad = 0, removedPath = 0, dropped = 0, scanned = 0;
      try {
        const { getSovereigntyService } = await import('./services/sovereignty-service');
        const { sanitizePeerRemoteName } = await import('./services/sovereignty-service');
        const { ownerFromRemoteUrl } = await import('./services/peer-remotes');
        let me: string | null = null;
        try {
          me = (await getSovereigntyService().getCurrentUser()).toLowerCase();
        } catch {
          // Without an identity we can still clean rad remotes + path origins.
        }

        for (const entry of fs.readdirSync(vaultPath, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const repo = path.join(vaultPath, entry.name);
          if (!fs.existsSync(path.join(repo, '.udd'))) continue;
          scanned++;

          let config = '';
          try {
            const { stdout } = await execAsync("git config --get-regexp '^remote\\..*\\.url$'", { cwd: repo });
            config = stdout;
          } catch {
            continue; // no remotes at all — first Share creates the outbox
          }

          const remotes: Array<{ name: string; url: string }> = [];
          for (const line of config.split('\n')) {
            const m = line.match(/^remote\.(.+)\.url\s+(\S+)$/);
            if (m) remotes.push({ name: m[1], url: m[2] });
          }

          const hasProperOrigin = remotes.some(r =>
            r.name === 'origin' && (r.url.startsWith('http') || r.url.startsWith('git@'))
          );

          for (const r of remotes) {
            const isGithubUrl = /^(https?:\/\/(www\.)?github\.com\/|git@github\.com:)/i.test(r.url);
            const isRad = r.name === 'rad' || r.url.startsWith('rad://');
            const isPathUrl = !isGithubUrl && !isRad && !r.url.startsWith('interbrain://') && !/^[a-z+]+:\/\//i.test(r.url) && !r.url.startsWith('git@');

            if (isRad) {
              await execAsync(`git remote remove ${r.name}`, { cwd: repo }).catch(() => {});
              removedRad++;
            } else if (r.name === 'origin' && isPathUrl) {
              await execAsync('git remote remove origin', { cwd: repo }).catch(() => {});
              removedPath++;
            } else if (r.name === 'github' && isGithubUrl) {
              const owner = ownerFromRemoteUrl(r.url);
              if (me && owner === me) {
                if (hasProperOrigin) {
                  await execAsync('git remote remove github', { cwd: repo }).catch(() => {});
                  dropped++;
                } else {
                  await execAsync('git remote rename github origin', { cwd: repo }).catch(() => {});
                  adopted++;
                }
              } else if (owner) {
                const peerName = sanitizePeerRemoteName(owner);
                await execAsync(`git remote rename github ${peerName}`, { cwd: repo }).catch(() => {});
                peered++;
              }
            }
          }
        }

        notice.hide();
        const summary = `Migrated remotes across ${scanned} nodes: ${adopted} adopted as origin, ${peered} → peer, ${removedRad} rad removed, ${removedPath} path-origins removed, ${dropped} duplicates dropped`;
        console.log(`[MigrateRemotes] ${summary}`);
        new Notice(summary, 8000);
      } catch (error) {
        notice.hide();
        console.error('[MigrateRemotes] Failed:', error);
        new Notice(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  });
}