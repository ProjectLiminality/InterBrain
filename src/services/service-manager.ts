import { DreamNode } from '../types/dreamnode';
import { MockDreamNodeService, mockDreamNodeService } from './mock-dreamnode-service';

/**
 * Service interface that both mock and real implementations will follow
 */
export interface IDreamNodeService {
  create(title: string, type: 'dream' | 'dreamer', dreamTalk?: globalThis.File): Promise<DreamNode>;
  update(id: string, changes: Partial<DreamNode>): Promise<void>;
  delete(id: string): Promise<void>;
  list(): Promise<DreamNode[]>;
  get(id: string): Promise<DreamNode | null>;
}

/**
 * Real DreamNodeService implementation (placeholder for Phase B)
 * Currently just extends the existing DreamNodeService with required methods
 */
class RealDreamNodeService implements IDreamNodeService {
  async create(_title: string, _type: 'dream' | 'dreamer', _dreamTalk?: globalThis.File): Promise<DreamNode> {
    // TODO: Implement real git-based creation in Phase B
    throw new Error('Real DreamNode creation not yet implemented - use mock mode');
  }

  async update(_id: string, _changes: Partial<DreamNode>): Promise<void> {
    // TODO: Implement real git-based updates in Phase B
    throw new Error('Real DreamNode updates not yet implemented - use mock mode');
  }

  async delete(_id: string): Promise<void> {
    // TODO: Implement real git-based deletion in Phase B
    throw new Error('Real DreamNode deletion not yet implemented - use mock mode');
  }

  async list(): Promise<DreamNode[]> {
    // TODO: Implement real git-based listing in Phase B
    throw new Error('Real DreamNode listing not yet implemented - use mock mode');
  }

  async get(_id: string): Promise<DreamNode | null> {
    // TODO: Implement real git-based retrieval in Phase B
    throw new Error('Real DreamNode retrieval not yet implemented - use mock mode');
  }
}

/**
 * Service Manager - handles switching between mock and real implementations
 */
export class ServiceManager {
  private mode: 'mock' | 'real' = 'mock';
  private mockService: MockDreamNodeService;
  private realService: RealDreamNodeService;

  constructor() {
    this.mockService = mockDreamNodeService;
    this.realService = new RealDreamNodeService();
  }

  /**
   * Get the currently active service
   */
  getActive(): IDreamNodeService {
    return this.mode === 'mock' ? this.mockService : this.realService;
  }

  /**
   * Switch between mock and real modes
   */
  setMode(mode: 'mock' | 'real'): void {
    const previousMode = this.mode;
    this.mode = mode;
    
    console.log(`ServiceManager: Switched from ${previousMode} to ${mode} mode`);
    
    if (mode === 'mock') {
      console.log('MockDreamNodeService stats:', this.mockService.getStats());
    }
  }

  /**
   * Get current mode
   */
  getMode(): 'mock' | 'real' {
    return this.mode;
  }

  /**
   * Reset mock data (useful for testing and development)
   */
  resetMockData(): void {
    if (this.mode === 'mock') {
      this.mockService.reset();
      console.log('ServiceManager: Reset mock data');
    } else {
      console.warn('ServiceManager: Cannot reset data in real mode');
    }
  }

  /**
   * Get service statistics
   */
  getStats() {
    if (this.mode === 'mock') {
      return {
        mode: this.mode,
        ...this.mockService.getStats()
      };
    } else {
      return {
        mode: this.mode,
        message: 'Real service stats not available'
      };
    }
  }
}

// Export singleton instance
export const serviceManager = new ServiceManager();