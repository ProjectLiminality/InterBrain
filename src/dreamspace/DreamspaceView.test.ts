import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DreamspaceView, DREAMSPACE_VIEW_TYPE } from './DreamspaceView';
import { WorkspaceLeaf } from 'obsidian';

// Mock React and ReactDOM
vi.mock('react', () => ({
  StrictMode: vi.fn(({ children }) => children),
  createElement: vi.fn((type, props, ...children) => ({ type, props, children })),
}));

vi.mock('react-dom/client', () => ({
  createRoot: vi.fn(() => ({
    render: vi.fn(),
    unmount: vi.fn(),
  })),
}));

// Mock DreamspaceCanvas
vi.mock('./DreamspaceCanvas', () => ({
  default: vi.fn(() => null),
}));

describe('DreamspaceView', () => {
  let mockLeaf: WorkspaceLeaf;
  let view: DreamspaceView;
  let mockContainer: HTMLElement;

  beforeEach(() => {
    // Create mock container structure
    mockContainer = document.createElement('div');
    const childContainer = document.createElement('div');
    
    // Add Obsidian-specific methods to the child container
    interface ObsidianHTMLElement extends HTMLElement {
      empty: () => void;
      addClass: (className: string) => void;
    }
    
    const obsidianContainer = childContainer as ObsidianHTMLElement;
    obsidianContainer.empty = vi.fn(() => {
      while (childContainer.firstChild) {
        childContainer.removeChild(childContainer.firstChild);
      }
    });
    obsidianContainer.addClass = vi.fn((className: string) => {
      childContainer.classList.add(className);
    });
    
    mockContainer.appendChild(document.createElement('div')); // children[0]
    mockContainer.appendChild(childContainer); // children[1]

    // Mock WorkspaceLeaf
    mockLeaf = {
      view: null,
      app: {},
    } as unknown as WorkspaceLeaf;

    // Create view instance
    view = new DreamspaceView(mockLeaf);
    
    // Mock containerEl
    Object.defineProperty(view, 'containerEl', {
      value: mockContainer,
      writable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Properties', () => {
    it('should return correct view type', () => {
      expect(view.getViewType()).toBe(DREAMSPACE_VIEW_TYPE);
    });

    it('should return correct display text', () => {
      expect(view.getDisplayText()).toBe('DreamSpace');
    });

    it('should return correct icon', () => {
      expect(view.getIcon()).toBe('globe');
    });
  });

  describe('Lifecycle Methods', () => {
    it('should create React root and render on open', async () => {
      const { createRoot } = await import('react-dom/client');
      const { createElement, StrictMode } = await import('react');
      
      await view.onOpen();

      // Check container setup
      const container = mockContainer.children[1];
      expect(container.classList.contains('dreamspace-container')).toBe(true);

      // Check React root creation and rendering
      expect(createRoot).toHaveBeenCalledWith(container);
      const mockRoot = vi.mocked(createRoot).mock.results[0].value;
      expect(mockRoot.render).toHaveBeenCalled();

      // Check render call structure
      expect(createElement).toHaveBeenCalledWith(StrictMode, null, expect.any(Object));
    });

    it('should unmount React root on close', async () => {
      const { createRoot } = await import('react-dom/client');
      
      // First open the view
      await view.onOpen();
      const mockRoot = vi.mocked(createRoot).mock.results[0].value;
      
      // Then close it
      await view.onClose();
      
      expect(mockRoot.unmount).toHaveBeenCalled();
    });

    it('should handle close when root is null', async () => {
      // Close without opening
      await expect(view.onClose()).resolves.not.toThrow();
    });
  });

  describe('Container Management', () => {
    it('should empty container before rendering', async () => {
      const container = mockContainer.children[1];
      const existingChild = document.createElement('span');
      container.appendChild(existingChild);
      
      expect(container.children.length).toBe(1);
      
      await view.onOpen();
      
      // Container should be emptied
      expect(container.children.length).toBe(0);
    });

    it('should add dreamspace-container class', async () => {
      const container = mockContainer.children[1];
      
      await view.onOpen();
      
      expect(container.classList.contains('dreamspace-container')).toBe(true);
    });
  });
});