/**
 * Dream Explorer Store Slice
 *
 * Ephemeral state for the full-screen holarchy file navigator.
 * Not persisted — resets when the view closes.
 */

import type { ExplorerLayoutMode } from '../types/explorer';

export interface DreamExplorerSlice {
  dreamExplorer: {
    /** Current directory path (vault-relative) */
    currentPath: string;
    /** Root path boundary — cannot navigate above this */
    rootPath: string;
    /** Display name for the root (DreamNode name) */
    rootName: string;
    /** Navigation history stack for back button */
    history: string[];
    /** Currently selected item paths (supports multi-select) */
    selectedItems: string[];
    /** Layout mode: equal (all same size), weighted (size-based), reduced (submodules + readme only) */
    layoutMode: ExplorerLayoutMode;
    /** Whether the explorer is open */
    isOpen: boolean;
    /** Whether explorer-focus is active (DreamNode zoomed closer, equal layout) */
    explorerFocus: boolean;
    /** Incremented to request an animated go-back from DreamExplorer */
    goBackRequestId: number;
  };

  // Actions
  explorerNavigateTo: (path: string) => void;
  explorerGoBack: () => void;
  /** Request an animated go-back — DreamExplorer watches this and triggers handleGoBack */
  explorerRequestGoBack: () => void;
  explorerSelectItem: (path: string | null, additive?: boolean) => void;
  explorerCycleLayoutMode: () => void;
  explorerSetLayoutMode: (mode: ExplorerLayoutMode) => void;
  explorerOpen: (initialPath: string, rootName?: string) => void;
  explorerClose: () => void;
  explorerSetFocus: (active: boolean) => void;
  explorerToggleFocus: () => void;
}

const LAYOUT_CYCLE: ExplorerLayoutMode[] = ['reduced', 'equal', 'weighted'];

export const createDreamExplorerSlice = (set: any, _get: any): DreamExplorerSlice => ({
  dreamExplorer: {
    currentPath: '',
    rootPath: '',
    rootName: '',
    history: [],
    selectedItems: [],
    layoutMode: 'reduced',
    isOpen: false,
    explorerFocus: false,
    goBackRequestId: 0,
  },

  explorerNavigateTo: (path: string) =>
    set((state: any) => {
      // Prevent navigating above root boundary
      const rootPath = state.dreamExplorer.rootPath;
      if (rootPath && !path.startsWith(rootPath) && path !== rootPath) {
        return state;
      }
      return {
        dreamExplorer: {
          ...state.dreamExplorer,
          history: [...state.dreamExplorer.history, state.dreamExplorer.currentPath],
          currentPath: path,
          selectedItems: [],
        },
      };
    }),

  explorerGoBack: () =>
    set((state: any) => {
      const history = [...state.dreamExplorer.history];
      const previousPath = history.pop();
      if (previousPath === undefined) return state;
      // Prevent going above root boundary
      const rootPath = state.dreamExplorer.rootPath;
      if (rootPath && !previousPath.startsWith(rootPath) && previousPath !== rootPath) {
        return state;
      }
      return {
        dreamExplorer: {
          ...state.dreamExplorer,
          history,
          currentPath: previousPath,
          selectedItems: [],
        },
      };
    }),

  explorerRequestGoBack: () =>
    set((state: any) => ({
      dreamExplorer: {
        ...state.dreamExplorer,
        goBackRequestId: state.dreamExplorer.goBackRequestId + 1,
      },
    })),

  explorerSelectItem: (path: string | null, additive?: boolean) =>
    set((state: any) => {
      if (path === null) {
        return {
          dreamExplorer: {
            ...state.dreamExplorer,
            selectedItems: [],
          },
        };
      }

      if (additive) {
        const current: string[] = state.dreamExplorer.selectedItems;
        const idx = current.indexOf(path);
        if (idx >= 0) {
          // Toggle off
          return {
            dreamExplorer: {
              ...state.dreamExplorer,
              selectedItems: current.filter((_: string, i: number) => i !== idx),
            },
          };
        } else {
          // Add
          return {
            dreamExplorer: {
              ...state.dreamExplorer,
              selectedItems: [...current, path],
            },
          };
        }
      }

      // Non-additive: replace selection
      return {
        dreamExplorer: {
          ...state.dreamExplorer,
          selectedItems: [path],
        },
      };
    }),

  explorerCycleLayoutMode: () =>
    set((state: any) => {
      const current = state.dreamExplorer.layoutMode as ExplorerLayoutMode;
      const idx = LAYOUT_CYCLE.indexOf(current);
      const next = LAYOUT_CYCLE[(idx + 1) % LAYOUT_CYCLE.length];
      return {
        dreamExplorer: {
          ...state.dreamExplorer,
          layoutMode: next,
        },
      };
    }),

  explorerSetLayoutMode: (mode: ExplorerLayoutMode) =>
    set((state: any) => ({
      dreamExplorer: {
        ...state.dreamExplorer,
        layoutMode: mode,
      },
    })),

  explorerOpen: (initialPath: string, rootName?: string) =>
    set(() => ({
      dreamExplorer: {
        currentPath: initialPath,
        rootPath: initialPath,
        rootName: rootName || initialPath.split('/').pop() || 'Explorer',
        history: [],
        selectedItems: [],
        layoutMode: 'reduced' as ExplorerLayoutMode,
        isOpen: true,
        explorerFocus: false,
        goBackRequestId: 0,
      },
    })),

  explorerClose: () =>
    set(() => ({
      dreamExplorer: {
        currentPath: '',
        rootPath: '',
        rootName: '',
        history: [],
        selectedItems: [],
        layoutMode: 'reduced' as ExplorerLayoutMode,
        isOpen: false,
        explorerFocus: false,
        goBackRequestId: 0,
      },
    })),

  explorerSetFocus: (active: boolean) =>
    set((state: any) => ({
      dreamExplorer: {
        ...state.dreamExplorer,
        explorerFocus: active,
        // Deactivating focus resets to reduced mode at root level
        ...(active ? {} : {
          layoutMode: 'reduced' as ExplorerLayoutMode,
          currentPath: state.dreamExplorer.rootPath,
          history: [],
          selectedItems: [],
        }),
      },
    })),

  explorerToggleFocus: () =>
    set((state: any) => {
      const newFocus = !state.dreamExplorer.explorerFocus;
      return {
        dreamExplorer: {
          ...state.dreamExplorer,
          explorerFocus: newFocus,
          // Deactivating focus resets to reduced mode at root level
          ...(!newFocus ? {
            layoutMode: 'reduced' as ExplorerLayoutMode,
            currentPath: state.dreamExplorer.rootPath,
            history: [],
            selectedItems: [],
          } : {}),
        },
      };
    }),
});
