import { EmbeddingHealth, EmbeddingServiceError } from './embedding-service';
import { OllamaEmbeddingService } from './ollama-embedding-service';

/**
 * Setup instructions for different operating systems
 */
export interface SetupInstructions {
  title: string;
  steps: string[];
  commands?: string[];
  notes?: string[];
}

/**
 * Ollama health and setup management service
 * Provides detailed diagnostics and setup guidance
 */
export class OllamaHealthService {
  private embeddingService: OllamaEmbeddingService;
  
  constructor(embeddingService: OllamaEmbeddingService) {
    this.embeddingService = embeddingService;
  }

  /**
   * Comprehensive health check with detailed diagnostics
   */
  async performDiagnostics(): Promise<{
    health: EmbeddingHealth;
    diagnostics: string[];
    recommendations: string[];
    setupInstructions?: SetupInstructions;
  }> {
    const health = await this.embeddingService.getHealth();
    const diagnostics: string[] = [];
    const recommendations: string[] = [];
    let setupInstructions: SetupInstructions | undefined;

    // Check Ollama availability
    if (!health.isAvailable) {
      diagnostics.push('❌ Ollama is not running or not accessible');
      recommendations.push('Install and start Ollama service');
      setupInstructions = this.getOllamaInstallInstructions();
    } else {
      diagnostics.push('✅ Ollama service is running');
    }

    // Check model availability
    if (health.isAvailable && !health.modelLoaded) {
      diagnostics.push('❌ Embedding model not found');
      recommendations.push('Pull the required embedding model');
      setupInstructions = this.getModelInstallInstructions();
    } else if (health.modelLoaded) {
      diagnostics.push('✅ Embedding model is available');
      
      // Test embedding generation
      try {
        await this.testEmbeddingGeneration();
        diagnostics.push('✅ Embedding generation test passed');
      } catch (error) {
        diagnostics.push('❌ Embedding generation test failed');
        recommendations.push('Check Ollama logs for errors');
        
        if (error instanceof Error) {
          diagnostics.push(`   Error: ${error.message}`);
        }
      }
    }

    // Model info
    if (health.modelInfo) {
      diagnostics.push(`ℹ️ Model: ${health.modelInfo.name} (${health.modelInfo.dimensions} dimensions)`);
      if (health.modelInfo.description) {
        diagnostics.push(`   ${health.modelInfo.description}`);
      }
    }

    return {
      health,
      diagnostics,
      recommendations,
      setupInstructions
    };
  }

