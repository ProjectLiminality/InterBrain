import { Command } from 'obsidian'
import { getIndexingService } from '../indexing/indexing-service'
import { useInterBrainStore } from '../../../store/interbrain-store'
import { getModelManagerService } from '../services/model-manager-service'

/**
 * Helper: Check if Embedding model is available and guide user if not
 */
async function checkModelAvailability(): Promise<boolean> {
  const isAvailable = await getModelManagerService().isModelAvailable()
  
  if (!isAvailable) {
    console.log('❌ Embedding model not available')
    console.log('')
    console.log('💡 To use real semantic search, please download the model first:')
    console.log('   1. Run "Download Embedding Embedding Model" command')
    console.log('   2. Wait for download to complete (~90MB)')
    console.log('   3. Try this command again')
    console.log('')
    console.log('📊 Model Information:')
    const modelInfo = getModelManagerService().getModelInfo()
    console.log(`   Name: ${modelInfo.name}`)
    console.log(`   Size: ${modelInfo.size}`)
    console.log(`   Dimensions: ${modelInfo.dimensions}`)
    return false
  }
  
  return true
}

/**
 * Command to test Embedding embedding generation
 */
export function createTestEmbeddingCommand(): Command {
  return {
    id: 'interbrain-test-embedding-embeddings',
    name: 'Test Embedding Embedding Generation',
    callback: async () => {
      console.log('🧮 Testing Embedding embedding generation...')
      
      // Check if model is available first
      if (!(await checkModelAvailability())) {
        return
      }
      
      try {
        // Test single embedding
        const testTexts = [
          'artificial intelligence and machine learning',
          'creative writing and storytelling',
          'philosophy of mind and consciousness'
        ]
        
        console.log(`🔤 Generating embeddings for ${testTexts.length} test texts...`)
        
        for (const text of testTexts) {
          const startTime = globalThis.performance.now()
          
          // Access the embedding service directly for testing
          const embeddingService = (getIndexingService() as any).embeddingService
          const embedding = await embeddingService.generateEmbedding(text)
          
          const duration = globalThis.performance.now() - startTime
          
          console.log(`✅ "${text}"`)
          console.log(`   Dimensions: ${embedding.length}`)
          console.log(`   Time: ${duration.toFixed(2)}ms`)
          console.log(`   First 10 values: [${embedding.slice(0, 10).map((x: number) => x.toFixed(4)).join(', ')}...]`)
          console.log('')
        }

        // Show model info
        const embeddingService = (getIndexingService() as any).embeddingService
        const modelInfo = embeddingService.getModelInfo()
        console.log(`🤖 Model Information:`)
        console.log(`   Name: ${modelInfo.name}`)
        console.log(`   Size: ${modelInfo.size}`)
        console.log(`   Dimensions: ${modelInfo.dimensions}`)
        console.log(`   Context Length: ${modelInfo.contextLength.toLocaleString()}`)
        console.log(`   Languages: ${modelInfo.languages.join(', ')}`)
        
      } catch (error) {
        console.error('❌ Embedding embedding test failed:', error)
        
        if ((error as Error).message?.includes('not initialized') || (error as Error).message?.includes('Failed to initialize')) {
          console.log('💡 Tip: The model will be downloaded automatically on first use')
          console.log('   This may take several minutes depending on your connection (90MB)')
        }
      }
    }
  }
}

/**
 * Command to index sample DreamNodes using Embedding embeddings
 */
