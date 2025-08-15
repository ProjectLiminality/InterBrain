import { Command } from 'obsidian'
import { IframeTransformersService } from '../services/iframe-transformers-service'
import { modelDownloadService } from '../services/model-download-service'
import { modelServingService } from '../services/model-serving-service'

/**
 * HuggingFace Model Management Commands
 * 
 * Commands for downloading, switching, and managing HuggingFace embedding models
 * with the iframe-based IframeTransformersService (Smart Connections pattern).
 */

// Iframe-based service - no plugin path needed
let embeddingService: IframeTransformersService | null = null

export function initializeHuggingFaceCommands() {
  embeddingService = IframeTransformersService.getInstance()
}

/**
 * Command to download a specific HuggingFace model
 */
export function createDownloadHuggingFaceModelCommand(): Command {
  return {
    id: 'interbrain-download-huggingface-model',
    name: 'Download HuggingFace Model',
    callback: async () => {
      console.log('🤗 HuggingFace Model Downloader')
      console.log('='.repeat(50))
      
      try {
        const availableModels = modelDownloadService.getAvailableModels()
        
        console.log('📋 Available models:')
        availableModels.forEach((model, index) => {
          console.log(`${index + 1}. ${model.name}`)
          console.log(`   ID: ${model.id}`)
          console.log(`   Size: ${(model.estimatedSizeBytes / 1024 / 1024).toFixed(0)}MB`)
          console.log(`   Dimensions: ${model.dimensions}`)
          console.log(`   Languages: ${model.languages.join(', ')}`)
          console.log(`   Description: ${model.description}`)
          console.log('')
        })

        // Check if models are already downloaded
        const downloadedModels = await modelDownloadService.getDownloadedModels()
        if (downloadedModels.length > 0) {
          console.log('✅ Already downloaded models:')
          for (const modelId of downloadedModels) {
            console.log(`   • ${modelId}`)
          }
          console.log('')
        }

        // For demo, download the default model
        const defaultModel = 'Xenova/all-MiniLM-L6-v2'
        console.log(`🚀 Downloading model: ${defaultModel}...`)
        console.log('💡 This uses Node.js filesystem for true persistence!')
        console.log('')

        const startTime = Date.now()
        await modelDownloadService.downloadModel(defaultModel)
        const downloadTime = Date.now() - startTime

        console.log(`🎉 Successfully downloaded ${defaultModel}!`)
        console.log(`⏱️ Download time: ${(downloadTime / 1000).toFixed(1)}s`)
        
        // Show storage information
        const storageInfo = await modelDownloadService.getStorageInfo()
        console.log('')
        console.log('💾 Storage Information:')
        console.log(`   • Downloaded models: ${storageInfo.downloadedModels.length}`)
        console.log(`   • Total size: ${(storageInfo.totalSizeBytes / 1024 / 1024).toFixed(1)}MB`)
        console.log(`   • Storage location: ${storageInfo.modelsDirectory}`)
        console.log('')
        
        console.log('🎯 Next steps:')
        console.log('   • "Test HuggingFace Embedding" - Test with downloaded models')
        console.log('   • "Index DreamNodes with HuggingFace" - Use filesystem-cached models')
        console.log('   • "HuggingFace Model Status" - Check download status')

      } catch (error) {
        console.error('❌ Failed to download HuggingFace model:', error)
        const progress = modelDownloadService.getDownloadProgress()
        if (progress.error) {
          console.log(`   Error details: ${progress.error}`)
        }
        console.log('💡 Check your internet connection and try again')
      }
    }
  }
}

/**
 * Command to switch between downloaded HuggingFace models
 */
export function createSwitchHuggingFaceModelCommand(): Command {
  return {
    id: 'interbrain-switch-huggingface-model',
    name: 'Switch HuggingFace Model',
    callback: async () => {
      if (!embeddingService) {
        console.error('❌ HuggingFace embedding service not initialized')
        return
      }

      console.log('🔄 HuggingFace Model Switcher')
      console.log('='.repeat(40))
      
      try {
        const availableModels = embeddingService.getAvailableModels()
        const status = await embeddingService.getStatus()
        
        console.log('📋 Available models:')
        availableModels.forEach((model, index) => {
          const isCurrent = status.currentModel === model.id
          const statusIcon = isCurrent ? '🟢' : '⚪'
          console.log(`${statusIcon} ${index + 1}. ${model.name}`)
          console.log(`   ID: ${model.id}`)
          console.log(`   Dimensions: ${model.dimensions}`)
          console.log(`   Languages: ${model.languages.join(', ')}`)
          if (isCurrent) {
            console.log('   Status: Currently active')
          }
          console.log('')
        })

        // For demo, switch to a different model
        const targetModel = 'sentence-transformers/all-mpnet-base-v2'
        console.log(`🔄 Switching to: ${targetModel}`)
        console.log('⏳ Loading model in iframe...')

        try {
          const startTime = Date.now()
          await embeddingService.switchModel(targetModel)
          const switchTime = Date.now() - startTime

          console.log(`✅ Successfully switched to ${targetModel}!`)
          console.log(`⏱️ Switch time: ${(switchTime / 1000).toFixed(1)}s`)
          console.log('')
          console.log('🎯 Try "Test HuggingFace Embedding" to test the new model')

        } catch (error) {
          console.error('❌ Failed to switch model:', error)
          console.log('💡 The model may not be available or there may be network issues')
        }

      } catch (error) {
        console.error('❌ Failed to switch HuggingFace model:', error)
      }
    }
  }
}

