export interface DreamNode {
  id: string;
  name: string;
  type: 'dream' | 'dreamer';
  path: string;
  hasUnsavedChanges?: boolean;
}

export class DreamNodeService {
  private selectedNodes: Set<string> = new Set();
  private currentNode: DreamNode | null = null;

  getCurrentNode(): DreamNode | null {
    return this.currentNode;
  }

  setCurrentNode(node: DreamNode | null): void {
    this.currentNode = node;
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
}