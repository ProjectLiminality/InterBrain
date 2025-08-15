import { Command } from 'obsidian'
import { getModelManagerService } from '../services/model-manager-service'

/**
 * Command to download the Embedding embedding model
 */
export function createDownloadModelCommand(): Command {
  return {
    id: 'interbrain-download-embedding-model',
    name: 'Download Embedding Model',
    callback: async () => {
      console.log('🔄 Starting embedding model download...')
      
      try {
        // Check if model is already available
        const isAvailable = await getModelManagerService().isModelAvailable()
        if (isAvailable) {
          console.log('✅ Embedding model is already downloaded and available')
          console.log('💡 Use "(Re)download Embedding Model" to force a fresh download')
          return
        }

        const modelInfo = getModelManagerService().getModelInfo()
        console.log(`📥 Downloading ${modelInfo.name}...`)
        console.log(`📊 Model size: ${modelInfo.size} (${modelInfo.dimensions} dimensions)`)
        console.log(`🌐 Languages: ${modelInfo.languages.join(', ')}`)
        console.log('')

        // Start progress monitoring
        const progressInterval = globalThis.setInterval(() => {
          const progress = getModelManagerService().getDownloadProgress()
          
          if (progress.status === 'downloading') {
            const loaded = (progress.loaded / (1024 * 1024)).toFixed(1)
            const total = (progress.total / (1024 * 1024)).toFixed(1)
            console.log(`📊 Progress: ${progress.progress}% (${loaded}MB / ${total}MB) - ${progress.message}`)
          }
        }, 2000) // Update every 2 seconds

        // Start download
        await getModelManagerService().downloadModel(false)

        // Stop progress monitoring
        globalThis.clearInterval(progressInterval)

        const finalProgress = getModelManagerService().getDownloadProgress()
        
        if (finalProgress.status === 'complete') {
          console.log('🎉 Embedding model downloaded successfully!')
          console.log('✨ Real semantic search is now available')
          console.log('')
          console.log('💡 Try these commands next:')
          console.log('   • "Test Embedding Embedding Generation"')
          console.log('   • "Index Sample DreamNodes (Embedding)"')
          console.log('   • "Semantic Search Test (Embedding)"')
        } else {
          console.error(`❌ Download failed: ${finalProgress.error || 'Unknown error'}`)
        }

      } catch (error) {
        console.error('❌ Failed to download Embedding model:', error)
        console.log('💡 Try again or use "(Re)download Embedding Model" to force a fresh attempt')
      }
    }
  }
}

/**
 * Command to re-download (force download) the Embedding embedding model
 */
export function createRedownloadModelCommand(): Command {
  return {
    id: 'interbrain-redownload-qwen3-model',
    name: '(Re)download Embedding Embedding Model',
    callback: async () => {
      console.log('🔄 Starting Embedding model re-download...')
      console.log('🗑️ Clearing existing model cache first...')
      
      try {
        const modelInfo = getModelManagerService().getModelInfo()
        
        // Show model information
        console.log(`📥 Re-downloading ${modelInfo.name}...`)
        console.log(`📊 Model size: ${modelInfo.size} (${modelInfo.dimensions} dimensions)`)
        console.log(`🌐 Languages: ${modelInfo.languages.join(', ')}`)
        console.log('⚠️ This will replace any existing cached model')
        console.log('')

        // Start progress monitoring
        const progressInterval = globalThis.setInterval(() => {
          const progress = getModelManagerService().getDownloadProgress()
          
          if (progress.status === 'downloading') {
            const loaded = (progress.loaded / (1024 * 1024)).toFixed(1)
            const total = (progress.total / (1024 * 1024)).toFixed(1)
            console.log(`📊 Progress: ${progress.progress}% (${loaded}MB / ${total}MB) - ${progress.message}`)
          }
        }, 2000) // Update every 2 seconds

        // Force download (will clear cache first)
        await getModelManagerService().downloadModel(true)

        // Stop progress monitoring
        globalThis.clearInterval(progressInterval)

        const finalProgress = getModelManagerService().getDownloadProgress()
        
        if (finalProgress.status === 'complete') {
          console.log('🎉 Embedding model re-downloaded successfully!')
          console.log('✨ Fresh model is now available for semantic search')
          console.log('')
          console.log('💡 Try these commands next:')
          console.log('   • "Clear Semantic Search Index" (to rebuild with fresh model)')
          console.log('   • "Index Sample DreamNodes (Embedding)"')
          console.log('   • "Semantic Search Test (Embedding)"')
        } else {
          console.error(`❌ Re-download failed: ${finalProgress.error || 'Unknown error'}`)
        }

      } catch (error) {
        console.error('❌ Failed to re-download Embedding model:', error)
        console.log('💡 Check your internet connection and try again')
      }
    }
  }
}