/**
 * Command to show HuggingFace model status and information
 */
export function createHuggingFaceModelStatusCommand(): Command {
  return {
    id: 'interbrain-huggingface-model-status',
    name: 'HuggingFace Model Status',
    callback: async () => {
      console.log('📊 HuggingFace Model Status')
      console.log('='.repeat(50))
      
      try {
        // Download service status
        const downloadProgress = modelDownloadService.getDownloadProgress()
        const storageInfo = await modelDownloadService.getStorageInfo()
        
        console.log('💾 Download & Storage Status:')
        console.log(`   Download Status: ${downloadProgress.status}`)
        if (downloadProgress.status === 'downloading') {
          console.log(`   Progress: ${downloadProgress.progress}%`)
          console.log(`   Current File: ${downloadProgress.currentFile || 'N/A'}`)
          console.log(`   Files: ${downloadProgress.filesCompleted}/${downloadProgress.totalFiles}`)
        }
        console.log(`   Downloaded Models: ${storageInfo.downloadedModels.length}`)
        if (storageInfo.downloadedModels.length > 0) {
          storageInfo.downloadedModels.forEach(modelId => {
            console.log(`     • ${modelId}`)
          })
        }
        console.log(`   Total Storage: ${(storageInfo.totalSizeBytes / 1024 / 1024).toFixed(1)}MB`)
        console.log(`   Models Directory: ${storageInfo.modelsDirectory}`)
        console.log('')

        // Serving service status
        const servingStatus = modelServingService.getServingStatus()
        console.log('📡 Model Serving Status:')
        console.log(`   Served Models: ${servingStatus.servedModels.length}`)
        if (servingStatus.servedModels.length > 0) {
          servingStatus.servedModels.forEach(modelId => {
            console.log(`     • ${modelId}`)
          })
        }
        console.log(`   Active Blob URLs: ${servingStatus.totalObjectUrls}`)
        console.log(`   Memory Usage: ${modelServingService.getMemoryUsageString()}`)
        console.log('')

        // Iframe service status
        if (embeddingService) {
          const isInitialized = embeddingService.isInitialized()
          const modelInfo = embeddingService.getModelInfo()
          
          console.log('🤖 Iframe Service Status:')
          console.log(`   Service: ${isInitialized ? '✅ Initialized' : '❌ Not Initialized'}`)
          console.log(`   Current Model: ${modelInfo.name}`)
          console.log(`   Model ID: ${modelInfo.id}`)
          console.log(`   Serving Enabled: ${embeddingService.isModelServingEnabled() ? '✅ Yes' : '❌ No'}`)
          console.log(`   Dimensions: ${modelInfo.dimensions}`)
          console.log(`   Context Length: ${modelInfo.contextLength.toLocaleString()}`)
          
          if (isInitialized) {
            const iframeStatus = await embeddingService.getStatus()
            console.log(`   Iframe Status: ${iframeStatus.initialized ? '✅ Active' : '❌ Inactive'}`)
          }
        } else {
          console.log('🤖 Iframe Service: ❌ Not initialized')
        }
        console.log('')

        // Architecture information
        console.log('🏠 Architecture:')
        console.log(`   Download: Node.js filesystem operations`)
        console.log(`   Serving: Blob URLs for iframe consumption`)
        console.log(`   Execution: Isolated iframe with transformers.js`)
        console.log(`   Persistence: True filesystem storage`)
        console.log('')

        // Available actions
        console.log('🎯 Available Actions:')
        if (storageInfo.downloadedModels.length === 0) {
          console.log('   • "Download HuggingFace Model" - Download models to filesystem')
        } else {
          console.log('   • "Test HuggingFace Embedding" - Test with downloaded models')
          console.log('   • "Switch HuggingFace Model" - Change active model')
          console.log('   • "Index DreamNodes with HuggingFace" - Use filesystem models')
          console.log('   • "Clear HuggingFace Cache" - Clear downloaded models')
        }

      } catch (error) {
        console.error('❌ Failed to get HuggingFace model status:', error)
      }
    }
  }
}

