import Fuse from 'fuse.js';
import { DreamNode } from '../../dreamnode';
import { semanticSearchService, SearchResult, SearchOptions } from '../../semantic-search/services/semantic-search-service';
import { useInterBrainStore } from '../../../core/store/interbrain-store';

class HybridSearchService {
  private fuseIndex: Fuse<DreamNode> | null = null;
  private lastNodeCount = 0;

  /** Rebuild Fuse index when node list changes */
  private ensureIndex(): Fuse<DreamNode> {
    const nodes = Array.from(useInterBrainStore.getState().dreamNodes.values()).map(d => d.node);

    if (!this.fuseIndex || nodes.length !== this.lastNodeCount) {
      this.fuseIndex = new Fuse(nodes, {
        keys: ['name'],
        threshold: 0.4,
        distance: 100,
        includeScore: true,
      });
      this.lastNodeCount = nodes.length;
    }
    return this.fuseIndex;
  }

  /** Fuzzy search on node names — instant, synchronous */
  fuzzyNameSearch(query: string, options: SearchOptions = {}): SearchResult[] {
    const fuse = this.ensureIndex();
    const store = useInterBrainStore.getState();
    const results = fuse.search(query);

    return results
      .filter(r => {
        const node = r.item;
        if (options.nodeTypes && !options.nodeTypes.includes(node.type)) return false;
        if (options.excludeNodeId && node.id === options.excludeNodeId) return false;
        return true;
      })
      .slice(0, options.maxResults || 36)
      .map(r => ({
        node: r.item,
        score: 1 - (r.score || 0),
        vectorData: store.vectorData.get(r.item.id)!,
      }));
  }

  /** Hybrid search: fuzzy names first, then semantic, merged and deduplicated */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const fuzzyResults = this.fuzzyNameSearch(query, options);

    let semanticResults: SearchResult[] = [];
    try {
      semanticResults = await semanticSearchService.searchByText(query, options);
    } catch {
      // Semantic search failed — fuzzy results still available
    }

    const seen = new Set(fuzzyResults.map(r => r.node.id));
    const merged = [...fuzzyResults];
    for (const sr of semanticResults) {
      if (!seen.has(sr.node.id)) {
        seen.add(sr.node.id);
        merged.push(sr);
      }
    }

    return merged.slice(0, options.maxResults || 36);
  }

  /** Hybrid search for opposite-type nodes (relationship editor) */
  async searchOppositeType(
    query: string,
    referenceNode: DreamNode,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const oppositeType = referenceNode.type === 'dream' ? 'dreamer' : 'dream';
    return this.search(query, {
      ...options,
      nodeTypes: [oppositeType],
      excludeNodeId: referenceNode.id,
      maxResults: options.maxResults || 35,
    });
  }

  /** Check if semantic search is available (delegates to semantic service) */
  async isSemanticSearchAvailable(): Promise<boolean> {
    return semanticSearchService.isSemanticSearchAvailable();
  }

  /** Invalidate index (call when nodes change) */
  invalidateIndex() {
    this.fuseIndex = null;
    this.lastNodeCount = 0;
  }
}

export const hybridSearchService = new HybridSearchService();
