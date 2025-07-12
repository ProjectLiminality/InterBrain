import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UIService } from './ui-service'

// Mock the Notice constructor globally
const mockNoticeHide = vi.fn()
global.Notice = vi.fn().mockImplementation(() => ({
  hide: mockNoticeHide,
}))

describe('UIService', () => {
  let uiService: UIService

  beforeEach(() => {
    uiService = new UIService()
    vi.clearAllMocks()
  })

  describe('showSuccess', () => {
    it('should create a Notice with success message', () => {
      const message = 'Operation successful!'
      
      uiService.showSuccess(message)
      
      expect(global.Notice).toHaveBeenCalledWith(message)
    })
  })

  describe('showError', () => {
    it('should create a Notice with error message and 5 second timeout', () => {
      const message = 'Something went wrong'
      
      uiService.showError(message)
      
      expect(global.Notice).toHaveBeenCalledWith(`Error: ${message}`, 5000)
    })

    it('should prefix message with "Error:"', () => {
      uiService.showError('test message')
      
      expect(global.Notice).toHaveBeenCalledWith('Error: test message', 5000)
    })
  })

  describe('showPlaceholder', () => {
    it('should create a Notice with placeholder message and 3 second timeout', () => {
      const message = 'Feature coming soon'
      
      uiService.showPlaceholder(message)
      
      expect(global.Notice).toHaveBeenCalledWith(`🚧 ${message}`, 3000)
    })

    it('should prefix message with construction emoji', () => {
      uiService.showPlaceholder('test placeholder')
      
      expect(global.Notice).toHaveBeenCalledWith('🚧 test placeholder', 3000)
    })
  })

  describe('showLoading', () => {
    it('should create a persistent Notice with loading message', () => {
      const message = 'Loading...'
      
      const notice = uiService.showLoading(message)
      
      expect(global.Notice).toHaveBeenCalledWith(message, 0)
      expect(notice).toHaveProperty('hide')
      expect(typeof notice.hide).toBe('function')
    })

    it('should return notice with hide method', () => {
      const notice = uiService.showLoading('Test loading')
      
      notice.hide()
      
      expect(mockNoticeHide).toHaveBeenCalled()
    })

    it('should create persistent notice (timeout = 0)', () => {
      uiService.showLoading('Persistent message')
      
      expect(global.Notice).toHaveBeenCalledWith('Persistent message', 0)
    })
  })
})