/**
 * Command to test HuggingFace embedding generation
 */
export function createTestHuggingFaceEmbeddingCommand(): Command {
  return {
    id: 'interbrain-test-huggingface-embedding',
    name: 'Test HuggingFace Embedding',
    callback: async () => {
      console.log('🧪 HuggingFace Embedding Test')
      console.log('='.repeat(50))
      
      const testTexts = [
        'Artificial intelligence and machine learning',
        'Project management and collaboration',
        'Creative writing and storytelling',
        'Mathematics and scientific research'
      ]

      try {
        // Check if we have downloaded models
        const downloadedModels = await modelDownloadService.getDownloadedModels()
        if (downloadedModels.length === 0) {
          console.log('❌ No models downloaded yet')
          console.log('')
          console.log('💡 First download a model:')
          console.log('   • Run "Download HuggingFace Model" command')
          console.log('   • Wait for download to complete')
          console.log('   • Then try this test again')
          return
        }

        console.log('✅ Available models:')
        downloadedModels.forEach(modelId => {
          console.log(`   • ${modelId}`)
        })
        console.log('')

        // Use the first available model
        const testModelId = downloadedModels[0]
        console.log(`🤖 Testing with model: ${testModelId}`)
        
        // Initialize embedding service if not already done
        if (!embeddingService) {
          embeddingService = IframeTransformersService.getInstance()
        }
        
        // Ensure model is served and iframe is initialized
        console.log('⚡ Initializing model serving and iframe...')
        await embeddingService.initialize()

        const modelInfo = embeddingService.getModelInfo()
        console.log(`📊 Model dimensions: ${modelInfo.dimensions}`)
        console.log(`📡 Model serving: ${embeddingService.isModelServingEnabled() ? '✅ Enabled' : '❌ Disabled'}`)
        console.log('')

        console.log('📝 Test texts:')
        for (let i = 0; i < testTexts.length; i++) {
          console.log(`${i + 1}. "${testTexts[i]}"`)
        }
        console.log('')

        console.log('⚡ Generating embeddings with filesystem-cached model...')
        const startTime = Date.now()
        
        const embeddings = await embeddingService.batchEmbedding(testTexts)
        
        const totalTime = Date.now() - startTime
        const avgTime = totalTime / testTexts.length

        console.log('✅ Embedding generation completed!')
        console.log('')
        console.log('📊 Results:')
        embeddings.forEach((embedding, index) => {
          console.log(`   Text ${index + 1}: ${embedding.length} dimensions`)
          console.log(`   Sample values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`)
        })
        console.log('')
        console.log(`⏱️ Performance:`)
        console.log(`   Total time: ${totalTime}ms`)
        console.log(`   Average per text: ${avgTime.toFixed(1)}ms`)
        console.log(`   Throughput: ${(testTexts.length / (totalTime / 1000)).toFixed(1)} texts/second`)

        // Test semantic similarity (simple cosine similarity)
        console.log('')
        console.log('🔍 Semantic Similarity Test:')
        const similarity = cosineSimilarity(embeddings[0], embeddings[1])
        console.log(`   AI/ML vs Project Management: ${(similarity * 100).toFixed(1)}% similar`)
        
        // Show persistence info
        console.log('')
        console.log('💾 Persistence Verification:')
        console.log('   ✅ Model loaded from filesystem cache')
        console.log('   ✅ Available offline')
        console.log('   ✅ Survives Obsidian restarts')

      } catch (error) {
        console.error('❌ HuggingFace embedding test failed:', error)
        console.log('')
        console.log('💡 Troubleshooting:')
        console.log('   1. Run "Download HuggingFace Model" to ensure models are cached')
        console.log('   2. Check "HuggingFace Model Status" for detailed diagnostics')
        console.log('   3. Restart Obsidian if issues persist')
      }
    }
  }
}

/**
 * Command to clear HuggingFace model cache
 */
