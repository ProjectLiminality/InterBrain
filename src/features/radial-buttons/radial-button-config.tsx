import React from 'react';
import { setIcon } from 'obsidian';
import { useInterBrainStore } from '../../store/interbrain-store';

/**
 * Check if a DreamNode is a GitHub-only repository where the user lacks push access
 * Returns { isGitHubOnly: boolean, hasAccess: boolean }
 */
async function checkGitHubAccess(node: any): Promise<{ isGitHubOnly: boolean; hasAccess: boolean }> {
  if (!node?.repoPath) {
    return { isGitHubOnly: false, hasAccess: true };
  }

  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsyncPromise = promisify(exec);
    const path = require('path');

    // Get vault path
    const app = (window as any).app;
    const vaultPath = (app?.vault?.adapter as any)?.basePath || '';
    const fullPath = path.join(vaultPath, node.repoPath);

    // Check for remotes
    const { stdout: remotesOutput } = await execAsyncPromise('git remote -v', { cwd: fullPath });

    // Check if has Radicle remote (means it's not GitHub-only)
    if (remotesOutput.includes('rad://') || remotesOutput.includes('rad\t')) {
      return { isGitHubOnly: false, hasAccess: true };
    }

    // Check if has GitHub remote
    const hasGitHub = remotesOutput.includes('github.com');
    if (!hasGitHub) {
      return { isGitHubOnly: false, hasAccess: true };
    }

    // It's GitHub-only - check if user owns the repository
    try {
      // Extract repository owner from remote URL
      const githubMatch = remotesOutput.match(/github\.com[:/]([^/]+)\/([^/\s.]+)/);
      if (!githubMatch) {
        // Can't determine owner - fail open (allow push)
        return { isGitHubOnly: true, hasAccess: true };
      }

      const repoOwner = githubMatch[1];

      // Check authenticated GitHub user (only if gh CLI hasn't been determined unavailable)
      if (ghCliAvailable !== false) {
        try {
          const { stdout: ghUser } = await execAsyncPromise('gh api user -q .login 2>&1', { cwd: fullPath });
          const currentUser = ghUser.trim();

          if (!currentUser) {
            // Not authenticated with gh - mark as unavailable and skip to dry-run fallback
            ghCliAvailable = false;
            throw new Error('gh not authenticated');
          }

          // gh CLI is working - mark as available for future checks
          ghCliAvailable = true;

          // User owns repo if they are the owner
          const hasAccess = repoOwner === currentUser;
          return { isGitHubOnly: true, hasAccess };
        } catch {
          // gh CLI not available or not authenticated - mark as unavailable
          ghCliAvailable = false;
          // Silently fall through to dry-run check
        }
      }
    } catch (error: any) {
      // Only log unexpected errors, not gh CLI availability issues
      if (!error.message?.includes('gh') && !error.message?.includes('not found')) {
        console.error('Error checking repository ownership:', error);
      }
      // If gh is not available or check fails, fall back to dry-run push
      try {
        await execAsyncPromise('git push --dry-run 2>&1', { cwd: fullPath });
        return { isGitHubOnly: true, hasAccess: true };
      } catch (pushError: any) {
        // Check if error is permission-related
        const errorOutput = pushError.stderr || pushError.stdout || pushError.message || '';
        const isPermissionError = errorOutput.includes('Permission denied') ||
                                  errorOutput.includes('403') ||
                                  errorOutput.includes('fatal: unable to access') ||
                                  errorOutput.includes('could not read Username');

        if (isPermissionError) {
          return { isGitHubOnly: true, hasAccess: false };
        }

        // Other errors (like "Everything up-to-date") mean we have access
        return { isGitHubOnly: true, hasAccess: true };
      }
    }
  } catch (error) {
    console.error('Error checking GitHub access:', error);
    return { isGitHubOnly: false, hasAccess: true }; // Fail open
  }
}

