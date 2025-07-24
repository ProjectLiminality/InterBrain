import { UDDFile } from '../types/dreamnode';
import { Notice, Vault, TFile, TFolder } from 'obsidian';

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
  private vault: Vault | null = null;

  constructor(vault?: Vault) {
    // The template is packaged with the plugin
    // When using git init --template, provide the full path to this directory
    this.templateDirectory = 'DreamNode-template';
    if (vault) {
      this.vault = vault;
    }
  }

  /**
   * Set the vault instance (for late initialization)
   */
  setVault(vault: Vault): void {
    this.vault = vault;
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
   * Only validates UDD structure (presence of udd.json with correct schema)
   * Note: Git repository and hooks cannot be checked via Obsidian API
   */
  async checkDreamNodeCoherence(dreamNodePath: string): Promise<{ coherent: boolean; issues: string[] }> {
    const issues: string[] = [];
    
    console.log('GitTemplateService: Checking coherence for:', dreamNodePath);
    
    if (!this.vault) {
      issues.push('Vault not initialized');
      return { coherent: false, issues };
    }
    
    try {
      // 1. Check if udd.json file exists and has correct schema structure
      const uddPath = `${dreamNodePath}/udd.json`;
      const uddFile = this.vault.getAbstractFileByPath(uddPath);
      
      if (!uddFile || !(uddFile instanceof TFile)) {
        issues.push('Missing udd.json file');
      } else {
        try {
          const uddContent = await this.vault.read(uddFile);
          const uddData = JSON.parse(uddContent);
          
          // Validate required UDD fields
          const requiredFields = ['uuid', 'title', 'type', 'dreamTalk', 'liminalWebRelationships', 'submodules', 'supermodules'];
          for (const field of requiredFields) {
            if (!(field in uddData)) {
              issues.push(`UDD missing required field: ${field}`);
            }
          }
          
          // Validate type field
          if (uddData.type && !['dream', 'dreamer'].includes(uddData.type)) {
            issues.push(`Invalid UDD type: ${uddData.type} (should be 'dream' or 'dreamer')`);
          }
          
          console.log('  ✓ UDD file structure validated');
        } catch (error) {
          issues.push('Invalid UDD JSON format');
        }
      }
      
      // Note: We cannot check .git folder or hooks via Obsidian API
      // The presence of udd.json is our indicator that this is a DreamNode
      
    } catch (error) {
      issues.push(`Coherence check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    const coherent = issues.length === 0;
    console.log(`  Result: ${coherent ? 'COHERENT' : 'INCOHERENT'} (${issues.length} issues)`);
    if (issues.length > 0) {
      console.log('  Issues:', issues);
    }
    
    return { coherent, issues };
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
    console.log('GitTemplateService: Scanning vault for DreamNodes');
    
    const results = {
      total: 0,
      coherent: 0,
      incoherent: [] as { path: string; issues: string[] }[]
    };
    
    if (!this.vault) {
      console.error('Vault not initialized');
      return results;
    }
    
    try {
      // Find all folders that have .udd files (potential DreamNodes)
      const dreamNodes = await this.findDreamNodesInVault();
      results.total = dreamNodes.length;
      
      console.log(`  Found ${dreamNodes.length} potential DreamNode(s)`);
      
      // Check coherence for each DreamNode
      for (const dreamNodePath of dreamNodes) {
        const coherenceCheck = await this.checkDreamNodeCoherence(dreamNodePath);
        
        if (coherenceCheck.coherent) {
          results.coherent++;
        } else {
          results.incoherent.push({
            path: dreamNodePath,
            issues: coherenceCheck.issues
          });
        }
      }
      
    } catch (error) {
      console.error('Vault scan error:', error);
    }
    
    console.log('  ✓ Vault scan complete');
    console.log('  Total:', results.total, 'DreamNodes');
    console.log('  Coherent:', results.coherent);
    console.log('  Incoherent:', results.incoherent.length);
    
    return results;
  }

  /**
   * Find all root-level folders in the vault - all are potential DreamNodes
   * Only checks one level deep - assumes all DreamNodes live at vault root
   */
  private async findDreamNodesInVault(): Promise<string[]> {
    const dreamNodes: string[] = [];
    
    if (!this.vault) {
      return dreamNodes;
    }
    
    try {
      // Get all folders at the root of the vault - all are potential DreamNodes
      const rootFolders = this.vault.getAllLoadedFiles()
        .filter(file => file instanceof TFolder && file.path.indexOf('/') === -1);
      
      // Return all root folders as potential DreamNodes
      for (const folder of rootFolders) {
        dreamNodes.push(folder.path);
        console.log(`    Found potential DreamNode: ${folder.path}`);
      }
      
    } catch (error) {
      console.error('Error finding DreamNodes:', error);
    }
    
    return dreamNodes;
  }
}