/**
 * Command to show model status and information
 */
export function createModelStatusCommand(): Command {
  return {
    id: 'interbrain-qwen3-model-status',
    name: 'Show Embedding Model Status',
    callback: async () => {
      console.log('📋 Embedding Embedding Model Status')
      console.log('=' .repeat(40))
      
      try {
        const modelInfo = getModelManagerService().getModelInfo()
        const isAvailable = await getModelManagerService().isModelAvailable()
        const storageInfo = await getModelManagerService().getStorageInfo()
        const downloadProgress = getModelManagerService().getDownloadProgress()

        // Model Information
        console.log(`🤖 Model: ${modelInfo.name}`)
        console.log(`📊 Dimensions: ${modelInfo.dimensions}`)
        console.log(`📏 Context Length: ${modelInfo.contextLength.toLocaleString()}`)
        console.log(`🌐 Languages: ${modelInfo.languages.join(', ')}`)
        console.log(`💾 Size: ${modelInfo.size}`)
        console.log('')

        // Availability Status
        console.log(`📁 Model Status: ${isAvailable ? '✅ Available' : '❌ Not Downloaded'}`)
        
        if (isAvailable) {
          const storedModel = await getModelManagerService().getStoredModel()
          if (storedModel) {
            const downloadedAt = new Date(storedModel.metadata.downloadedAt)
            console.log(`📅 Downloaded: ${downloadedAt.toLocaleString()}`)
            console.log(`🔢 Version: ${storedModel.metadata.version}`)
            
            // Validate model integrity
            const isValid = await getModelManagerService().validateModel()
            console.log(`🔍 Integrity: ${isValid ? '✅ Valid' : '⚠️ Validation Failed'}`)
          }
        } else {
          console.log('💡 Run "Download Embedding Embedding Model" to get started')
        }

        console.log('')

        // Download Progress (if downloading)
        if (downloadProgress.status === 'downloading') {
          console.log(`📥 Download Status: ${downloadProgress.status.toUpperCase()}`)
          console.log(`📊 Progress: ${downloadProgress.progress}%`)
          console.log(`💬 Message: ${downloadProgress.message}`)
          console.log('')
        } else if (downloadProgress.status === 'error') {
          console.log(`❌ Last Download: FAILED`)
          console.log(`💬 Error: ${downloadProgress.error}`)
          console.log('')
        }

        // Storage Information
        console.log(`💾 Storage Usage:`)
        const usedMB = (storageInfo.totalUsed / (1024 * 1024)).toFixed(1)
        const availableMB = (storageInfo.totalAvailable / (1024 * 1024)).toFixed(1)
        console.log(`   Used: ${usedMB}MB / Available: ${availableMB}MB`)
        console.log(`   Usage: ${storageInfo.usagePercentage.toFixed(1)}%`)
        
        if (storageInfo.modelStored && storageInfo.modelSize) {
          const modelMB = (storageInfo.modelSize / (1024 * 1024)).toFixed(1)
          console.log(`   Model: ${modelMB}MB`)
        }

        console.log('')

        // Action Suggestions
        if (!isAvailable) {
          console.log('🎯 Available Actions:')
          console.log('   • "Download Embedding Embedding Model"')
        } else {
          console.log('🎯 Available Actions:')
          console.log('   • "(Re)download Embedding Embedding Model"')
          console.log('   • "Test Embedding Embedding Generation"')
          console.log('   • "Index Sample DreamNodes (Embedding)"')
          console.log('   • "Semantic Search Test (Embedding)"')
        }

      } catch (error) {
        console.error('❌ Failed to get model status:', error)
      }
    }
  }
}

/**
 * Command to cancel ongoing download
 */
export function createCancelDownloadCommand(): Command {
  return {
    id: 'interbrain-cancel-qwen3-download',
    name: 'Cancel Embedding Model Download',
    callback: () => {
      console.log('🛑 Cancelling Embedding model download...')
      
      const progress = getModelManagerService().getDownloadProgress()
      
      if (progress.status === 'downloading') {
        getModelManagerService().cancelDownload()
        console.log('✅ Download cancelled successfully')
        console.log('💡 You can restart the download anytime using "Download Embedding Embedding Model"')
      } else {
        console.log('ℹ️ No download in progress to cancel')
        console.log(`📊 Current status: ${progress.status.toUpperCase()}`)
      }
    }
  }
}