// Cache GitHub access checks to avoid repeated git commands
const githubAccessCache = new Map<string, { isGitHubOnly: boolean; hasAccess: boolean; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute

// Cache gh CLI availability check (session-level - never expires)
let ghCliAvailable: boolean | null = null;

async function checkGitHubAccessCached(node: any): Promise<{ isGitHubOnly: boolean; hasAccess: boolean }> {
  if (!node?.id) {
    return { isGitHubOnly: false, hasAccess: true };
  }

  const cached = githubAccessCache.get(node.id);
  const now = Date.now();

  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    return { isGitHubOnly: cached.isGitHubOnly, hasAccess: cached.hasAccess };
  }

  const result = await checkGitHubAccess(node);
  githubAccessCache.set(node.id, { ...result, timestamp: now });
  return result;
}

/**
 * Radial Button Configuration
 *
 * Defines the buttons that appear around the selected DreamNode in liminal-web mode.
 * Each button has an icon (via Obsidian's setIcon API) and maps to an Obsidian command.
 *
 * Architecture:
 * - Uses Obsidian's built-in icon system (same as EditNode3D pattern)
 * - Icons referenced by Lucide name (e.g., 'lucide-settings')
 * - Command IDs reference existing Obsidian commands
 * - Easy to add/remove buttons by modifying this array
 *
 * To add a new button:
 * 1. Browse icons at https://lucide.dev/icons
 * 2. Find the icon you want (e.g., "Search" → "search")
 * 3. Add entry with icon name as 'lucide-{icon-name}'
 */

export interface RadialButtonConfig {
  /** Unique identifier for this button */
  id: string;

  /** Lucide icon name with 'lucide-' prefix (e.g., 'lucide-settings') */
  iconName: string;

  /** Obsidian command ID to execute when clicked */
  commandId: string;

  /** Optional label for accessibility/debugging */
  label?: string;

  /** Optional function to determine if button should be shown (receives selectedNode) */
  shouldShow?: (node: any) => boolean;

  /** Optional function to get dynamic label based on node state */
  getDynamicLabel?: (node: any) => string;

  /** Optional function to get dynamic command based on node state */
  getDynamicCommand?: (node: any) => string;

  /** Optional function to determine if button should be disabled with tooltip */
  shouldDisable?: (node: any) => { disabled: boolean; reason?: string };
}

/**
 * Helper function to create icon React element using Obsidian's setIcon API
 * Pattern from EditNode3D.tsx - uses ref callback to inject SVG
 */