export function createIndexSampleCommand(): Command {
  return {
    id: 'interbrain-index-sample-embedding',
    name: 'Index Sample DreamNodes (Embedding)',
    callback: async () => {
      console.log('📝 Indexing sample DreamNodes with Embedding embeddings...')
      
      // Check if model is available first
      if (!(await checkModelAvailability())) {
        return
      }
      
      try {
        // Get current nodes from store
        const store = useInterBrainStore.getState()
        let nodes = []
        
        if (store.dataMode === 'real') {
          nodes = Array.from(store.realNodes.values()).map(data => data.node)
        } else {
          // Get mock nodes
          const { getMockDataForConfig } = await import('../../../mock/dreamnode-mock-data')
          nodes = getMockDataForConfig(store.mockDataConfig)
        }

        if (nodes.length === 0) {
          console.log('🤷 No nodes found to index')
          console.log('💡 Try switching to mock data with "Toggle Mock Data" command')
          return
        }

        console.log(`🔄 Found ${nodes.length} nodes to index...`)
        
        let successCount = 0
        let errorCount = 0

        for (const node of nodes) {
          try {
            const startTime = globalThis.performance.now()
            await getIndexingService().indexNode(node)
            const duration = globalThis.performance.now() - startTime
            
            console.log(`✅ Indexed "${node.name}" in ${duration.toFixed(2)}ms`)
            successCount++
          } catch (error) {
            console.error(`❌ Failed to index "${node.name}":`, error)
            errorCount++
          }
        }

        console.log(`\n🎉 Indexing complete!`)
        console.log(`   Successfully indexed: ${successCount} nodes`)
        if (errorCount > 0) {
          console.log(`   Errors: ${errorCount} nodes`)
        }

        // Show updated stats
        const stats = getIndexingService().getStats()
        console.log(`\n📊 Index Statistics:`)
        console.log(`   Total nodes: ${stats.totalIndexed}`)
        console.log(`   Average index time: ${stats.avgIndexTime?.toFixed(2) || 'N/A'}ms`)
        
        console.log(`\n💡 Try "Semantic Search Test" to test search functionality!`)

      } catch (error) {
        console.error('❌ Sample indexing failed:', error)
      }
    }
  }
}

/**
 * Command to perform semantic search testing
 */
export function createSemanticSearchTestCommand(): Command {
  return {
    id: 'interbrain-semantic-search-test',
    name: 'Semantic Search Test (Embedding)',
    callback: async () => {
      console.log('🔍 Testing semantic search with Embedding embeddings...')
      
      // Check if model is available first
      if (!(await checkModelAvailability())) {
        return
      }
      
      try {
        // Check if we have indexed nodes
        const stats = getIndexingService().getStats()
        if (stats.totalIndexed === 0) {
          console.log('🤷 No indexed nodes found')
          console.log('💡 Run "Index Sample DreamNodes (Embedding)" first')
          return
        }

        console.log(`📊 Found ${stats.totalIndexed} indexed nodes`)
        
        // Test queries
        const testQueries = [
          'artificial intelligence',
          'machine learning', 
          'creative writing',
          'philosophy',
          'consciousness'
        ]

        console.log('📝 Available test queries:')
        testQueries.forEach((query, i) => {
          console.log(`  ${i + 1}. "${query}"`)
        })

        // Use the first query as default
        const query = testQueries[0]
        console.log(`\n🎯 Testing with query: "${query}"`)

        const startTime = globalThis.performance.now()
        
        // Perform semantic search by comparing with all indexed vectors
        const allVectors = getIndexingService().getAllVectors()
        const embeddingService = (getIndexingService() as any).embeddingService
        const queryEmbedding = await embeddingService.generateEmbedding(query)
        
        const embeddingTime = globalThis.performance.now() - startTime
        
        // Calculate semantic similarities
        const searchStart = globalThis.performance.now()
        const results = allVectors.map(vector => ({
          nodeId: vector.nodeId,
          title: vector.metadata.title,
          similarity: calculateCosineSimilarity(queryEmbedding, vector.embedding),
          type: vector.metadata.type,
          wordCount: vector.metadata.wordCount
        }))
        
        // Sort by similarity (highest first)
        results.sort((a, b) => b.similarity - a.similarity)
        const searchTime = globalThis.performance.now() - searchStart
        const totalTime = globalThis.performance.now() - startTime
        
        // Display results
        console.log(`\n🔍 Search Results for "${query}":\n`)
        
        const topResults = results.slice(0, 5)
        if (topResults.length === 0) {
          console.log('  No results found.')
        } else {
          topResults.forEach((result, index) => {
            console.log(`  ${index + 1}. "${result.title}" (${result.type})`)
            console.log(`     Similarity: ${result.similarity.toFixed(4)}`)
            console.log(`     Word count: ${result.wordCount}`)
            console.log(`     Node ID: ${result.nodeId}`)
            console.log('')
          })
        }

        // Performance metrics
        console.log(`⏱️  Performance Metrics:`)
        console.log(`   Embedding generation: ${embeddingTime.toFixed(2)}ms`)
        console.log(`   Similarity calculation: ${searchTime.toFixed(2)}ms`)
        console.log(`   Total search time: ${totalTime.toFixed(2)}ms`)
        
        if (totalTime < 50) {
          console.log(`   ✅ Under 50ms target`)
        } else {
          console.log(`   ⚠️  Over 50ms target (current: ${totalTime.toFixed(2)}ms)`)
        }

      } catch (error) {
        console.error('❌ Semantic search test failed:', error)
        
        if ((error as Error).message?.includes('not initialized')) {
          console.log('💡 Tip: Run "Test Embedding Embedding Generation" first to initialize model')
        }
      }
    }
  }
}

