import { Vault, TFile, TFolder } from 'obsidian';

export class VaultService {
  constructor(private vault: Vault) {}

  async createFolder(path: string): Promise<void> {
    await this.vault.createFolder(path);
  }

  async fileExists(path: string): Promise<boolean> {
    const file = this.vault.getAbstractFileByPath(path);
    return file instanceof TFile;
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