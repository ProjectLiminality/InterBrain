import { useInterBrainStore } from '../store/interbrain-store';
import { DreamNode } from '../types/dreamnode';

export class DreamNodeService {
  private selectedNodes: Set<string> = new Set();
  private currentNode: DreamNode | null = null;

  getCurrentNode(): DreamNode | null {
    return this.currentNode;
  }

  setCurrentNode(node: DreamNode | null): void {
    this.currentNode = node;
    // Sync with Zustand store
    useInterBrainStore.getState().setSelectedNode(node);
  }

  getSelectedNodes(): DreamNode[] {
    // TODO: Implement fetching actual nodes by IDs
    console.log('Selected node IDs:', Array.from(this.selectedNodes));
    return [];
  }

  toggleNodeSelection(nodeId: string): void {
    if (this.selectedNodes.has(nodeId)) {
      this.selectedNodes.delete(nodeId);
    } else {
      this.selectedNodes.add(nodeId);
    }
  }

  clearSelection(): void {
    this.selectedNodes.clear();
  }

  isSelected(nodeId: string): boolean {
    return this.selectedNodes.has(nodeId);
  }

  // Layout management methods
  setLayout(layout: 'constellation' | 'search' | 'focused'): void {
    const store = useInterBrainStore.getState();
    store.setSpatialLayout(layout);
  }

  getCurrentLayout(): 'constellation' | 'search' | 'focused' {
    return useInterBrainStore.getState().spatialLayout;
  }

  // Camera management methods
  resetCamera(): void {
    const store = useInterBrainStore.getState();
    // Reset to origin for proper Dynamic View Scaling geometry
    store.setCameraPosition([0, 0, 0]);
    store.setCameraTarget([0, 0, 0]);
    store.setCameraTransition(false);
  }

  setCameraPosition(position: [number, number, number]): void {
    const store = useInterBrainStore.getState();
    store.setCameraPosition(position);
  }

  setCameraTarget(target: [number, number, number]): void {
    const store = useInterBrainStore.getState();
    store.setCameraTarget(target);
  }

  startCameraTransition(duration: number = 1000): void {
    const store = useInterBrainStore.getState();
    store.setCameraTransition(true, duration);
  }

  endCameraTransition(): void {
    const store = useInterBrainStore.getState();
    store.setCameraTransition(false);
  }
}