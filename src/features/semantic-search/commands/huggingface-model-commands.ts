import { Command } from 'obsidian'
import { IframeTransformersService } from '../services/iframe-transformers-service'

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
      if (!embeddingService) {
        console.error('❌ HuggingFace embedding service not initialized')
        return
      }

      console.log('🤗 HuggingFace Model Downloader')
      console.log('='.repeat(40))
      
      try {
        const availableModels = embeddingService.getAvailableModels()
        
        console.log('📋 Available models:')
        availableModels.forEach((model, index) => {
          console.log(`${index + 1}. ${model.name}`)
          console.log(`   ID: ${model.id}`)
          console.log(`   Dimensions: ${model.dimensions}`)
          console.log(`   Languages: ${model.languages.join(', ')}`)
          console.log(`   Description: ${model.description}`)
          console.log('')
        })

        // Initialize the iframe embedding service
        console.log(`🚀 Initializing iframe-based transformers.js service...`)
        console.log('💡 Using Smart Connections proven pattern')
        console.log('')

        const startTime = Date.now()
        await embeddingService.initialize()
        const initTime = Date.now() - startTime

        console.log(`🎉 Successfully initialized iframe transformers service!`)
        console.log(`⏱️ Initialization time: ${(initTime / 1000).toFixed(1)}s`)
        console.log('')
        console.log('🎯 Next steps:')
        console.log('   • "Test HuggingFace Embedding" - Test real neural embeddings')
        console.log('   • "Index DreamNodes with HuggingFace" - Re-index with transformers.js')
        console.log('   • "Switch HuggingFace Model" - Try different models')

      } catch (error) {
        console.error('❌ Failed to download HuggingFace model:', error)
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
      if (!embeddingService) {
        console.error('❌ HuggingFace embedding service not initialized')
        return
      }

      console.log('📊 HuggingFace Model Status')
      console.log('='.repeat(40))
      
      try {
        const isInitialized = embeddingService.isInitialized()
        const modelInfo = embeddingService.getModelInfo()
        const iframeStatus = await embeddingService.getStatus()

        // Current model status
        console.log('🤖 Current Model:')
        console.log(`   Name: ${modelInfo.name}`)
        console.log(`   ID: ${modelInfo.id}`)
        console.log(`   Status: ${isInitialized ? '✅ Loaded' : '❌ Not Loaded'}`)
        console.log(`   Iframe Status: ${iframeStatus.initialized ? '✅ Active' : '❌ Not Active'}`)
        console.log(`   Dimensions: ${modelInfo.dimensions}`)
        console.log(`   Context Length: ${modelInfo.contextLength.toLocaleString()}`)
        console.log(`   Languages: ${modelInfo.languages.join(', ')}`)
        console.log('')

        // Iframe information
        console.log('🖼️ Iframe Worker Information:')
        console.log(`   Pattern: Smart Connections iframe sandboxing`)
        console.log(`   CDN Source: @xenova/transformers via JSDelivr`)
        console.log(`   Browser Cache: Enabled (models cached automatically)`)
        console.log(`   Isolation: Sandboxed execution environment`)
        console.log('')

        // Available actions
        console.log('🎯 Available Actions:')
        if (!isInitialized) {
          console.log('   • "Download HuggingFace Model" - Initialize iframe service')
        } else {
          console.log('   • "Switch HuggingFace Model" - Change active model')
          console.log('   • "Test HuggingFace Embedding" - Test real neural embeddings')
          console.log('   • "Clear HuggingFace Cache" - Reset iframe service')
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
      if (!embeddingService) {
        console.error('❌ HuggingFace embedding service not initialized')
        return
      }

      console.log('🧪 HuggingFace Embedding Test')
      console.log('='.repeat(40))
      
      const testTexts = [
        'Artificial intelligence and machine learning',
        'Project management and collaboration',
        'Creative writing and storytelling',
        'Mathematics and scientific research'
      ]

      try {
        // Always reinitialize to ensure iframe is ready
        console.log('⚠️ Ensuring model is initialized...')
        await embeddingService.initialize()

        const modelInfo = embeddingService.getModelInfo()
        console.log(`🤖 Testing model: ${modelInfo.name}`)
        console.log(`📊 Expected dimensions: ${modelInfo.dimensions}`)
        console.log('')

        console.log('📝 Test texts:')
        for (let i = 0; i < testTexts.length; i++) {
          console.log(`${i + 1}. "${testTexts[i]}"`)
        }
        console.log('')

        console.log('⚡ Generating embeddings...')
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

      } catch (error) {
        console.error('❌ HuggingFace embedding test failed:', error)
        console.log('💡 Make sure you have downloaded a model first using "Download HuggingFace Model"')
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
      if (!embeddingService) {
        console.error('❌ HuggingFace embedding service not initialized')
        return
      }

      console.log('🗑️ HuggingFace Cache Cleaner')
      console.log('='.repeat(40))
      
      try {
        console.log('ℹ️ Iframe-based cache clearing:')
        console.log('   • Browser cache is managed automatically by @xenova/transformers')
        console.log('   • Models are cached by the browser cache API')
        console.log('   • Clearing requires iframe recreation')
        console.log('')
        
        console.log('🚀 Recreating iframe worker to clear model cache...')

        // Dispose current iframe and reinitialize to clear cache
        embeddingService.dispose()
        await embeddingService.initialize()
        
        console.log('✅ Iframe worker recreated - model cache cleared!')
        console.log('💡 Browser cache may still contain models for faster future loading')
        console.log('🎯 Run "Download HuggingFace Model" to re-initialize models')

      } catch (error) {
        console.error('❌ Failed to clear HuggingFace cache:', error)
        console.log('💡 Try "Download HuggingFace Model" to reinitialize the service')
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