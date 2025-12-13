import { Vault, App } from 'obsidian';

// Access Node.js modules directly in Electron context
// VaultService is the ONLY place that should import fs directly
// All other code should use VaultService methods
const fs = require('fs');
const fsPromises = fs.promises;
const nodePath = require('path');

/**
 * Directory entry returned by readdir with file types
 */
export interface VaultDirEntry {
  name: string;
  isDirectory: () => boolean;
  isFile: () => boolean;
}

/**
 * File stats returned by stat
 */
export interface VaultFileStats {
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  mtime: Date;
}

export class VaultService {
  private vaultPath: string = '';
  
  constructor(private vault: Vault, private app?: App) {
    if (app) {
      this.initializeVaultPath(app);
    }
  }
  
  private initializeVaultPath(app: App): void {
    // Get vault file system path for Node.js fs operations (same pattern as GitService)
    const adapter = app.vault.adapter as { path?: string; basePath?: string };
    
    let vaultPath = '';
    if (typeof adapter.path === 'string') {
      vaultPath = adapter.path;
    } else if (typeof adapter.basePath === 'string') {
      vaultPath = adapter.basePath;
    } else if (adapter.path && typeof adapter.path === 'object') {
      const pathObj = adapter.path as Record<string, string>;
      vaultPath = pathObj.path || pathObj.basePath || '';
    }
    
    this.vaultPath = vaultPath;
  }
  
  /**
   * Convert a relative vault path to an absolute file system path.
   * Useful for external code that needs to perform direct file operations.
   */
  getFullPath(filePath: string): string {
    if (!this.vaultPath) {
      console.warn('VaultService: Vault path not initialized, using relative path');
      return filePath;
    }
    return nodePath.join(this.vaultPath, filePath);
  }

  /**
   * Join path segments (wrapper for path.join)
   */
  joinPath(...segments: string[]): string {
    return nodePath.join(...segments);
  }

  /**
   * Get directory name from path
   */
  dirname(filePath: string): string {
    return nodePath.dirname(filePath);
  }

  /**
   * Get base name from path
   */
  basename(filePath: string): string {
    return nodePath.basename(filePath);
  }

  /**
   * Get file extension
   */
  extname(filePath: string): string {
    return nodePath.extname(filePath);
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
      const dir = nodePath.dirname(fullPath);
      fs.mkdirSync(dir, { recursive: true });

      // Write file
      fs.writeFileSync(fullPath, content, 'utf8');
    } catch (error) {
      throw new Error(`Failed to write file: ${filePath} (${error})`);
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    const fullPath = this.getFullPath(filePath);
    try {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch (error) {
      throw new Error(`Failed to delete file: ${filePath} (${error})`);
    }
  }

  /**
   * Delete a directory recursively
   */
  async deleteFolder(folderPath: string): Promise<void> {
    const fullPath = this.getFullPath(folderPath);
    try {
      await fsPromises.rm(fullPath, { recursive: true, force: true });
    } catch (error) {
      throw new Error(`Failed to delete folder: ${folderPath} (${error})`);
    }
  }

  /**
   * Rename/move a file or folder
   */
  async rename(oldPath: string, newPath: string): Promise<void> {
    const fullOldPath = this.getFullPath(oldPath);
    const fullNewPath = this.getFullPath(newPath);
    try {
      await fsPromises.rename(fullOldPath, fullNewPath);
    } catch (error) {
      throw new Error(`Failed to rename ${oldPath} to ${newPath} (${error})`);
    }
  }

  /**
   * Read directory contents with file type information
   */
  async readdir(dirPath: string): Promise<VaultDirEntry[]> {
    const fullPath = this.getFullPath(dirPath);
    try {
      const entries = await fsPromises.readdir(fullPath, { withFileTypes: true });
      return entries.map((entry: any) => ({
        name: entry.name,
        isDirectory: () => entry.isDirectory(),
        isFile: () => entry.isFile()
      }));
    } catch (error) {
      throw new Error(`Failed to read directory: ${dirPath} (${error})`);
    }
  }

  /**
   * Get file/folder statistics
   */
  async stat(filePath: string): Promise<VaultFileStats> {
    const fullPath = this.getFullPath(filePath);
    try {
      const stats = await fsPromises.stat(fullPath);
      return {
        size: stats.size,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        mtime: stats.mtime
      };
    } catch (error) {
      throw new Error(`Failed to stat: ${filePath} (${error})`);
    }
  }

  /**
   * Write binary data to file
   */
  async writeFileBuffer(filePath: string, buffer: ArrayBuffer | Uint8Array): Promise<void> {
    const fullPath = this.getFullPath(filePath);
    try {
      const dir = nodePath.dirname(fullPath);
      fs.mkdirSync(dir, { recursive: true });
      await fsPromises.writeFile(fullPath, globalThis.Buffer.from(buffer));
    } catch (error) {
      throw new Error(`Failed to write binary file: ${filePath} (${error})`);
    }
  }

  /**
   * Read file as ArrayBuffer (for binary data)
   */
  async readFileBuffer(filePath: string): Promise<ArrayBuffer> {
    const fullPath = this.getFullPath(filePath);
    try {
      const buffer = await fsPromises.readFile(fullPath);
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    } catch (error) {
      throw new Error(`Failed to read binary file: ${filePath} (${error})`);
    }
  }

  /**
   * Read directory at vault root level
   * Convenience method for scanning top-level directories
   */
  async readdirRoot(): Promise<VaultDirEntry[]> {
    return this.readdir('');
  }
}