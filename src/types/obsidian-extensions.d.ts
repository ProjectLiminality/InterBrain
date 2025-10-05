/**
 * TypeScript type definitions for undocumented Obsidian APIs
 *
 * These interfaces document internal Obsidian APIs that are not part of the official
 * type definitions but are used throughout the InterBrain plugin for advanced functionality.
 */

import { App, TAbstractFile, WorkspaceLeaf } from 'obsidian';

// App extensions for command execution
export interface AppWithCommands extends App {
  commands: {
    executeCommandById(commandId: string): boolean;
  };
}

// File system adapter with direct filesystem access
export interface FileSystemAdapter {
  basePath: string;
  read(path: string): Promise<string>;
  write(path: string, data: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

// Workspace extensions (undocumented internal APIs for layout management)
export interface WorkspaceLeafExt extends WorkspaceLeaf {
  parent?: WorkspaceSplitExt;
  containerEl?: HTMLElement;
}

export interface WorkspaceSplitExt {
  type?: string;
  children?: Array<{
    dimension?: number;
    setDimension?: (dimension: number) => void;
  }>;
}

// MarkdownView with editor access for transcript manipulation
export interface MarkdownViewWithEditor {
  editor?: {
    lastLine(): number;
    getLine(line: number): string;
    setCursor(line: number, ch: number): void;
    focus?(): void;
  };
}

// Electron window with Node.js integration (Obsidian runs in Electron)
export interface ElectronWindow {
  require: (moduleName: string) => unknown;
}

// Global window with Obsidian app instance
export interface ObsidianGlobal {
  app?: App;
}

// TranscriptionService with internal file reference (for accessing private properties)
export interface TranscriptionServiceWithFile {
  transcriptionFile: TAbstractFile | null;
}

// Vault event handler type (proper typing for vault.on/off event callbacks)
export type VaultEventHandler = (file: TAbstractFile) => void;

// Node.js child_process exec callback type
export type ExecCallback = (
  error: Error | null,
  stdout: string,
  stderr: string
) => void;