  /**
   * Test embedding generation with a simple phrase
   */
  async testEmbeddingGeneration(): Promise<void> {
    try {
      const testText = "This is a test for semantic embedding generation.";
      const embedding = await this.embeddingService.generateEmbedding(testText);
      
      if (!embedding || embedding.length === 0) {
        throw new Error('Received empty embedding vector');
      }
      
      // Validate embedding looks reasonable
      const hasNonZero = embedding.some(val => Math.abs(val) > 0.001);
      if (!hasNonZero) {
        throw new Error('Embedding vector appears to be all zeros');
      }
      
      console.log(`Embedding test successful: ${embedding.length} dimensions`);
      
    } catch (error) {
      throw new EmbeddingServiceError(
        `Embedding generation test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SERVICE_UNAVAILABLE',
        error
      );
    }
  }

  /**
   * Get Ollama installation instructions
   */
  private getOllamaInstallInstructions(): SetupInstructions {
    const platform = this.detectPlatform();
    
    switch (platform) {
      case 'macOS':
        return {
          title: 'Install Ollama on macOS',
          steps: [
            'Download Ollama from the official website',
            'Install the downloaded .dmg file',
            'Ollama will start automatically and run in the background',
            'Verify installation by running ollama in Terminal'
          ],
          commands: [
            'curl -fsSL https://ollama.ai/install.sh | sh',
            'ollama --version'
          ],
          notes: [
            'Ollama runs on http://localhost:11434 by default',
            'The service starts automatically on system boot'
          ]
        };
        
      case 'Linux':
        return {
          title: 'Install Ollama on Linux',
          steps: [
            'Run the official install script',
            'Add ollama to your PATH if needed',
            'Start the ollama service',
            'Verify the installation'
          ],
          commands: [
            'curl -fsSL https://ollama.ai/install.sh | sh',
            'ollama serve',
            'ollama --version'
          ],
          notes: [
            'You may need to run ollama serve manually',
            'Consider setting up a systemd service for auto-start'
          ]
        };
        
      case 'Windows':
        return {
          title: 'Install Ollama on Windows',
          steps: [
            'Download Ollama for Windows from ollama.ai',
            'Run the installer as Administrator',
            'Ollama will start automatically',
            'Open Command Prompt or PowerShell to verify'
          ],
          commands: [
            'ollama --version'
          ],
          notes: [
            'Ollama runs as a Windows service',
            'Default port is 11434'
          ]
        };
        
      default:
        return {
          title: 'Install Ollama',
          steps: [
            'Visit https://ollama.ai for installation instructions',
            'Follow the platform-specific setup guide',
            'Ensure Ollama is running on localhost:11434'
          ],
          notes: [
            'Installation varies by operating system',
            'Check the official documentation for your platform'
          ]
        };
    }
  }

  /**
   * Get model installation instructions
   */
  private getModelInstallInstructions(): SetupInstructions {
    return {
      title: 'Install Embedding Model',
      steps: [
        'Ensure Ollama is running',
        'Pull the nomic-embed-text model',
        'Wait for download to complete (about 500MB)',
        'Verify model installation'
      ],
      commands: [
        'ollama pull nomic-embed-text',
        'ollama list'
      ],
      notes: [
        'nomic-embed-text is optimized for semantic search',
        'First download may take several minutes',
        'Alternative: all-minilm (smaller, faster but less accurate)'
      ]
    };
  }

  /**
   * Detect current platform
   */
  private detectPlatform(): 'macOS' | 'Linux' | 'Windows' | 'Unknown' {
    if (typeof globalThis.navigator !== 'undefined') {
      const userAgent = globalThis.navigator.userAgent.toLowerCase();
      if (userAgent.includes('mac')) return 'macOS';
      if (userAgent.includes('linux')) return 'Linux';
      if (userAgent.includes('win')) return 'Windows';
    }
    
    // Node.js environment detection
    if (typeof globalThis.process !== 'undefined') {
      const platform = globalThis.process.platform;
      if (platform === 'darwin') return 'macOS';
      if (platform === 'linux') return 'Linux';
      if (platform === 'win32') return 'Windows';
    }
    
    return 'Unknown';
  }

  /**
   * Generate setup report for display
   */
  async generateSetupReport(): Promise<string> {
    const result = await this.performDiagnostics();
    
    let report = '# Ollama Embedding Setup Report\n\n';
    
    // Status overview
    if (result.health.isAvailable && result.health.modelLoaded) {
      report += '🟢 **Status: Ready for semantic search**\n\n';
    } else if (result.health.isAvailable) {
      report += '🟡 **Status: Ollama running, model needed**\n\n';
    } else {
      report += '🔴 **Status: Setup required**\n\n';
    }
    
    // Diagnostics
    report += '## Diagnostics\n\n';
    for (const diagnostic of result.diagnostics) {
      report += `- ${diagnostic}\n`;
    }
    report += '\n';
    
    // Recommendations
    if (result.recommendations.length > 0) {
      report += '## Recommendations\n\n';
      for (const recommendation of result.recommendations) {
        report += `- ${recommendation}\n`;
      }
      report += '\n';
    }
    
    // Setup instructions
    if (result.setupInstructions) {
      const instructions = result.setupInstructions;
      report += `## ${instructions.title}\n\n`;
      
      for (let i = 0; i < instructions.steps.length; i++) {
        report += `${i + 1}. ${instructions.steps[i]}\n`;
      }
      report += '\n';
      
      if (instructions.commands && instructions.commands.length > 0) {
        report += '### Commands\n\n';
        for (const command of instructions.commands) {
          report += `\`\`\`bash\n${command}\n\`\`\`\n\n`;
        }
      }
      
      if (instructions.notes && instructions.notes.length > 0) {
        report += '### Notes\n\n';
        for (const note of instructions.notes) {
          report += `- ${note}\n`;
        }
        report += '\n';
      }
    }
    
    // Error details
    if (result.health.error) {
      report += '## Error Details\n\n';
      report += `\`\`\`\n${result.health.error}\n\`\`\`\n\n`;
    }
    
    return report;
  }

  /**
   * Quick status check (true if ready for use)
   */
  async isReady(): Promise<boolean> {
    try {
      const health = await this.embeddingService.getHealth();
      return health.isAvailable && health.modelLoaded;
    } catch {
      return false;
    }
  }

  /**
   * Get brief status message
   */
  async getStatusMessage(): Promise<string> {
    const health = await this.embeddingService.getHealth();
    
    if (health.isAvailable && health.modelLoaded) {
      return '✅ Ollama ready';
    } else if (health.isAvailable) {
      return '🟡 Model needed';
    } else {
      return '🔴 Ollama not found';
    }
  }
}

/**
 * Create health service instance
 */
export function createOllamaHealthService(embeddingService: OllamaEmbeddingService): OllamaHealthService {
  return new OllamaHealthService(embeddingService);
}