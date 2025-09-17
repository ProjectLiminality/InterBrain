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

  getVaultPath(): string {
    return this.vaultPath;
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
    const fullPath = this.getFullPath(filePath);
    try {
      return fs.existsSync(fullPath);
    } catch (error) {
      console.error(`Error checking file existence: ${error}`);
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

  async readFileAsDataURL(filePath: string): Promise<string> {
    const fullPath = this.getFullPath(filePath);
    try {
      const buffer = fs.readFileSync(fullPath);
      const mimeType = this.getMimeType(filePath);
      const base64 = buffer.toString('base64');
      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      throw new Error(`Failed to read file as data URL: ${filePath} (${error})`);
    }
  }

  private getMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();

    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'mp4':
        return 'video/mp4';
      case 'webm':
        return 'video/webm';
      case 'mp3':
        return 'audio/mp3';
      case 'wav':
        return 'audio/wav';
      case 'ogg':
        return 'audio/ogg';
      case 'pdf':
        return 'application/pdf';
      default:
        return 'application/octet-stream';
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