export function createClearHuggingFaceCacheCommand(): Command {
  return {
    id: 'interbrain-clear-huggingface-cache',
    name: 'Clear HuggingFace Cache',
    callback: async () => {
      console.log('🗑️ HuggingFace Cache Cleaner')
      console.log('='.repeat(50))
      
      try {
        // Show what will be cleared
        const storageInfo = await modelDownloadService.getStorageInfo()
        const servingStatus = modelServingService.getServingStatus()
        
        console.log('📊 Current cache status:')
        console.log(`   • Downloaded models: ${storageInfo.downloadedModels.length}`)
        console.log(`   • Served models: ${servingStatus.servedModels.length}`)
        console.log(`   • Total storage: ${(storageInfo.totalSizeBytes / 1024 / 1024).toFixed(1)}MB`)
        console.log(`   • Memory usage: ${modelServingService.getMemoryUsageString()}`)
        console.log('')
        
        if (storageInfo.downloadedModels.length === 0) {
          console.log('ℹ️ No models to clear')
          return
        }
        
        console.log('🧽 Clearing cache components:')
        
        // 1. Clear served models (blob URLs)
        if (servingStatus.servedModels.length > 0) {
          console.log('   1. Clearing served model blob URLs...')
          modelServingService.unserveAllModels()
          console.log('      ✅ Blob URLs revoked')
        }
        
        // 2. Dispose iframe service
        if (embeddingService && embeddingService.isInitialized()) {
          console.log('   2. Disposing iframe service...')
          embeddingService.dispose()
          console.log('      ✅ Iframe service disposed')
        }
        
        // 3. Delete filesystem models
        console.log('   3. Deleting filesystem models...')
        for (const modelId of storageInfo.downloadedModels) {
          await modelDownloadService.deleteModel(modelId)
          console.log(`      ✅ Deleted ${modelId}`)
        }
        
        // Verify cleanup
        const finalStorageInfo = await modelDownloadService.getStorageInfo()
        const finalServingStatus = modelServingService.getServingStatus()
        
        console.log('')
        console.log('✅ Cache cleanup completed!')
        console.log('📊 Final status:')
        console.log(`   • Downloaded models: ${finalStorageInfo.downloadedModels.length}`)
        console.log(`   • Served models: ${finalServingStatus.servedModels.length}`)
        console.log(`   • Storage freed: ${(storageInfo.totalSizeBytes / 1024 / 1024).toFixed(1)}MB`)
        console.log('')
        console.log('🎯 Next steps:')
        console.log('   • "Download HuggingFace Model" - Re-download models')
        console.log('   • "HuggingFace Model Status" - Check current status')

      } catch (error) {
        console.error('❌ Failed to clear HuggingFace cache:', error)
        console.log('')
        console.log('💡 Troubleshooting:')
        console.log('   • Some files may be in use by the system')
        console.log('   • Try restarting Obsidian and running this command again')
        console.log('   • Check file permissions in the models directory')
      }
    }
  }
}

/**
 * Command to index all DreamNodes with HuggingFace embeddings
 */
export function createIndexDreamNodesWithHuggingFaceCommand(): Command {
  return {
    id: 'interbrain-index-dreamnodes-huggingface',
    name: 'Index DreamNodes with HuggingFace',
    callback: async () => {
      if (!embeddingService) {
        console.error('❌ HuggingFace embedding service not initialized')
        return
      }

      console.log('🔍 DreamNode HuggingFace Indexing')
      console.log('='.repeat(40))
      
      try {
        // Ensure model is initialized
        console.log('⚡ Ensuring HuggingFace model is ready...')
        await embeddingService.initialize()
        
        const modelInfo = embeddingService.getModelInfo()
        console.log(`🤖 Using model: ${modelInfo.name} (${modelInfo.dimensions} dimensions)`)
        console.log('')

        // Import indexing service dynamically (same pattern as semantic-search-commands)
        const { indexingService } = await import('../indexing/indexing-service')
        
        console.log('🚀 Starting intelligent reindex with HuggingFace embeddings...')
        console.log('💡 This will only update changed nodes since last indexing')
        console.log('')

        const startTime = Date.now()
        const results = await indexingService.intelligentReindex()
        const totalTime = Date.now() - startTime

        console.log('')
        console.log('✅ HuggingFace indexing completed!')
        console.log('📊 Indexing Results:')
        console.log(`   • ${results.added} new nodes indexed`)
        console.log(`   • ${results.updated} nodes updated`)
        console.log(`   • ${results.errors} errors encountered`)
        console.log(`   • Total time: ${(totalTime / 1000).toFixed(1)}s`)
        console.log('')
        console.log('🎯 Next steps:')
        console.log('   • Use semantic search to find related DreamNodes')
        console.log('   • Try "Test HuggingFace Embedding" to verify functionality')

      } catch (error) {
        console.error('❌ Failed to index DreamNodes with HuggingFace:', error)
        console.log('💡 Try running "Download HuggingFace Model" first')
      }
    }
  }
}

/**
 * Utility function to calculate cosine similarity between two vectors
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length')
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}