/**
 * Helper: Calculate cosine similarity between two vectors
 */
function calculateCosineSimilarity(vectorA: number[], vectorB: number[]): number {
  if (vectorA.length !== vectorB.length) {
    throw new Error('Vectors must have the same dimension')
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i]
    normA += vectorA[i] * vectorA[i]
    normB += vectorB[i] * vectorB[i]
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB)
  return magnitude === 0 ? 0 : dotProduct / magnitude
}

/**
 * Command to clear the semantic search index
 */
export function createClearIndexCommand(): Command {
  return {
    id: 'interbrain-clear-semantic-index',
    name: 'Clear Semantic Search Index',
    callback: () => {
      console.log('🗑️  Clearing semantic search index...')
      
      const statsBefore = getIndexingService().getStats()
      console.log(`📊 Current index has ${statsBefore.totalIndexed} nodes`)
      
      getIndexingService().clearIndex()
      
      const statsAfter = getIndexingService().getStats()
      console.log(`✅ Index cleared successfully!`)
      console.log(`📊 Index now has ${statsAfter.totalIndexed} nodes`)
    }
  }
}

/**
 * Command to show semantic search index statistics
 */
export function createShowIndexStatsCommand(): Command {
  return {
    id: 'interbrain-show-semantic-stats',
    name: 'Show Semantic Search Statistics',
    callback: () => {
      console.log('📊 Semantic Search Index Statistics...')
      
      const stats = getIndexingService().getStats()
      const progress = getIndexingService().getProgress()
      
      console.log(`\n📈 Index Statistics:`)
      console.log(`   📚 Total nodes indexed: ${stats.totalIndexed}`)
      console.log(`   ⏱️  Average index time: ${stats.avgIndexTime?.toFixed(2) || 'N/A'}ms`)
      console.log(`   🔄 Last index time: ${stats.lastIndexTime?.toFixed(2) || 'N/A'}ms`)
      
      console.log(`\n🔄 Progress Status:`)
      console.log(`   Status: ${progress.status}`)
      console.log(`   Progress: ${progress.completed}/${progress.total}`)
      if (progress.message) {
        console.log(`   Message: ${progress.message}`)
      }
      
      if (stats.totalIndexed === 0) {
        console.log(`\n💡 Index is empty. Try running:`)
        console.log(`   1. "Index Sample DreamNodes (Embedding)"`)
        console.log(`   2. "Semantic Search Test (Embedding)"`)
      } else {
        console.log(`\n✅ Index is ready for semantic search!`)
        console.log(`   Try "Semantic Search Test (Embedding)" to test search`)
      }
    }
  }
}