export function createIconElement(iconName: string): React.ReactNode {
  return (
    <div
      ref={(el) => {
        if (el) {
          el.innerHTML = '';
          setIcon(el, iconName);
          // Make SVG fill the container
          const svg = el.querySelector('svg');
          if (svg) {
            svg.style.width = '100%';
            svg.style.height = '100%';
          }
        }
      }}
      style={{
        width: '162px',
        height: '162px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    />
  );
}

/**
 * Radial Button Configuration Array
 *
 * Add/remove buttons by modifying this array.
 * Order determines position (starts at top, goes clockwise).
 */
// InterBrain node UUID constant
const INTERBRAIN_UUID = '550e8400-e29b-41d4-a716-446655440000';

export const RADIAL_BUTTON_CONFIGS: RadialButtonConfig[] = [
  {
    id: 'edit-mode',
    iconName: 'lucide-settings',  // Gear icon
    commandId: 'interbrain:enter-edit-mode',
    label: 'Edit Mode',
    // Special handling for InterBrain node - open settings instead of edit mode
    getDynamicCommand: (node) => {
      if (node?.id === INTERBRAIN_UUID) {
        return 'interbrain:open-interbrain-settings';
      }
      return 'interbrain:enter-edit-mode';
    },
    getDynamicLabel: (node) => {
      if (node?.id === INTERBRAIN_UUID) {
        return 'InterBrain Settings';
      }
      return 'Edit Mode';
    }
  },
  {
    id: 'video-call',
    iconName: 'lucide-flame-kindling',
    commandId: 'interbrain:start-video-call',
    label: 'Initiate Digital Campfire',
    // Only show for dreamer-type nodes
    shouldShow: (node) => node?.type === 'dreamer',
    // Dynamic label based on copilot mode (active call state)
    getDynamicLabel: (_node) => {
      const store = useInterBrainStore.getState();
      return store.copilotMode.isActive ? 'Extinguish Digital Campfire' : 'Initiate Digital Campfire';
    },
    // Dynamic command based on copilot mode (active call state)
    getDynamicCommand: (_node) => {
      const store = useInterBrainStore.getState();
      return store.copilotMode.isActive
        ? 'interbrain:end-video-call'
        : 'interbrain:start-video-call';
    }
  },
  {
    id: 'create-canvas',
    iconName: 'lucide-layout-grid',
    commandId: 'interbrain:create-dreamsong-canvas',
    label: 'Create DreamSong Canvas'
  },
  {
    id: 'github-share',
    iconName: 'lucide-github',
    commandId: 'interbrain:share-dreamnode-github',
    label: 'Share to GitHub',
    // Only show for dream-type nodes
    shouldShow: (node) => node?.type === 'dream',
    // Dynamic label and command based on publish state
    getDynamicLabel: (node) => {
      return node?.githubRepoUrl ? 'Unpublish from GitHub' : 'Share to GitHub';
    },
    getDynamicCommand: (node) => {
      return node?.githubRepoUrl
        ? 'interbrain:unpublish-dreamnode-github'
        : 'interbrain:share-dreamnode-github';
    }
  },
  {
    id: 'save-changes',
    iconName: 'lucide-save',
    commandId: 'interbrain:save-dreamnode',
    label: 'Save Changes'
    // TODO: Refine what "save" means in different contexts
  },
  {
    id: 'share-changes',
    iconName: 'lucide-upload-cloud',
    commandId: 'interbrain:push-to-network',
    label: 'Share Changes',
    // TODO: Combine push-to-network + initialize/share radicle
    // Disable for GitHub-only repos where user lacks push access
    shouldDisable: (node) => {
      // This is intentionally synchronous - we use cached result
      const cached = githubAccessCache.get(node?.id);
      if (cached && cached.isGitHubOnly && !cached.hasAccess) {
        return {
          disabled: true,
          reason: 'Follow-only: You don\'t own this GitHub repository'
        };
      }
      // Trigger async check in background (will populate cache for next render)
      if (node?.id) {
        checkGitHubAccessCached(node).catch(console.error);
      }
      return { disabled: false };
    }
  },
  {
    id: 'check-updates',
    iconName: 'lucide-refresh-cw',
    commandId: 'interbrain:preview-updates', // Default for Dream nodes
    label: 'Check for Updates',
    // Dynamic command based on node type
    getDynamicCommand: (node) => {
      if (node?.type === 'dreamer') {
        return 'interbrain:check-all-updates-from-dreamer';
      }
      return 'interbrain:preview-updates';
    },
    // Dynamic label based on node type
    getDynamicLabel: (node) => {
      if (node?.type === 'dreamer') {
        return 'Check All Projects from This Peer';
      }
      return 'Check for Updates';
    }
  },
  {
    id: 'open-finder',
    iconName: 'lucide-folder-open',
    commandId: 'interbrain:open-dreamnode-in-finder',
    label: 'Open in Finder'
  },
  {
    id: 'coding-agent',
    iconName: 'lucide-terminal',
    commandId: 'interbrain:open-dreamnode-in-terminal',
    label: 'Open Coding Agent'
  },
  {
    id: 'delete-node',
    iconName: 'lucide-trash-2',
    commandId: 'interbrain:delete-dreamnode',
    label: 'Delete DreamNode'
  }
];
