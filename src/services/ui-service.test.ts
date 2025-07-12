import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UIService } from './ui-service'

// Mock obsidian module with factory function
vi.mock('obsidian', () => {
  const mockNoticeHide = vi.fn()
  const mockNotice = vi.fn().mockImplementation(() => ({
    hide: mockNoticeHide,
  }))
  
  return {
    Notice: mockNotice
  }
})

describe('UIService', () => {
  let uiService: UIService

  beforeEach(async () => {
    uiService = new UIService()
    vi.clearAllMocks()
  })

  describe('showSuccess', () => {
    it('should create a Notice with success message', async () => {
      const message = 'Operation successful!'
      const { Notice } = await import('obsidian')
      
      uiService.showSuccess(message)
      
      expect(Notice).toHaveBeenCalledWith(message)
    })
  })

  describe('showError', () => {
    it('should create a Notice with error message and 5 second timeout', async () => {
      const message = 'Something went wrong'
      const { Notice } = await import('obsidian')
      
      uiService.showError(message)
      
      expect(Notice).toHaveBeenCalledWith(`Error: ${message}`, 5000)
    })

    it('should prefix message with "Error:"', async () => {
      const { Notice } = await import('obsidian')
      
      uiService.showError('test message')
      
      expect(Notice).toHaveBeenCalledWith('Error: test message', 5000)
    })
  })

  describe('showPlaceholder', () => {
    it('should create a Notice with placeholder message and 3 second timeout', async () => {
      const message = 'Feature coming soon'
      const { Notice } = await import('obsidian')
      
      uiService.showPlaceholder(message)
      
      expect(Notice).toHaveBeenCalledWith(`🚧 ${message}`, 3000)
    })

    it('should prefix message with construction emoji', async () => {
      const { Notice } = await import('obsidian')
      
      uiService.showPlaceholder('test placeholder')
      
      expect(Notice).toHaveBeenCalledWith('🚧 test placeholder', 3000)
    })
  })

  describe('showLoading', () => {
    it('should create a persistent Notice with loading message', async () => {
      const message = 'Loading...'
      const { Notice } = await import('obsidian')
      
      const notice = uiService.showLoading(message)
      
      expect(Notice).toHaveBeenCalledWith(message, 0)
      expect(notice).toHaveProperty('hide')
      expect(typeof notice.hide).toBe('function')
    })

    it('should return notice with hide method', async () => {
      const notice = uiService.showLoading('Test loading')
      
      notice.hide()
      
      // The hide method should exist and be callable
      expect(typeof notice.hide).toBe('function')
    })

    it('should create persistent notice (timeout = 0)', async () => {
      const { Notice } = await import('obsidian')
      
      uiService.showLoading('Persistent message')
      
      expect(Notice).toHaveBeenCalledWith('Persistent message', 0)
    })
  })
})