import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CanvasParserService, CanvasData } from './canvas-parser-service';
import { VaultService } from '../../../core/services/vault-service';

describe('CanvasParserService', () => {
  let canvasParserService: CanvasParserService;
  let mockVaultService: VaultService;

  beforeEach(() => {
    // Mock VaultService
    mockVaultService = {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      fileExists: vi.fn(),
      folderExists: vi.fn(),
      createFolder: vi.fn(),
      deleteFile: vi.fn()
    } as unknown as VaultService;

    canvasParserService = new CanvasParserService(mockVaultService);
  });

  describe('parseCanvas', () => {
    it('should parse a valid canvas file', async () => {
      const mockCanvasData: CanvasData = {
        nodes: [
          {
            id: 'node1',
            type: 'file',
            x: 100,
            y: 200,
            width: 300,
            height: 400,
            file: 'test-file.md'
          },
          {
            id: 'node2',
            type: 'text',
            x: 500,
            y: 600,
            width: 200,
            height: 100,
            text: 'Test text'
          }
        ],
        edges: [
          {
            id: 'edge1',
            fromNode: 'node1',
            toNode: 'node2'
          }
        ]
      };

      vi.mocked(mockVaultService.readFile).mockResolvedValue(JSON.stringify(mockCanvasData));

      const result = await canvasParserService.parseCanvas('test-canvas.canvas');

      expect(result).toEqual(mockCanvasData);
      expect(mockVaultService.readFile).toHaveBeenCalledWith('test-canvas.canvas');
    });

    it('should throw error for invalid JSON', async () => {
      vi.mocked(mockVaultService.readFile).mockResolvedValue('invalid json {');

      await expect(canvasParserService.parseCanvas('invalid.canvas'))
        .rejects.toThrow('Invalid canvas JSON in invalid.canvas');
    });

    it('should throw error for missing nodes array', async () => {
      const invalidCanvas = { edges: [] };
      vi.mocked(mockVaultService.readFile).mockResolvedValue(JSON.stringify(invalidCanvas));

      await expect(canvasParserService.parseCanvas('missing-nodes.canvas'))
        .rejects.toThrow('Invalid canvas format: missing or invalid nodes array');
    });

    it('should throw error for missing edges array', async () => {
      const invalidCanvas = { nodes: [] };
      vi.mocked(mockVaultService.readFile).mockResolvedValue(JSON.stringify(invalidCanvas));

      await expect(canvasParserService.parseCanvas('missing-edges.canvas'))
        .rejects.toThrow('Invalid canvas format: missing or invalid edges array');
    });
  });

  describe('findDreamNodeBoundary', () => {
    it('should find .udd file in parent directory', async () => {
      vi.mocked(mockVaultService.fileExists)
        .mockImplementation(async (path: string) => {
          return path === 'parent/.udd';
        });

      const result = await canvasParserService.findDreamNodeBoundary('parent/subdir/file.canvas');

      expect(result).toBe('parent');
      expect(mockVaultService.fileExists).toHaveBeenCalledWith('parent/.udd');
    });

    it('should find .udd file at root level', async () => {
      vi.mocked(mockVaultService.fileExists)
        .mockImplementation(async (path: string) => {
          return path === '.udd';
        });

      const result = await canvasParserService.findDreamNodeBoundary('some/deep/path/file.canvas');

      expect(result).toBe('');
      expect(mockVaultService.fileExists).toHaveBeenCalledWith('.udd');
    });

    it('should return null when no .udd file found', async () => {
      vi.mocked(mockVaultService.fileExists).mockResolvedValue(false);

      const result = await canvasParserService.findDreamNodeBoundary('path/file.canvas');

      expect(result).toBeNull();
    });

    it('should use cache for repeated calls', async () => {
      vi.mocked(mockVaultService.fileExists)
        .mockImplementation(async (path: string) => {
          return path === 'parent/.udd';
        });

      // First call
      const result1 = await canvasParserService.findDreamNodeBoundary('parent/file.canvas');
      // Second call with same file - should use cache
      const result2 = await canvasParserService.findDreamNodeBoundary('parent/file.canvas');

      expect(result1).toBe('parent');
      expect(result2).toBe('parent');
      // Cache means second call doesn't need any file system checks
      expect(mockVaultService.fileExists).toHaveBeenCalledTimes(3); // First call: file check + dir check + .udd check
    });
  });

  describe('analyzeCanvasDependencies', () => {
    const mockCanvasData: CanvasData = {
      nodes: [
        {
          id: 'internal-file',
          type: 'file',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          file: 'current-node/internal.md'
        },
        {
          id: 'external-file',
          type: 'file',
          x: 200,
          y: 0,
          width: 100,
          height: 100,
          file: 'other-node/external.md'
        },
        {
          id: 'text-node',
          type: 'text',
          x: 400,
          y: 0,
          width: 100,
          height: 100,
          text: 'Some text'
        }
      ],
      edges: []
    };

    beforeEach(() => {
      vi.mocked(mockVaultService.readFile).mockResolvedValue(JSON.stringify(mockCanvasData));
    });

    it('should identify external dependencies correctly', async () => {
      vi.mocked(mockVaultService.fileExists)
        .mockImplementation(async (path: string) => {
          if (path === 'current-node/udd') return true;
          if (path === 'other-node/udd') return true;
          return false;
        });

      // Mock findDreamNodeBoundary behavior
      canvasParserService.findDreamNodeBoundary = vi.fn()
        .mockImplementation(async (path: string) => {
          if (path.startsWith('current-node/')) return 'current-node';
          if (path.startsWith('other-node/')) return 'other-node';
          return null;
        });

      const analysis = await canvasParserService.analyzeCanvasDependencies('current-node/canvas.canvas');

      expect(analysis.canvasPath).toBe('current-node/canvas.canvas');
      expect(analysis.dreamNodeBoundary).toBe('current-node');
      expect(analysis.dependencies).toHaveLength(2);
      expect(analysis.externalDependencies).toHaveLength(1);
      expect(analysis.hasExternalDependencies).toBe(true);

      const externalDep = analysis.externalDependencies[0];
      expect(externalDep.filePath).toBe('other-node/external.md');
      expect(externalDep.isExternal).toBe(true);
      expect(externalDep.dreamNodePath).toBe('other-node');
    });

    it('should handle canvas with no external dependencies', async () => {
      const internalOnlyCanvas: CanvasData = {
        nodes: [
          {
            id: 'internal-file',
            type: 'file',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            file: 'current-node/internal.md'
          }
        ],
        edges: []
      };

      vi.mocked(mockVaultService.readFile).mockResolvedValue(JSON.stringify(internalOnlyCanvas));
      canvasParserService.findDreamNodeBoundary = vi.fn().mockResolvedValue('current-node');

      const analysis = await canvasParserService.analyzeCanvasDependencies('current-node/canvas.canvas');

      expect(analysis.externalDependencies).toHaveLength(0);
      expect(analysis.hasExternalDependencies).toBe(false);
    });

    it('should throw error if canvas is not in a DreamNode', async () => {
      canvasParserService.findDreamNodeBoundary = vi.fn().mockResolvedValue(null);

      await expect(canvasParserService.analyzeCanvasDependencies('orphan-canvas.canvas'))
        .rejects.toThrow('Canvas orphan-canvas.canvas is not inside a DreamNode');
    });
  });

  describe('updateCanvasFilePaths', () => {
    it('should update file paths in canvas', async () => {
      const originalCanvas: CanvasData = {
        nodes: [
          {
            id: 'node1',
            type: 'file',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            file: 'old-path/file.md'
          },
          {
            id: 'node2',
            type: 'file',
            x: 200,
            y: 0,
            width: 100,
            height: 100,
            file: 'other-old-path/file2.md'
          }
        ],
        edges: []
      };

      vi.mocked(mockVaultService.readFile).mockResolvedValue(JSON.stringify(originalCanvas));

      const pathUpdates = new Map<string, string>([
        ['old-path/file.md', 'new-path/file.md'],
        ['other-old-path/file2.md', 'new-path2/file2.md']
      ]);

      await canvasParserService.updateCanvasFilePaths('test.canvas', pathUpdates);

      expect(mockVaultService.writeFile).toHaveBeenCalledWith(
        'test.canvas',
        expect.stringContaining('"file": "new-path/file.md"')
      );
      expect(mockVaultService.writeFile).toHaveBeenCalledWith(
        'test.canvas',
        expect.stringContaining('"file": "new-path2/file2.md"')
      );
    });

    it('should not modify canvas if no paths to update', async () => {
      const originalCanvas: CanvasData = {
        nodes: [
          {
            id: 'node1',
            type: 'file',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            file: 'unchanged-path/file.md'
          }
        ],
        edges: []
      };

      vi.mocked(mockVaultService.readFile).mockResolvedValue(JSON.stringify(originalCanvas));

      const pathUpdates = new Map<string, string>([
        ['different-path/file.md', 'new-path/file.md']
      ]);

      await canvasParserService.updateCanvasFilePaths('test.canvas', pathUpdates);

      expect(mockVaultService.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('getFileNodes', () => {
    it('should return only file type nodes', async () => {
      const mixedCanvas: CanvasData = {
        nodes: [
          {
            id: 'file1',
            type: 'file',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            file: 'test1.md'
          },
          {
            id: 'text1',
            type: 'text',
            x: 200,
            y: 0,
            width: 100,
            height: 100,
            text: 'Some text'
          },
          {
            id: 'file2',
            type: 'file',
            x: 400,
            y: 0,
            width: 100,
            height: 100,
            file: 'test2.md'
          }
        ],
        edges: []
      };

      vi.mocked(mockVaultService.readFile).mockResolvedValue(JSON.stringify(mixedCanvas));

      const fileNodes = await canvasParserService.getFileNodes('test.canvas');

      expect(fileNodes).toHaveLength(2);
      expect(fileNodes.every(node => node.type === 'file')).toBe(true);
      expect(fileNodes.map(node => node.file)).toEqual(['test1.md', 'test2.md']);
    });
  });

  describe('generateAnalysisReport', () => {
    it('should generate a readable report', () => {
      const analysis = {
        canvasPath: 'test/canvas.canvas',
        dreamNodeBoundary: 'test',
        dependencies: [
          { filePath: 'test/internal.md', nodeId: 'node1', isExternal: false },
          { filePath: 'other/external.md', nodeId: 'node2', isExternal: true, dreamNodePath: 'other' }
        ],
        externalDependencies: [
          { filePath: 'other/external.md', nodeId: 'node2', isExternal: true, dreamNodePath: 'other' }
        ],
        hasExternalDependencies: true
      };

      const report = canvasParserService.generateAnalysisReport(analysis);

      expect(report).toContain('Canvas Analysis: test/canvas.canvas');
      expect(report).toContain('DreamNode Boundary: test');
      expect(report).toContain('Total Dependencies: 2');
      expect(report).toContain('External Dependencies: 1');
      expect(report).toContain('other/external.md (in other)');
    });

    it('should handle no external dependencies', () => {
      const analysis = {
        canvasPath: 'test/canvas.canvas',
        dreamNodeBoundary: 'test',
        dependencies: [
          { filePath: 'test/internal.md', nodeId: 'node1', isExternal: false }
        ],
        externalDependencies: [],
        hasExternalDependencies: false
      };

      const report = canvasParserService.generateAnalysisReport(analysis);

      expect(report).toContain('No external dependencies found.');
    });
  });

  describe('clearCache', () => {
    it('should clear the boundary detection cache', async () => {
      vi.mocked(mockVaultService.fileExists)
        .mockImplementation(async (path: string) => path === 'parent/.udd');

      // First call - should check file system
      await canvasParserService.findDreamNodeBoundary('parent/file.canvas');
      expect(mockVaultService.fileExists).toHaveBeenCalledTimes(3); // file check + dir check + .udd check

      // Second call - should use cache
      await canvasParserService.findDreamNodeBoundary('parent/file.canvas');
      expect(mockVaultService.fileExists).toHaveBeenCalledTimes(3); // No additional calls

      // Clear cache
      canvasParserService.clearCache();

      // Third call - should check file system again
      await canvasParserService.findDreamNodeBoundary('parent/file.canvas');
      expect(mockVaultService.fileExists).toHaveBeenCalledTimes(6); // 3 more calls after cache clear
    });
  });
});