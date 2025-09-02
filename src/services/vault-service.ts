import { Vault, App } from 'obsidian';

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

  async createFolder(folderPath: string): Promise<void> {
    const fullPath = this.getFullPath(folderPath);
    try {
      fs.mkdirSync(fullPath, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create folder: ${folderPath} (${error})`);
    }
  }

  async fileExists(filePath: string): Promise<boolean> {
    console.log(`🔍 [VaultService] Checking if file exists: "${filePath}"`);
    
    const fullPath = this.getFullPath(filePath);
    console.log(`🔍 [VaultService] Using Node.js fs.existsSync: "${fullPath}"`);
    
    try {
      const exists = fs.existsSync(fullPath);
      console.log(`${exists ? '✅' : '❌'} [VaultService] File ${exists ? 'EXISTS' : 'NOT FOUND'}: "${fullPath}"`);
      return exists;
    } catch (error) {
      console.log(`❌ [VaultService] Error checking file: ${error}`);
      return false;
    }
  }

  async folderExists(path: string): Promise<boolean> {
    const fullPath = this.getFullPath(path);
    try {
      const stats = fs.lstatSync(fullPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  async readFile(path: string): Promise<string> {
    const fullPath = this.getFullPath(path);
    try {
      return fs.readFileSync(fullPath, 'utf8');
    } catch (error) {
      throw new Error(`File not found: ${path} (${error})`);
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const fullPath = this.getFullPath(filePath);
    try {
      // Ensure directory exists
      const dir = path.dirname(fullPath);
      fs.mkdirSync(dir, { recursive: true });
      
      // Write file
      fs.writeFileSync(fullPath, content, 'utf8');
    } catch (error) {
      throw new Error(`Failed to write file: ${filePath} (${error})`);
    }
  }

  async deleteFile(path: string): Promise<void> {
    const fullPath = this.getFullPath(path);
    try {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch (error) {
      throw new Error(`Failed to delete file: ${path} (${error})`);
    }
  }
}