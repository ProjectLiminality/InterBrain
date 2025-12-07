/**
 * WebLinkAnalyzerService - AI-powered web page summarization
 *
 * Spawns a Python process to analyze web links using Claude API,
 * generating personalized summaries based on the user's profile.
 *
 * This follows the same pattern as the realtime-transcription feature,
 * using Python to work around Obsidian's plugin environment restrictions
 * on third-party Node.js packages.
 */

import { Notice } from 'obsidian';
import { useInterBrainStore } from '../../core/store/interbrain-store';
import { ChildProcess, spawn } from 'child_process';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Access Node.js process global in Electron context
declare const process: { platform: string; env: Record<string, string | undefined> };

interface AnalysisResult {
  success: boolean;
  title?: string;
  imagePath?: string | null;
  error?: string;
}

/**
 * WebLinkAnalyzerService
 *
 * Spawns Python process to analyze web pages with Claude API,
 * generating personalized summaries and downloading representative images.
 */
class WebLinkAnalyzerService {
  private vaultPath: string = '';
  private pluginPath: string = '';
  private currentProcess: ChildProcess | null = null;

  /**
   * Initialize the service with vault and plugin paths
   */
  initialize(vaultPath: string, pluginPath: string): void {
    this.vaultPath = vaultPath;
    this.pluginPath = pluginPath;
  }

  /**
   * Get the scripts directory path
   * Uses pluginPath directly - works for both symlinked and normal installations
   */
  private getScriptsDir(): string {
    return path.join(
      this.pluginPath,
      'src/features/web-link-analyzer/scripts'
    );
  }

  /**
   * Get path to the Python script
   */
  private getScriptPath(): string {
    return path.join(this.getScriptsDir(), 'analyze-web-link.py');
  }

  /**
   * Get path to the virtual environment Python
   */
  private getVenvPython(): string | null {
    const scriptsDir = this.getScriptsDir();

    // Platform-specific venv paths
    const isWindows = process.platform === 'win32';
    const venvPython = isWindows
      ? path.join(scriptsDir, 'venv', 'Scripts', 'python.exe')
      : path.join(scriptsDir, 'venv', 'bin', 'python3');

    console.log(`WebLinkAnalyzerService: Checking for venv at ${venvPython}`);

    if (fs.existsSync(venvPython)) {
      return venvPython;
    }

    return null;
  }

  /**
   * Check if Python environment is set up
   */
  async isSetupComplete(): Promise<boolean> {
    return this.getVenvPython() !== null;
  }

  /**
   * Main entry point: analyze a web link and update the DreamNode
   */
  async analyzeWebLink(
    nodeId: string,
    url: string,
    repoPath: string,
    apiKey: string
  ): Promise<void> {
    if (!apiKey) {
      new Notice('Anthropic API key not configured. Go to InterBrain settings to add your API key.');
      console.warn('WebLinkAnalyzerService: No API key configured');
      return;
    }

    const venvPython = this.getVenvPython();
    if (!venvPython) {
      new Notice('Web analyzer not set up. Please run the setup script first.');
      console.warn('WebLinkAnalyzerService: Python venv not found');
      return;
    }

    const scriptPath = this.getScriptPath();
    if (!fs.existsSync(scriptPath)) {
      new Notice('Web analyzer script not found.');
      console.error('WebLinkAnalyzerService: Script not found at', scriptPath);
      return;
    }

    const fullRepoPath = path.join(this.vaultPath, repoPath);
    const profilePath = path.join(os.homedir(), '.claude', 'CLAUDE.md');

    console.log(`WebLinkAnalyzerService: Starting analysis of ${url}`);
    console.log(`WebLinkAnalyzerService: Output dir: ${fullRepoPath}`);

    // Build command arguments
    const args = [
      scriptPath,
      '--url', url,
      '--output-dir', fullRepoPath,
      '--api-key', apiKey,
      '--profile', profilePath,
    ];

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';

      this.currentProcess = spawn(venvPython, args, {
        cwd: path.dirname(scriptPath),
        env: { ...process.env },
      });

      this.currentProcess.stdout?.on('data', (data: { toString(): string }) => {
        stdout += data.toString();
      });

      this.currentProcess.stderr?.on('data', (data: { toString(): string }) => {
        const text = data.toString();
        stderr += text;
        // Log progress to console
        console.log(`WebLinkAnalyzerService: ${text.trim()}`);
      });

      this.currentProcess.on('close', (code: number) => {
        this.currentProcess = null;

        if (code === 0) {
          // Parse JSON result from stdout
          try {
            const result: AnalysisResult = JSON.parse(stdout.trim());
            if (result.success) {
              // Update store with new title if available
              if (result.title) {
                this.updateNodeTitle(nodeId, result.title);
              }

              // Trigger media reload for the node
              this.triggerMediaReload(nodeId);

              new Notice(`DreamNode enriched: ${result.title || 'Analysis complete'}`);
              console.log(`WebLinkAnalyzerService: Successfully analyzed ${url}`);
            } else {
              new Notice(`Analysis failed: ${result.error}`);
              console.error('WebLinkAnalyzerService: Analysis failed:', result.error);
            }
          } catch {
            console.error('WebLinkAnalyzerService: Failed to parse result:', stdout);
            new Notice('Analysis completed but failed to parse result');
          }
        } else {
          console.error('WebLinkAnalyzerService: Process exited with code', code);
          console.error('WebLinkAnalyzerService: stderr:', stderr);
          new Notice(`Web analysis failed (code ${code})`);
        }

        resolve();
      });

      this.currentProcess.on('error', (error: Error) => {
        this.currentProcess = null;
        console.error('WebLinkAnalyzerService: Process error:', error);
        new Notice(`Web analysis error: ${error.message}`);
        resolve();
      });
    });
  }

  /**
   * Update node title in the store
   */
  private updateNodeTitle(nodeId: string, newTitle: string): void {
    const store = useInterBrainStore.getState();
    const nodeData = store.realNodes.get(nodeId);

    if (nodeData && nodeData.node.name !== newTitle) {
      const updatedNode = { ...nodeData.node, name: newTitle };
      store.updateRealNode(nodeId, {
        ...nodeData,
        node: updatedNode,
        lastSynced: Date.now(),
      });
      console.log(`WebLinkAnalyzerService: Updated node title to "${newTitle}"`);
    }
  }

  /**
   * Trigger media reload for the node to pick up new DreamTalk image
   */
  private triggerMediaReload(nodeId: string): void {
    // Emit event to trigger media reload
    if (typeof globalThis.CustomEvent !== 'undefined') {
      globalThis.dispatchEvent(new globalThis.CustomEvent('dreamnode-media-updated', {
        detail: { nodeId }
      }));
    }
  }

  /**
   * Stop any running analysis
   */
  stop(): void {
    if (this.currentProcess) {
      console.log('WebLinkAnalyzerService: Stopping current analysis');
      this.currentProcess.kill('SIGTERM');
      this.currentProcess = null;
    }
  }
}

// Export singleton instance
export const webLinkAnalyzerService = new WebLinkAnalyzerService();
