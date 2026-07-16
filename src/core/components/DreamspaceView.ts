import { ItemView, WorkspaceLeaf, Scope } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import { StrictMode, createElement, Suspense, lazy } from 'react';
import { useInterBrainStore } from '../store/interbrain-store';
import { AppWithCommands } from '../types/obsidian-extensions';

// Lazy load DreamspaceCanvas to prevent it from being parsed/evaluated
// until the lifecycle is actually ready
const DreamspaceCanvas = lazy(() => import('./DreamspaceCanvas'));

export const DREAMSPACE_VIEW_TYPE = 'dreamspace-view';

/**
 * Simple loading component shown while waiting for lifecycle
 */
function LoadingScreen() {
  const lifecycleReady = useInterBrainStore(state => state.lifecycleReady);

  if (!lifecycleReady) {
    return createElement('div', {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        color: '#666',
        fontFamily: 'var(--font-interface)',
        fontSize: '14px'
      }
    }, 'Loading DreamSpace...');
  }

  // Lifecycle is ready, now we can safely load DreamspaceCanvas
  return createElement(Suspense, {
    fallback: createElement('div', {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        color: '#666'
      }
    }, 'Initializing...')
  }, createElement(DreamspaceCanvas));
}

export class DreamspaceView extends ItemView {
  private root: Root | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);

    // View-scoped undo/redo (#404): Mod+Z means layout-undo only while the
    // DreamSpace is focused. Claiming a global Mod+Z default hotkey fights
    // Obsidian's core editor undo — the conflict resolves unpredictably and
    // breaks text undo in markdown panes. A view Scope is the canonical fix:
    // its keymap is active exactly when this view has focus.
    this.scope = new Scope(this.app.scope);
    this.scope.register(['Mod'], 'z', (evt) => {
      evt.preventDefault();
      (this.app as AppWithCommands).commands.executeCommandById('interbrain:undo-layout-change');
      return false;
    });
    this.scope.register(['Mod', 'Shift'], 'z', (evt) => {
      evt.preventDefault();
      (this.app as AppWithCommands).commands.executeCommandById('interbrain:redo-layout-change');
      return false;
    });
  }

  getViewType(): string {
    return DREAMSPACE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'DreamSpace';
  }

  getIcon(): string {
    return 'globe';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('dreamspace-container');

    this.root = createRoot(container);
    this.root.render(
      createElement(StrictMode, null, createElement(LoadingScreen))
    );
  }

  async onClose(): Promise<void> {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
  }
}
