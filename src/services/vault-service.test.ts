import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VaultService } from './vault-service'
import { TFile, TFolder } from 'obsidian'

import type { Vault } from 'obsidian'

describe('VaultService', () => {
  let vaultService: VaultService
  let mockVault: Partial<Vault>

  beforeEach(() => {
    mockVault = {
      createFolder: vi.fn(),
      getAbstractFileByPath: vi.fn(),
      read: vi.fn(),
      create: vi.fn(),
      modify: vi.fn(),
      delete: vi.fn(),
    }
    
    vaultService = new VaultService(mockVault as Vault)
    vi.clearAllMocks()
  })

  describe('createFolder', () => {
    it('should call vault.createFolder with path', async () => {
      const path = '/test/folder'
      
      await vaultService.createFolder(path)
      
      expect(mockVault.createFolder).toHaveBeenCalledWith(path)
    })
  })

  describe('fileExists', () => {
    it('should return true when file exists', async () => {
      const path = '/test/file.txt'
      mockVault.getAbstractFileByPath.mockReturnValue(new TFile(path))
      
      const exists = await vaultService.fileExists(path)
      
      expect(exists).toBe(true)
      expect(mockVault.getAbstractFileByPath).toHaveBeenCalledWith(path)
    })

    it('should return false when file does not exist', async () => {
      const path = '/nonexistent/file.txt'
      mockVault.getAbstractFileByPath.mockReturnValue(null)
      
      const exists = await vaultService.fileExists(path)
      
      expect(exists).toBe(false)
    })

    it('should return false when path is a folder', async () => {
      const path = '/test/folder'
      mockVault.getAbstractFileByPath.mockReturnValue(new TFolder(path))
      
      const exists = await vaultService.fileExists(path)
      
      expect(exists).toBe(false)
    })
  })

  describe('folderExists', () => {
    it('should return true when folder exists', async () => {
      const path = '/test/folder'
      mockVault.getAbstractFileByPath.mockReturnValue(new TFolder(path))
      
      const exists = await vaultService.folderExists(path)
      
      expect(exists).toBe(true)
    })

    it('should return false when folder does not exist', async () => {
      const path = '/nonexistent/folder'
      mockVault.getAbstractFileByPath.mockReturnValue(null)
      
      const exists = await vaultService.folderExists(path)
      
      expect(exists).toBe(false)
    })

    it('should return false when path is a file', async () => {
      const path = '/test/file.txt'
      mockVault.getAbstractFileByPath.mockReturnValue(new TFile(path))
      
      const exists = await vaultService.folderExists(path)
      
      expect(exists).toBe(false)
    })
  })

  describe('readFile', () => {
    it('should read file content when file exists', async () => {
      const path = '/test/file.txt'
      const content = 'test content'
      const mockFile = new TFile(path)
      
      mockVault.getAbstractFileByPath.mockReturnValue(mockFile)
      mockVault.read.mockResolvedValue(content)
      
      const result = await vaultService.readFile(path)
      
      expect(result).toBe(content)
      expect(mockVault.read).toHaveBeenCalledWith(mockFile)
    })

    it('should throw error when file does not exist', async () => {
      const path = '/nonexistent/file.txt'
      mockVault.getAbstractFileByPath.mockReturnValue(null)
      
      await expect(vaultService.readFile(path)).rejects.toThrow('File not found: /nonexistent/file.txt')
    })

    it('should throw error when path is a folder', async () => {
      const path = '/test/folder'
      mockVault.getAbstractFileByPath.mockReturnValue(new TFolder(path))
      
      await expect(vaultService.readFile(path)).rejects.toThrow('File not found: /test/folder')
    })
  })

  describe('writeFile', () => {
    it('should modify existing file', async () => {
      const path = '/test/file.txt'
      const content = 'new content'
      const mockFile = new TFile(path)
      
      mockVault.getAbstractFileByPath.mockReturnValue(mockFile)
      
      await vaultService.writeFile(path, content)
      
      expect(mockVault.modify).toHaveBeenCalledWith(mockFile, content)
      expect(mockVault.create).not.toHaveBeenCalled()
    })

    it('should create new file when file does not exist', async () => {
      const path = '/test/newfile.txt'
      const content = 'new content'
      
      mockVault.getAbstractFileByPath.mockReturnValue(null)
      
      await vaultService.writeFile(path, content)
      
      expect(mockVault.create).toHaveBeenCalledWith(path, content)
      expect(mockVault.modify).not.toHaveBeenCalled()
    })
  })

  describe('deleteFile', () => {
    it('should delete existing file', async () => {
      const path = '/test/file.txt'
      const mockFile = new TFile(path)
      
      mockVault.getAbstractFileByPath.mockReturnValue(mockFile)
      
      await vaultService.deleteFile(path)
      
      expect(mockVault.delete).toHaveBeenCalledWith(mockFile)
    })

    it('should do nothing when file does not exist', async () => {
      const path = '/nonexistent/file.txt'
      mockVault.getAbstractFileByPath.mockReturnValue(null)
      
      await vaultService.deleteFile(path)
      
      expect(mockVault.delete).not.toHaveBeenCalled()
    })

    it('should do nothing when path is a folder', async () => {
      const path = '/test/folder'
      mockVault.getAbstractFileByPath.mockReturnValue(new TFolder(path))
      
      await vaultService.deleteFile(path)
      
      expect(mockVault.delete).not.toHaveBeenCalled()
    })
  })
})