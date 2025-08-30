import { Vault, TFile, TFolder, App } from 'obsidian';

// Access Node.js modules directly in Electron context (following GitService pattern)
/* eslint-disable no-undef */
const fs = require('fs');
const path = require('path');
/* eslint-enable no-undef */

export class VaultService {
  private vaultPath: string = '';
  
  constructor(private vault: Vault, private app?: App) {
    if (app) {
      this.initializeVaultPath(app);
    }
  }
  
  private initializeVaultPath(app: App): void {
    // Get vault file system path for Node.js fs operations (same pattern as GitService)
    const adapter = app.vault.adapter as any;
    
    let vaultPath = '';
    if (typeof adapter.path === 'string') {
      vaultPath = adapter.path;
    } else if (typeof adapter.basePath === 'string') {
      vaultPath = adapter.basePath;
    } else if (adapter.path && typeof adapter.path === 'object') {
      vaultPath = adapter.path.path || adapter.path.basePath || '';
    }
    
    this.vaultPath = vaultPath;
    console.log('VaultService: Vault path:', this.vaultPath);
  }
  
  private getFullPath(filePath: string): string {
    if (!this.vaultPath) {
      console.warn('VaultService: Vault path not initialized, using relative path');
      return filePath;
    }
    return path.join(this.vaultPath, filePath);
  }
  
  get obsidianVault() {
    return this.vault;
  }

  async createFolder(path: string): Promise<void> {
    await this.vault.createFolder(path);
  }

  async fileExists(filePath: string): Promise<boolean> {
    console.log(`🔍 [VaultService] Checking if file exists: "${filePath}"`);
    
    // For hidden files (starting with .), use Node.js fs API
    if (filePath.includes('/.') || filePath.startsWith('.')) {
      const fullPath = this.getFullPath(filePath);
      console.log(`🔍 [VaultService] Hidden file detected, using fs.existsSync: "${fullPath}"`);
      
      try {
        const exists = fs.existsSync(fullPath);
        console.log(`${exists ? '✅' : '❌'} [VaultService] Hidden file ${exists ? 'EXISTS' : 'NOT FOUND'}: "${fullPath}"`);
        return exists;
      } catch (error) {
        console.log(`❌ [VaultService] Error checking hidden file: ${error}`);
        return false;
      }
    }
    
    // For regular files, use Obsidian's vault API
    const file = this.vault.getAbstractFileByPath(filePath);
    const exists = file instanceof TFile;
    console.log(`${exists ? '✅' : '❌'} [VaultService] Regular file ${exists ? 'EXISTS' : 'NOT FOUND'}: "${filePath}" (type: ${file ? file.constructor.name : 'null'})`);
    return exists;
  }

  async folderExists(path: string): Promise<boolean> {
    const folder = this.vault.getAbstractFileByPath(path);
    return folder instanceof TFolder;
  }

  async readFile(path: string): Promise<string> {
    const file = this.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      throw new Error(`File not found: ${path}`);
    }
    return await this.vault.read(file);
  }

  async writeFile(path: string, content: string): Promise<void> {
    const file = this.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.vault.modify(file, content);
    } else {
      await this.vault.create(path, content);
    }
  }

  async deleteFile(path: string): Promise<void> {
    const file = this.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.vault.delete(file);
    }
  }
}