import React from 'react';
import { setIcon } from 'obsidian';
import { useInterBrainStore } from '../../store/interbrain-store';

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
export const RADIAL_BUTTON_CONFIGS: RadialButtonConfig[] = [
  {
    id: 'edit-mode',
    iconName: 'lucide-settings',  // Gear icon
    commandId: 'interbrain:enter-edit-mode',
    label: 'Edit Mode'
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
    label: 'Share Changes'
    // TODO: Combine push-to-network + initialize/share radicle
  },
  {
    id: 'check-updates',
    iconName: 'lucide-refresh-cw',
    commandId: 'interbrain:preview-updates',
    label: 'Check for Updates'
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
