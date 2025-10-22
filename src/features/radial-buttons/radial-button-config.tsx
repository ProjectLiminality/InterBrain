import React from 'react';

/**
 * Radial Button Configuration
 *
 * Defines the buttons that appear around the selected DreamNode in liminal-web mode.
 * Each button has an icon (SVG) and maps to an Obsidian command.
 *
 * Professional approach:
 * - SVG icons defined as React components (inline) for simplicity and type safety
 * - Command IDs reference existing Obsidian commands
 * - Easy to add/remove buttons by modifying this array
 */

export interface RadialButtonConfig {
  /** Unique identifier for this button */
  id: string;

  /** SVG icon component */
  icon: React.ReactNode;

  /** Obsidian command ID to execute when clicked */
  commandId: string;

  /** Optional label for accessibility/debugging */
  label?: string;
}

/**
 * Gear Icon - Settings/Edit
 * Simple, clean gear SVG for edit mode
 */
const GearIcon: React.FC = () => (
  <svg
    width="100%"
    height="100%"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* Outer gear circle */}
    <circle cx="12" cy="12" r="3" />

    {/* Gear teeth (8 teeth in circle pattern) */}
    <path d="M12 1v3" />
    <path d="M12 20v3" />
    <path d="M4.22 4.22l2.12 2.12" />
    <path d="M17.66 17.66l2.12 2.12" />
    <path d="M1 12h3" />
    <path d="M20 12h3" />
    <path d="M4.22 19.78l2.12-2.12" />
    <path d="M17.66 6.34l2.12-2.12" />
  </svg>
);

/**
 * Radial Button Configuration Array
 *
 * Add/remove buttons by modifying this array.
 * Order determines position (starts at top, goes clockwise for 6+ buttons).
 */
export const RADIAL_BUTTON_CONFIGS: RadialButtonConfig[] = [
  {
    id: 'edit-mode',
    icon: <GearIcon />,
    commandId: 'interbrain:enter-edit-mode',
    label: 'Edit Mode'
  }
  // Add more buttons here as needed:
  // {
  //   id: 'search',
  //   icon: <SearchIcon />,
  //   commandId: 'interbrain:enter-search-mode',
  //   label: 'Search'
  // }
];
