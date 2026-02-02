import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import { StrictMode, createElement, Suspense, lazy } from 'react';
import { useInterBrainStore } from '../store/interbrain-store';

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
