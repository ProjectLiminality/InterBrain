import { beforeEach, describe, expect, it } from 'vitest';
import { GitTemplateService } from './git-template-service';

describe('GitTemplateService', () => {
  let service: GitTemplateService;

  beforeEach(() => {
    service = new GitTemplateService();
  });

  describe('Template Structure', () => {
    it('should return correct template directory name', () => {
      expect(service.getTemplateDirectory()).toBe('DreamNode-template');
    });

    it('should validate template structure', () => {
      const validation = service.validateTemplate();
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });
  });

  describe('UDD Creation', () => {
    it('should create valid UDD structure', () => {
      const uuid = 'test-uuid-123';
      const title = 'Test DreamNode';
      const type = 'dream' as const;
      const dreamTalk = 'test-talk.md';

      const udd = service.createTemplateUDD(uuid, title, type, dreamTalk);

      expect(udd).toEqual({
        uuid,
        title,
        type,
        dreamTalk,
        liminalWebRelationships: [],
        submodules: [],
        supermodules: []
      });
    });

    it('should create UDD with default empty dreamTalk', () => {
      const udd = service.createTemplateUDD('uuid', 'title', 'dreamer');
      expect(udd.dreamTalk).toBe('');
    });

    it('should create UDD for both dream and dreamer types', () => {
      const dreamUdd = service.createTemplateUDD('uuid1', 'Dream', 'dream');
      const dreamerUdd = service.createTemplateUDD('uuid2', 'Dreamer', 'dreamer');

      expect(dreamUdd.type).toBe('dream');
      expect(dreamerUdd.type).toBe('dreamer');
    });
  });

  describe('Manual Instructions', () => {
    it('should generate correct manual instructions', () => {
      const templatePath = './DreamNode-template';
      const repoPath = './new-dreamnode';
      const title = 'My DreamNode';

      const instructions = service.getManualInstructions(templatePath, repoPath, title);

      expect(instructions).toContain('git init --template="./DreamNode-template" "./new-dreamnode"');
      expect(instructions).toContain('mv .git/udd .udd');
      expect(instructions).toContain('mv .git/README.md .');
      expect(instructions).toContain('mv .git/LICENSE .');
      expect(instructions).toContain('git commit -m "Initial DreamNode: My DreamNode"');
    });
  });

  describe('Coherence Checking', () => {
    it('should check DreamNode coherence', async () => {
      const mockPath = '/test/dreamnode';
      // Without a vault instance, coherence check should fail
      const result = await service.checkDreamNodeCoherence(mockPath);

      expect(result.coherent).toBe(false);
      expect(result.issues).toContain('Vault not initialized');
    });

    it('should update DreamNode coherence', () => {
      const mockPath = '/test/dreamnode';
      const result = service.updateDreamNodeCoherence(mockPath);

      expect(result.success).toBe(true);
      expect(result.updated).toContain('UDD schema');
      expect(result.updated).toContain('Git hooks');
    });

    it('should scan vault for DreamNodes', async () => {
      const mockVaultPath = '/test/vault';
      const result = await service.scanVaultCoherence(mockVaultPath);

      // Without vault, should return empty results
      expect(result.total).toBe(0);
      expect(result.coherent).toBe(0);
      expect(result.incoherent).toEqual([]);
    });
  });

  describe('UDD Schema Validation', () => {
    it('should create UDD with all required fields', () => {
      const udd = service.createTemplateUDD('uuid', 'title', 'dream', 'talk.md');
      
      // Check all required fields exist
      expect(udd).toHaveProperty('uuid');
      expect(udd).toHaveProperty('title');
      expect(udd).toHaveProperty('type');
      expect(udd).toHaveProperty('dreamTalk');
      expect(udd).toHaveProperty('liminalWebRelationships');
      expect(udd).toHaveProperty('submodules');
      expect(udd).toHaveProperty('supermodules');
    });

    it('should initialize arrays as empty', () => {
      const udd = service.createTemplateUDD('uuid', 'title', 'dream');
      
      expect(udd.liminalWebRelationships).toEqual([]);
      expect(udd.submodules).toEqual([]);
      expect(udd.supermodules).toEqual([]);
    });

    it('should preserve UUID immutability principle', () => {
      const uuid = 'constant-uuid-123';
      const udd = service.createTemplateUDD(uuid, 'title', 'dream');
      
      expect(udd.uuid).toBe(uuid);
      // UUID should never change - this is the constant identifier
    });
  });

  describe('Git Template Integration', () => {
    it('should provide template path for git init command', () => {
      const templateDir = service.getTemplateDirectory();
      expect(templateDir).toBe('DreamNode-template');
      
      // This would be used as: git init --template="${pluginPath}/${templateDir}"
    });

    it('should handle template placeholders', () => {
      // Template files should contain placeholders that get replaced
      const instructions = service.getManualInstructions('./template', './repo', 'Test Node');
      
      expect(instructions).toContain('Replace TEMPLATE_TITLE_PLACEHOLDER');
      expect(instructions).toContain('Test Node');
    });
  });
});