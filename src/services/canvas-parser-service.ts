import { VaultService } from './vault-service';

// Simple path normalization for cross-platform compatibility
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

export interface CanvasNode {
  id: string;
  type: 'file' | 'text' | 'group' | 'link';
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  file?: string; // Path for file nodes
  text?: string; // Content for text nodes
  url?: string; // URL for link nodes
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: 'top' | 'right' | 'bottom' | 'left';
  toSide?: 'top' | 'right' | 'bottom' | 'left';
  toEnd?: 'none' | 'arrow'; // For undirected edges (toEnd: 'none')
  color?: string;
  label?: string;
}

export interface CanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface DependencyInfo {
  filePath: string;
  nodeId: string;
  isExternal: boolean; // Outside current DreamNode boundary
  dreamNodePath?: string; // Path to containing DreamNode if external
}

export interface CanvasAnalysis {
  canvasPath: string;
  dreamNodeBoundary: string; // Path to DreamNode containing this canvas
  dependencies: DependencyInfo[];
  externalDependencies: DependencyInfo[];
  hasExternalDependencies: boolean;
}

export class CanvasParserService {
  private boundaryCache = new Map<string, string>();

  constructor(private vaultService: VaultService) {}

  /**
   * Parse a canvas file and return structured data
   */
  async parseCanvas(canvasPath: string): Promise<CanvasData> {
    try {
      const canvasContent = await this.vaultService.readFile(canvasPath);
      const canvasData = JSON.parse(canvasContent) as CanvasData;
      
      // Validate basic structure
      if (!canvasData.nodes || !Array.isArray(canvasData.nodes)) {
        throw new Error('Invalid canvas format: missing or invalid nodes array');
      }
      
      if (!canvasData.edges || !Array.isArray(canvasData.edges)) {
        throw new Error('Invalid canvas format: missing or invalid edges array');
      }

      return canvasData;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid canvas JSON in ${canvasPath}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Find the DreamNode boundary for a given path by walking up the directory tree
   * looking for a .udd file
   */
  async findDreamNodeBoundary(filePath: string): Promise<string | null> {
    const normalizedPath = normalizePath(filePath);
    
    console.log(`🔍 [Canvas Parser] Finding boundary for: "${filePath}"`);
    console.log(`🔍 [Canvas Parser] Normalized path: "${normalizedPath}"`);
    
    // Check cache first
    if (this.boundaryCache.has(normalizedPath)) {
      return this.boundaryCache.get(normalizedPath) || null;
    }

    let currentPath = normalizedPath;
    
    // Handle file vs directory paths - get the directory containing the file
    if (await this.vaultService.fileExists(currentPath)) {
      // It's a file, start from parent directory (the directory containing the file)
      currentPath = currentPath.split('/').slice(0, -1).join('/');
      console.log(`📁 [Canvas Parser] File detected, checking directory: "${currentPath}"`);
    }

    // Walk up directory tree starting from the file's directory
    let attempts = 0;
    while (currentPath && currentPath !== '.' && currentPath !== '' && attempts < 10) {
      const uddPath = normalizePath(`${currentPath}/.udd`);
      console.log(`🔍 [Canvas Parser] Attempt ${attempts + 1}: Checking for .udd at: "${uddPath}"`);
      
      const exists = await this.vaultService.fileExists(uddPath);
      console.log(`${exists ? '✅' : '❌'} [Canvas Parser] .udd file ${exists ? 'FOUND' : 'NOT FOUND'} at: "${uddPath}"`);
      
      // Debug: List what files ARE in this directory
      if (!exists && attempts === 0) {
        console.log(`🔍 [Canvas Parser] DEBUG: Listing files in directory "${currentPath}"`);
        try {
          const folder = this.vaultService.obsidianVault.getAbstractFileByPath(currentPath);
          if (folder && 'children' in folder) {
            const children = (folder as { children?: { name: string }[] }).children || [];
            console.log(`📁 [Canvas Parser] Found ${children.length} items in "${currentPath}":`);
            children.forEach((child: { name: string }, i: number) => {
              console.log(`  ${i + 1}. "${child.name}" (${child.constructor.name})`);
            });
          } else {
            console.log(`❌ [Canvas Parser] Could not access folder: "${currentPath}"`);
          }
        } catch (error) {
          console.log(`❌ [Canvas Parser] Error listing directory: ${error}`);
        }
      }
      
      if (exists) {
        this.boundaryCache.set(normalizedPath, currentPath);
        console.log(`🎯 [Canvas Parser] Boundary found: "${currentPath}"`);
        return currentPath;
      }
      
      // Move up one directory
      const pathParts = currentPath.split('/');
      if (pathParts.length <= 1) break;
      currentPath = pathParts.slice(0, -1).join('/');
      console.log(`⬆️ [Canvas Parser] Moving up to: "${currentPath}"`);
      attempts++;
    }

    // Check root level
    const rootUddPath = '.udd';
    console.log(`🔍 [Canvas Parser] Checking root level: "${rootUddPath}"`);
    const rootExists = await this.vaultService.fileExists(rootUddPath);
    console.log(`${rootExists ? '✅' : '❌'} [Canvas Parser] Root .udd ${rootExists ? 'FOUND' : 'NOT FOUND'}`);
    
    if (rootExists) {
      this.boundaryCache.set(normalizedPath, '');
      return '';
    }

    // No boundary found
    console.log(`❌ [Canvas Parser] No .udd file found for: "${filePath}"`);
    this.boundaryCache.set(normalizedPath, '');
    return null;
  }

  /**
   * Analyze canvas dependencies and identify external references
   */
  async analyzeCanvasDependencies(canvasPath: string): Promise<CanvasAnalysis> {
    const canvasData = await this.parseCanvas(canvasPath);
    const canvasBoundary = await this.findDreamNodeBoundary(canvasPath);
    
    if (!canvasBoundary) {
      throw new Error(`Canvas ${canvasPath} is not inside a DreamNode (no .udd file found)`);
    }

    const dependencies: DependencyInfo[] = [];
    
    // Process file nodes
    for (const node of canvasData.nodes) {
      if (node.type === 'file' && node.file) {
        const filePath = normalizePath(node.file);
        const fileBoundary = await this.findDreamNodeBoundary(filePath);
        
        const isExternal = fileBoundary !== canvasBoundary;
        
        const dependencyInfo: DependencyInfo = {
          filePath,
          nodeId: node.id,
          isExternal,
          dreamNodePath: isExternal ? fileBoundary || undefined : undefined
        };
        
        dependencies.push(dependencyInfo);
      }
    }

    const externalDependencies = dependencies.filter(dep => dep.isExternal);

    return {
      canvasPath,
      dreamNodeBoundary: canvasBoundary,
      dependencies,
      externalDependencies,
      hasExternalDependencies: externalDependencies.length > 0
    };
  }

  /**
   * Get all file nodes from a canvas
   */
  async getFileNodes(canvasPath: string): Promise<CanvasNode[]> {
    const canvasData = await this.parseCanvas(canvasPath);
    return canvasData.nodes.filter(node => node.type === 'file');
  }

  /**
   * Update canvas file paths (for submodule rewriting)
   */
  async updateCanvasFilePaths(canvasPath: string, pathUpdates: Map<string, string>): Promise<void> {
    const canvasData = await this.parseCanvas(canvasPath);
    let modified = false;

    // Update file paths in nodes
    for (const node of canvasData.nodes) {
      if (node.type === 'file' && node.file) {
        const normalizedPath = normalizePath(node.file);
        if (pathUpdates.has(normalizedPath)) {
          node.file = pathUpdates.get(normalizedPath)!;
          modified = true;
        }
      }
    }

    if (modified) {
      const updatedContent = JSON.stringify(canvasData, null, 2);
      await this.vaultService.writeFile(canvasPath, updatedContent);
    }
  }

  /**
   * Clear the boundary detection cache
   */
  clearCache(): void {
    this.boundaryCache.clear();
  }

  /**
   * Get a summary report of canvas analysis
   */
  generateAnalysisReport(analysis: CanvasAnalysis): string {
    const { canvasPath, dreamNodeBoundary, dependencies, externalDependencies } = analysis;
    
    let report = `Canvas Analysis: ${canvasPath}\n`;
    report += `DreamNode Boundary: ${dreamNodeBoundary || 'ROOT'}\n`;
    report += `Total Dependencies: ${dependencies.length}\n`;
    report += `External Dependencies: ${externalDependencies.length}\n\n`;
    
    if (externalDependencies.length > 0) {
      report += 'External Dependencies:\n';
      for (const dep of externalDependencies) {
        report += `  - ${dep.filePath} (in ${dep.dreamNodePath || 'vault root'})\n`;
      }
    } else {
      report += 'No external dependencies found.\n';
    }
    
    return report;
  }
}