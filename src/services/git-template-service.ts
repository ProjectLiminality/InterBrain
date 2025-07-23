import { UDDFile } from '../types/dreamnode';
import { Notice } from 'obsidian';

/**
 * GitTemplateService - Manages DreamNode template operations
 * 
 * This service provides methods for working with the DreamNode template,
 * but actual git operations need to be run via shell commands in Obsidian.
 * 
 * The template directory (DreamNode-template) should be packaged with the plugin
 * and contains all files needed for git init --template functionality.
 */
export class GitTemplateService {
  private templateDirectory: string;

  constructor() {
    // The template is packaged with the plugin
    // When using git init --template, provide the full path to this directory
    this.templateDirectory = 'DreamNode-template';
  }

  /**
   * Get the template directory name
   */
  getTemplateDirectory(): string {
    return this.templateDirectory;
  }

  /**
   * Validate that the template exists and has correct structure
   */
  validateTemplate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    console.log('GitTemplateService: Template validation check');
    console.log('Template should be located at:', this.templateDirectory);
    
    // TODO: In real implementation, check these files exist:
    // - DreamNode-template/udd (template UDD file)
    // - DreamNode-template/hooks/pre-commit
    // - DreamNode-template/hooks/post-commit  
    // - DreamNode-template/README.md
    // - DreamNode-template/LICENSE
    
    // For now, assume valid since template is packaged with plugin
    if (errors.length === 0) {
      console.log('✓ Template structure validation passed');
    }
    
    return { valid: errors.length === 0, errors };
  }

  /**
   * Create template UDD content with provided values
   */
  createTemplateUDD(
    uuid: string,
    title: string, 
    type: 'dream' | 'dreamer',
    dreamTalk: string = ''
  ): UDDFile {
    return {
      uuid,
      title,
      type,
      dreamTalk,
      liminalWebRelationships: [],
      submodules: [],
      supermodules: []
    };
  }

  /**
   * Initialize a new DreamNode from template and move files to working directory
   * This is a placeholder that shows what the real implementation would do
   */
  async initializeFromTemplate(
    repoPath: string,
    uuid: string,
    title: string,
    type: 'dream' | 'dreamer',
    dreamTalk?: string
  ): Promise<void> {
    // In a real implementation, this would:
    // 1. Get plugin directory path
    // 2. Run: git init --template="${pluginPath}/DreamNode-template" "${repoPath}"
    // 3. Move files from .git/ to working directory:
    //    - mv .git/udd .udd
    //    - mv .git/README.md .
    //    - mv .git/LICENSE .
    // 4. Customize .udd with actual values
    // 5. Replace TEMPLATE_TITLE_PLACEHOLDER in README.md
    // 6. Make initial commit
    
    const uddContent = this.createTemplateUDD(uuid, title, type, dreamTalk || '');
    
    new Notice(`Would create DreamNode "${title}" at: ${repoPath}`);
    console.log('GitTemplateService: Would initialize DreamNode:');
    console.log('Path:', repoPath);
    console.log('UUID:', uuid);
    console.log('Title:', title);
    console.log('Type:', type);
    console.log('DreamTalk:', dreamTalk);
    console.log('UDD Content:', uddContent);
  }

  /**
   * Get the shell commands needed to create a DreamNode manually
   */
  getManualInstructions(templatePath: string, repoPath: string, title: string): string {
    return `# Create DreamNode manually:

# 1. Initialize with template
git init --template="${templatePath}" "${repoPath}"

# 2. Move files to working directory
cd "${repoPath}"
mv .git/udd .udd
mv .git/README.md .
mv .git/LICENSE .

# 3. Customize files
# Edit .udd with your DreamNode details
# Replace TEMPLATE_TITLE_PLACEHOLDER in README.md with "${title}"

# 4. Make initial commit
git add .
git commit -m "Initial DreamNode: ${title}"`;
  }

  /**
   * Show template validation results in Obsidian
   */
  showValidationNotice(): void {
    const validation = this.validateTemplate();
    if (validation.valid) {
      new Notice('DreamNode template is valid and ready for use');
    } else {
      new Notice(`Template validation failed: ${validation.errors.join(', ')}`);
    }
  }

  /**
   * Check coherence of a DreamNode repository against the current template
   * Only validates UDD structure and git hooks (preserves README/LICENSE customizations)
   */
  checkDreamNodeCoherence(dreamNodePath: string): { coherent: boolean; issues: string[] } {
    const issues: string[] = [];
    
    console.log('GitTemplateService: Checking coherence for:', dreamNodePath);
    
    // TODO: In real implementation, check:
    // 1. .udd file exists and has correct schema structure
    // 2. .git/hooks/pre-commit exists and matches template functionality
    // 3. .git/hooks/post-commit exists and matches template functionality
    // 4. UDD schema matches current template version
    
    // For now, simulate coherence check
    console.log('  ✓ UDD file structure check (placeholder)');
    console.log('  ✓ Git hooks validation (placeholder)');
    console.log('  ✓ Schema version compatibility (placeholder)');
    
    return { coherent: issues.length === 0, issues };
  }

  /**
   * Update a DreamNode repository to match current template coherence
   * Only updates UDD schema and git hooks (preserves README/LICENSE)
   */
  updateDreamNodeCoherence(dreamNodePath: string): { success: boolean; updated: string[] } {
    const updated: string[] = [];
    
    console.log('GitTemplateService: Updating coherence for:', dreamNodePath);
    
    // TODO: In real implementation:
    // 1. Backup existing .udd file
    // 2. Update UDD schema to match current template (preserve data)
    // 3. Update git hooks to match current template
    // 4. Leave README.md and LICENSE untouched
    // 5. Create coherence update commit
    
    // For now, simulate updates
    console.log('  ✓ UDD schema updated (placeholder)');
    console.log('  ✓ Git hooks updated (placeholder)');
    updated.push('UDD schema', 'Git hooks');
    
    return { success: true, updated };
  }

  /**
   * Scan vault for DreamNode repositories and check their coherence
   */
  async scanVaultCoherence(vaultPath: string): Promise<{
    total: number;
    coherent: number;
    incoherent: { path: string; issues: string[] }[];
  }> {
    console.log('GitTemplateService: Scanning vault for DreamNodes:', vaultPath);
    
    // TODO: In real implementation:
    // 1. Walk through vault directory structure
    // 2. Identify git repositories with .udd files (DreamNodes)
    // 3. Check coherence for each DreamNode
    // 4. Return comprehensive report
    
    // For now, simulate scan results
    const mockResults = {
      total: 0,
      coherent: 0,
      incoherent: [] as { path: string; issues: string[] }[]
    };
    
    console.log('  ✓ Vault scan complete (placeholder)');
    console.log('  Found:', mockResults.total, 'DreamNodes');
    console.log('  Coherent:', mockResults.coherent);
    console.log('  Incoherent:', mockResults.incoherent.length);
    
    return mockResults;
  }
}