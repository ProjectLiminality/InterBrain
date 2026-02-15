/**
 * Dream Explorer Store Slice
 *
 * Ephemeral state for the full-screen holarchy file navigator.
 * Not persisted — resets when the view closes.
 */

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
    /** Whether to use size-weighted circle radii */
    sizeWeighted: boolean;
    /** Whether the explorer is open */
    isOpen: boolean;
  };

  // Actions
  explorerNavigateTo: (path: string) => void;
  explorerGoBack: () => void;
  explorerSelectItem: (path: string | null, additive?: boolean) => void;
  explorerToggleSizeWeighted: () => void;
  explorerOpen: (initialPath: string, rootName?: string) => void;
  explorerClose: () => void;
}

export const createDreamExplorerSlice = (set: any, _get: any): DreamExplorerSlice => ({
  dreamExplorer: {
    currentPath: '',
    rootPath: '',
    rootName: '',
    history: [],
    selectedItems: [],
    sizeWeighted: false,
    isOpen: false,
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

  explorerToggleSizeWeighted: () =>
    set((state: any) => ({
      dreamExplorer: {
        ...state.dreamExplorer,
        sizeWeighted: !state.dreamExplorer.sizeWeighted,
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
        sizeWeighted: false,
        isOpen: true,
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
        sizeWeighted: false,
        isOpen: false,
      },
    })),
});
