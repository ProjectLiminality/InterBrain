import React from 'react';
import { setIcon } from 'obsidian';

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
 * Order determines position (starts at top, goes clockwise for 6+ buttons).
 */
export const RADIAL_BUTTON_CONFIGS: RadialButtonConfig[] = [
  {
    id: 'edit-mode',
    iconName: 'lucide-settings',
    commandId: 'interbrain:enter-edit-mode',
    label: 'Edit Mode'
  }
  // Add more buttons here - examples:
  // {
  //   id: 'search',
  //   iconName: 'lucide-search',
  //   commandId: 'interbrain:enter-search-mode',
  //   label: 'Search'
  // },
  // {
  //   id: 'create',
  //   iconName: 'lucide-plus-circle',
  //   commandId: 'interbrain:enter-creation-mode',
  //   label: 'Create'
  // }
];
