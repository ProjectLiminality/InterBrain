import { Plugin, Notice } from 'obsidian';
import { UIService } from '../services/ui-service';
import { useInterBrainStore } from '../store/interbrain-store';
import { serviceManager } from '../services/service-manager';
import { PassphraseManager } from '../services/passphrase-manager';
import type { DreamNode } from '../types/dreamnode';

/**
 * Radicle commands for peer-to-peer DreamNode sharing
 * Implements "Save & Share" paradigm - hiding technical complexity
 */
export function registerRadicleCommands(
  plugin: Plugin,
  uiService: UIService,
  passphraseManager: PassphraseManager
): void {

  // Initialize DreamNode with Radicle - One-time setup for peer-to-peer sharing
  plugin.addCommand({
    id: 'initialize-dreamnode-radicle',
    name: 'Initialize DreamNode with Radicle',
    callback: async () => {
      try {
        const store = useInterBrainStore.getState();
        const selectedNode = store.selectedNode;

        if (!selectedNode) {
          console.log('RadicleCommands: No DreamNode selected for Radicle initialization');
          uiService.showError('Please select a DreamNode first');
          return;
        }

        // Get vault path and resolve full repo path
        const adapter = plugin.app.vault.adapter as { path?: string; basePath?: string };
        let vaultPath = '';
        if (typeof adapter.path === 'string') {
          vaultPath = adapter.path;
        } else if (typeof adapter.basePath === 'string') {
          vaultPath = adapter.basePath;
        }

        const path = require('path');
        const fs = require('fs').promises;
        const fullRepoPath = path.join(vaultPath, selectedNode.repoPath);
        const uddPath = path.join(fullRepoPath, '.udd');

        console.log(`RadicleCommands: Ensuring Radicle initialization for DreamNode: ${selectedNode.name} at ${fullRepoPath}`);
        const radicleService = serviceManager.getRadicleService();

        // Check if Radicle is available
        const isAvailable = await radicleService.isAvailable();
        console.log(`RadicleCommands: Radicle CLI availability check: ${isAvailable}`);
        if (!isAvailable) {
          uiService.showError('Radicle CLI not available. Please install Radicle: https://radicle.xyz');
          return;
        }

        // STEP 1: Check if Radicle ID exists in .udd file
        let radicleIdFromUdd: string | null = null;
        try {
          const uddContent = await fs.readFile(uddPath, 'utf-8');
          const udd = JSON.parse(uddContent);
          radicleIdFromUdd = udd.radicleId || null;
        } catch (error) {
          console.warn(`RadicleCommands: Could not read .udd file:`, error);
        }

        if (radicleIdFromUdd) {
          // SUCCESS: Radicle ID already in .udd file
          console.log(`RadicleCommands: Radicle ID already present in .udd: ${radicleIdFromUdd}`);
          uiService.showSuccess(`${selectedNode.name} already ready for peer-to-peer sharing!`);
          return;
        }

        // STEP 2: Radicle ID not in .udd - check if repository is initialized with Radicle anyway
        console.log(`RadicleCommands: No Radicle ID in .udd, checking repository initialization status...`);
        const radicleIdFromRepo = await radicleService.getRadicleId(fullRepoPath);

        if (radicleIdFromRepo) {
          // GAP DETECTED: Repository is initialized but .udd doesn't have the ID - write it
          console.log(`RadicleCommands: Repository initialized with Radicle ID ${radicleIdFromRepo}, writing to .udd...`);
          try {
            const uddContent = await fs.readFile(uddPath, 'utf-8');
            const udd = JSON.parse(uddContent);
            udd.radicleId = radicleIdFromRepo;
            await fs.writeFile(uddPath, JSON.stringify(udd, null, 2));
            console.log(`RadicleCommands: Successfully wrote Radicle ID to .udd file`);
            uiService.showSuccess(`${selectedNode.name} ready for peer-to-peer sharing!`);
            return;
          } catch (error) {
            console.error('RadicleCommands: Failed to write Radicle ID to .udd:', error);
            uiService.showError('Repository initialized but failed to update .udd file');
            return;
          }
        }

        // STEP 3: Not initialized at all - initialize with Radicle and write to .udd
        console.log(`RadicleCommands: Repository not initialized with Radicle, initializing...`);
        const notice = new Notice('Initializing Radicle for DreamNode...', 0);

        try {
          // Try without passphrase first (ssh-agent)
          // Use repoPath (directory name) as Radicle name - already sanitized to PascalCase
          await radicleService.init(fullRepoPath, selectedNode.repoPath, `DreamNode: ${selectedNode.name}`);

          // Get the Radicle ID and save to .udd file
          const radicleId = await radicleService.getRadicleId(fullRepoPath);
          if (radicleId) {
            try {
              const uddContent = await fs.readFile(uddPath, 'utf-8');
              const udd = JSON.parse(uddContent);
              udd.radicleId = radicleId;
              await fs.writeFile(uddPath, JSON.stringify(udd, null, 2));
              console.log(`RadicleCommands: Saved Radicle ID ${radicleId} to .udd file`);
            } catch (error) {
              console.error('RadicleCommands: Failed to save Radicle ID to .udd:', error);
            }
          }

          // Success notification
          notice.hide();
          console.log(`RadicleCommands: Successfully initialized Radicle for ${selectedNode.name}`);
          uiService.showSuccess(`${selectedNode.name} ready for peer-to-peer sharing!`);
        } catch (error: any) {
          // Check if repository exists in Radicle storage but working directory not linked
          if (error.message && error.message.startsWith('RADICLE_STORAGE_EXISTS:')) {
            notice.hide();
            const radicleId = error.message.replace('RADICLE_STORAGE_EXISTS:', ''); // Extract rad:z... from error
            console.log(`RadicleCommands: ${selectedNode.name} exists in storage with ID ${radicleId}, linking to .udd...`);

            // Save the Radicle ID to .udd file
            try {
              const uddContent = await fs.readFile(uddPath, 'utf-8');
              const udd = JSON.parse(uddContent);
              udd.radicleId = radicleId;
              await fs.writeFile(uddPath, JSON.stringify(udd, null, 2));
              console.log(`RadicleCommands: Saved Radicle ID ${radicleId} to .udd file`);
              uiService.showSuccess(`${selectedNode.name} ready for peer-to-peer sharing!`);
            } catch (writeError) {
              console.error('RadicleCommands: Failed to save Radicle ID to .udd:', writeError);
              uiService.showError('Repository exists but failed to update .udd file');
            }
            return;
          }

          // Check if already initialized - race condition where it was initialized between Step 2 and Step 3
          if (error.message && (error.message.includes('already initialized') || error.message.includes('reinitialize'))) {
            notice.hide();
            console.log(`RadicleCommands: ${selectedNode.name} was initialized during gap check, retrieving ID...`);

            // Get and save the Radicle ID to .udd file
            const radicleId = await radicleService.getRadicleId(fullRepoPath);
            if (radicleId) {
              try {
                const uddContent = await fs.readFile(uddPath, 'utf-8');
                const udd = JSON.parse(uddContent);
                udd.radicleId = radicleId;
                await fs.writeFile(uddPath, JSON.stringify(udd, null, 2));
                console.log(`RadicleCommands: Saved Radicle ID ${radicleId} to .udd file`);
              } catch (writeError) {
                console.warn('RadicleCommands: Failed to save Radicle ID to .udd:', writeError);
              }
            }

            uiService.showSuccess(`${selectedNode.name} ready for peer-to-peer sharing!`);
            return;
          }

          // If passphrase is needed, prompt and retry
          if (error.message && error.message.includes('passphrase')) {
            notice.hide();
            console.log('RadicleCommands: Passphrase required, prompting user...');

            const passphrase = await passphraseManager.getPassphrase();
            if (!passphrase) {
              console.log('RadicleCommands: User cancelled passphrase prompt');
              return;
            }

            // Retry with passphrase
            const retryNotice = new Notice('Initializing Radicle for DreamNode...', 0);
            try {
              // Use repoPath (directory name) as Radicle name - already sanitized to PascalCase
              await radicleService.init(fullRepoPath, selectedNode.repoPath, `DreamNode: ${selectedNode.name}`, passphrase);

              // Get the Radicle ID and save to .udd file
              const radicleId = await radicleService.getRadicleId(fullRepoPath);
              if (radicleId) {
                try {
                  const uddContent = await fs.readFile(uddPath, 'utf-8');
                  const udd = JSON.parse(uddContent);
                  udd.radicleId = radicleId;
                  await fs.writeFile(uddPath, JSON.stringify(udd, null, 2));
                  console.log(`RadicleCommands: Saved Radicle ID ${radicleId} to .udd file`);
                } catch (error) {
                  console.error('RadicleCommands: Failed to save Radicle ID to .udd:', error);
                }
              }

              retryNotice.hide();
              console.log(`RadicleCommands: Successfully initialized Radicle for ${selectedNode.name} with passphrase`);
              uiService.showSuccess(`${selectedNode.name} ready for peer-to-peer sharing!`);
            } catch (retryError: any) {
              // Check if already initialized in retry path too
              if (retryError.message && (retryError.message.includes('already initialized') || retryError.message.includes('reinitialize'))) {
                retryNotice.hide();
                console.log(`RadicleCommands: ${selectedNode.name} already initialized, retrieving ID...`);

                const radicleId = await radicleService.getRadicleId(fullRepoPath);
                if (radicleId) {
                  try {
                    const uddContent = await fs.readFile(uddPath, 'utf-8');
                    const udd = JSON.parse(uddContent);
                    udd.radicleId = radicleId;
                    await fs.writeFile(uddPath, JSON.stringify(udd, null, 2));
                    console.log(`RadicleCommands: Saved Radicle ID ${radicleId} to .udd file`);
                  } catch (writeError) {
                    console.warn('RadicleCommands: Failed to save Radicle ID to .udd:', writeError);
                  }
                }

                uiService.showSuccess(`${selectedNode.name} ready for peer-to-peer sharing!`);
                return;
              }

              retryNotice.hide();
              console.error('RadicleCommands: Failed to initialize with passphrase:', retryError);
              uiService.showError(`Failed to initialize: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
            }
          } else {
            notice.hide();
            console.error('RadicleCommands: Failed to initialize DreamNode with Radicle:', error);
            uiService.showError(`Failed to initialize: ${error.message || 'Unknown error'}`);
          }
        }
      } catch (error) {
        console.error('RadicleCommands: Initialize DreamNode with Radicle command failed:', error);
        uiService.showError('Failed to initialize DreamNode with Radicle');
      }
    }
  });

  // Share DreamNode - Push local commits to Radicle network
  plugin.addCommand({
    id: 'share-dreamnode',
    name: 'Share DreamNode',
    callback: async () => {
      try {
        const store = useInterBrainStore.getState();
        const selectedNode = store.selectedNode;

        if (!selectedNode) {
          console.log('RadicleCommands: No DreamNode selected for sharing');
          uiService.showError('Please select a DreamNode first');
          return;
        }

        // Get vault path and resolve full repo path
        const adapter = plugin.app.vault.adapter as { path?: string; basePath?: string };
        let vaultPath = '';
        if (typeof adapter.path === 'string') {
          vaultPath = adapter.path;
        } else if (typeof adapter.basePath === 'string') {
          vaultPath = adapter.basePath;
        }

        const path = require('path');
        const fullRepoPath = path.join(vaultPath, selectedNode.repoPath);

        console.log(`RadicleCommands: Attempting to share DreamNode: ${selectedNode.name} at ${fullRepoPath}`);
        const radicleService = serviceManager.getRadicleService();

        // Check if Radicle is available
        const isAvailable = await radicleService.isAvailable();
        console.log(`RadicleCommands: Radicle CLI availability check: ${isAvailable}`);
        if (!isAvailable) {
          uiService.showError('Radicle CLI not available. Please install Radicle: https://radicle.xyz');
          return;
        }

        // Check if there are changes to share
        const hasChanges = await radicleService.hasChangesToShare(fullRepoPath);
        console.log(`RadicleCommands: Has changes to share: ${hasChanges}`);
        if (!hasChanges) {
          uiService.showInfo('Nothing new to share');
          return;
        }

        // Show status indicator
        const notice = new Notice('Sharing to Radicle network...', 0);
        console.log(`RadicleCommands: Starting rad sync for ${selectedNode.name}...`);

        try {
          // Try sharing without passphrase first (ssh-agent)
          await radicleService.share(fullRepoPath);

          // Get Radicle ID and write to .udd
          const radicleId = await radicleService.getRadicleId(fullRepoPath);
          if (radicleId) {
            console.log(`RadicleCommands: Writing Radicle ID to .udd: ${radicleId}`);
            const UDDService = (await import('../services/udd-service')).UDDService;
            const udd = await UDDService.readUDD(fullRepoPath);
            udd.radicleId = radicleId;
            await UDDService.writeUDD(fullRepoPath, udd);
          }

          // Success notification
          notice.hide();
          console.log(`RadicleCommands: Successfully shared ${selectedNode.name} to Radicle network`);
          uiService.showSuccess(`${selectedNode.name} shared successfully!`);
        } catch (error: any) {
          // If passphrase is needed, prompt and retry
          if (error.message && error.message.includes('passphrase')) {
            notice.hide();
            console.log('RadicleCommands: Passphrase required, prompting user...');

            const passphrase = await passphraseManager.getPassphrase();
            if (!passphrase) {
              console.log('RadicleCommands: User cancelled passphrase prompt');
              return;
            }

            // Retry with passphrase
            const retryNotice = new Notice('Sharing to Radicle network...', 0);
            try {
              await radicleService.share(fullRepoPath, passphrase);

              // Get Radicle ID and write to .udd
              const radicleId = await radicleService.getRadicleId(fullRepoPath);
              if (radicleId) {
                console.log(`RadicleCommands: Writing Radicle ID to .udd: ${radicleId}`);
                const UDDService = (await import('../services/udd-service')).UDDService;
                const udd = await UDDService.readUDD(fullRepoPath);
                udd.radicleId = radicleId;
                await UDDService.writeUDD(fullRepoPath, udd);
              }

              retryNotice.hide();
              console.log(`RadicleCommands: Successfully shared ${selectedNode.name} with passphrase`);
              uiService.showSuccess(`${selectedNode.name} shared successfully!`);
            } catch (retryError) {
              retryNotice.hide();
              console.error('RadicleCommands: Failed to share with passphrase:', retryError);
              uiService.showError(`Failed to share: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
            }
          } else {
            notice.hide();
            console.error('RadicleCommands: Failed to share DreamNode:', error);
            uiService.showError(`Failed to share: ${error.message || 'Unknown error'}`);
          }
        }
      } catch (error) {
        console.error('RadicleCommands: Share DreamNode command failed:', error);
        uiService.showError('Failed to share DreamNode');
      }
    }
  });

  // Clone DreamNode from Radicle Network
  plugin.addCommand({
    id: 'clone-from-radicle',
    name: 'Clone DreamNode from Radicle Network',
    callback: async () => {
      try {
        console.log('RadicleCommands: Clone DreamNode command initiated');
        const radicleService = serviceManager.getRadicleService();

        // Check if Radicle is available
        const isAvailable = await radicleService.isAvailable();
        console.log(`RadicleCommands: Radicle CLI availability check: ${isAvailable}`);
        if (!isAvailable) {
          uiService.showError('Radicle CLI not available. Please install Radicle: https://radicle.xyz');
          return;
        }

        // Prompt for Radicle ID
        const radicleId = await uiService.promptForText(
          'Enter Radicle ID to clone',
          'rad:z42hL2jL4XNk6K8oHQaSWfMgCL7ji'
        );

        if (!radicleId || radicleId.trim() === '') {
          console.log('RadicleCommands: User cancelled Radicle ID input');
          return; // User cancelled
        }

        console.log(`RadicleCommands: Attempting to clone Radicle ID: ${radicleId.trim()}`);

        // Get vault path for destination
        const adapter = plugin.app.vault.adapter as { path?: string; basePath?: string };
        let vaultPath = '';
        if (typeof adapter.path === 'string') {
          vaultPath = adapter.path;
        } else if (typeof adapter.basePath === 'string') {
          vaultPath = adapter.basePath;
        }

        console.log(`RadicleCommands: Target vault path: ${vaultPath}`);
        if (!vaultPath) {
          console.error('RadicleCommands: Could not determine vault path');
          uiService.showError('Could not determine vault path');
          return;
        }

        // Show status indicator
        const notice = new Notice('Cloning from Radicle network...', 0);
        console.log('RadicleCommands: Starting rad clone...');

        try {
          // Try cloning without passphrase first (ssh-agent)
          const { repoName } = await radicleService.clone(radicleId.trim(), vaultPath);

          // Success notification
          notice.hide();
          console.log(`RadicleCommands: Successfully cloned ${repoName} from Radicle network`);
          uiService.showSuccess(`${repoName} cloned successfully!`);

          // Read .udd file directly instead of full vault scan
          console.log('RadicleCommands: Reading .udd file from cloned repository...');
          const path = require('path');
          const fs = require('fs').promises;
          const uddPath = path.join(vaultPath, repoName, '.udd');

          try {
            const uddContent = await fs.readFile(uddPath, 'utf-8');
            const udd = JSON.parse(uddContent);
            console.log(`RadicleCommands: Parsed .udd file:`, udd);

            // CRITICAL: Add Radicle ID to .udd file for duplicate detection
            if (!udd.radicleId) {
              udd.radicleId = radicleId.trim();
              await fs.writeFile(uddPath, JSON.stringify(udd, null, 2));
              console.log(`RadicleCommands: Added Radicle ID to .udd file`);
            }

            // Calculate default position at center of camera view
            // TODO: Restore sphere rotation calculation if needed
            const position: [number, number, number] = [0, 0, -5000];

            // Load dreamTalk media if specified
            let dreamTalkMedia: Array<{
              path: string;
              absolutePath: string;
              type: string;
              data: string;
              size: number;
            }> = [];

            if (udd.dreamTalk) {
              const mediaPath = path.join(vaultPath, repoName, udd.dreamTalk);
              try {
                const stats = await fs.stat(mediaPath);
                const buffer = await fs.readFile(mediaPath);
                const base64 = buffer.toString('base64');
                const mimeType = udd.dreamTalk.endsWith('.png') ? 'image/png' :
                               udd.dreamTalk.endsWith('.jpg') || udd.dreamTalk.endsWith('.jpeg') ? 'image/jpeg' :
                               udd.dreamTalk.endsWith('.gif') ? 'image/gif' :
                               udd.dreamTalk.endsWith('.mp4') ? 'video/mp4' :
                               udd.dreamTalk.endsWith('.webm') ? 'video/webm' :
                               udd.dreamTalk.endsWith('.mp3') ? 'audio/mpeg' :
                               udd.dreamTalk.endsWith('.wav') ? 'audio/wav' :
                               'application/octet-stream';
                const dataUrl = `data:${mimeType};base64,${base64}`;

                dreamTalkMedia = [{
                  path: udd.dreamTalk,
                  absolutePath: mediaPath,
                  type: mimeType,
                  data: dataUrl,
                  size: stats.size
                }];
                console.log(`RadicleCommands: Loaded dreamTalk media: ${udd.dreamTalk}`);
              } catch (mediaError) {
                console.error('RadicleCommands: Failed to load dreamTalk media:', mediaError);
              }
            }

            // Create DreamNode with ALL required properties
            const clonedNode: DreamNode = {
              id: udd.uuid, // CRITICAL: id property
              name: udd.title || repoName,
              type: udd.type || 'dream',
              repoPath: repoName,
              dreamTalkMedia: dreamTalkMedia,
              dreamSongContent: [],
              liminalWebConnections: udd.liminalWebRelationships || [], // CRITICAL: defensive check
              position: position,
              hasUnsavedChanges: false,
              email: udd.email,
              phone: udd.phone,
              radicleId: udd.radicleId
            };

            console.log(`RadicleCommands: Created DreamNode object:`, clonedNode);

            // Add to store (realNodes is a Map)
            const freshStore = useInterBrainStore.getState();
            const currentNodes = new Map(freshStore.realNodes);
            currentNodes.set(clonedNode.id, {
              node: clonedNode,
              lastSynced: Date.now()
            });
            freshStore.setRealNodes(currentNodes);

            console.log(`RadicleCommands: Added cloned node to store, total nodes: ${currentNodes.size}`);
            uiService.showInfo(`"${clonedNode.name}" is now visible in DreamSpace`);
          } catch (readError) {
            console.error('RadicleCommands: Failed to read .udd file:', readError);
            uiService.showError('Cloned successfully but failed to load node data. Try "Scan DreamVault for Notes"');
          }
        } catch (error: any) {
          // If passphrase is needed, prompt and retry
          if (error.message && error.message.includes('passphrase')) {
            notice.hide();
            console.log('RadicleCommands: Passphrase required, prompting user...');

            const passphrase = await passphraseManager.getPassphrase();
            if (!passphrase) {
              console.log('RadicleCommands: User cancelled passphrase prompt');
              return;
            }

            // Retry with passphrase
            const retryNotice = new Notice('Cloning from Radicle network...', 0);
            try {
              const { repoName } = await radicleService.clone(radicleId.trim(), vaultPath, passphrase);
              retryNotice.hide();
              console.log(`RadicleCommands: Successfully cloned ${repoName} with passphrase`);
              uiService.showSuccess(`${repoName} cloned successfully!`);

              // Read .udd file directly (same logic as above)
              console.log('RadicleCommands: Reading .udd file from cloned repository...');
              const path = require('path');
              const fs = require('fs').promises;
              const uddPath = path.join(vaultPath, repoName, '.udd');

              try {
                const uddContent = await fs.readFile(uddPath, 'utf-8');
                const udd = JSON.parse(uddContent);

                // CRITICAL: Add Radicle ID to .udd file for duplicate detection
                if (!udd.radicleId) {
                  udd.radicleId = radicleId.trim();
                  await fs.writeFile(uddPath, JSON.stringify(udd, null, 2));
                  console.log(`RadicleCommands: Added Radicle ID to .udd file`);
                }

                // Calculate default position at center of camera view
                // TODO: Restore sphere rotation calculation if needed
                const position: [number, number, number] = [0, 0, -5000];

                // Load dreamTalk media
                let dreamTalkMedia: Array<{
                  path: string;
                  absolutePath: string;
                  type: string;
                  data: string;
                  size: number;
                }> = [];

                if (udd.dreamTalk) {
                  const mediaPath = path.join(vaultPath, repoName, udd.dreamTalk);
                  try {
                    const stats = await fs.stat(mediaPath);
                    const buffer = await fs.readFile(mediaPath);
                    const base64 = buffer.toString('base64');
                    const mimeType = udd.dreamTalk.endsWith('.png') ? 'image/png' :
                                   udd.dreamTalk.endsWith('.jpg') || udd.dreamTalk.endsWith('.jpeg') ? 'image/jpeg' :
                                   udd.dreamTalk.endsWith('.gif') ? 'image/gif' :
                                   udd.dreamTalk.endsWith('.mp4') ? 'video/mp4' :
                                   udd.dreamTalk.endsWith('.webm') ? 'video/webm' :
                                   udd.dreamTalk.endsWith('.mp3') ? 'audio/mpeg' :
                                   udd.dreamTalk.endsWith('.wav') ? 'audio/wav' :
                                   'application/octet-stream';
                    dreamTalkMedia = [{
                      path: udd.dreamTalk,
                      absolutePath: mediaPath,
                      type: mimeType,
                      data: `data:${mimeType};base64,${base64}`,
                      size: stats.size
                    }];
                  } catch (mediaError) {
                    console.error('RadicleCommands: Failed to load dreamTalk media:', mediaError);
                  }
                }

                // Create DreamNode with ALL required properties
                const clonedNode: DreamNode = {
                  id: udd.uuid,
                  name: udd.title || repoName,
                  type: udd.type || 'dream',
                  repoPath: repoName,
                  dreamTalkMedia: dreamTalkMedia,
                  dreamSongContent: [],
                  liminalWebConnections: udd.liminalWebRelationships || [],
                  position: position,
                  hasUnsavedChanges: false,
                  email: udd.email,
                  phone: udd.phone,
                  radicleId: udd.radicleId
                };

                // Add to store
                const retryStore = useInterBrainStore.getState();
                const currentNodes = new Map(retryStore.realNodes);
                currentNodes.set(clonedNode.id, {
                  node: clonedNode,
                  lastSynced: Date.now()
                });
                retryStore.setRealNodes(currentNodes);

                uiService.showInfo(`"${clonedNode.name}" is now visible in DreamSpace`);
              } catch (readError) {
                console.error('RadicleCommands: Failed to read .udd file:', readError);
                uiService.showError('Cloned successfully but failed to load node data. Try "Scan DreamVault for Notes"');
              }
            } catch (retryError) {
              retryNotice.hide();
              console.error('RadicleCommands: Failed to clone with passphrase:', retryError);
              uiService.showError(`Failed to clone: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
            }
          } else {
            notice.hide();
            console.error('RadicleCommands: Failed to clone DreamNode:', error);
            uiService.showError(`Failed to clone: ${error.message || 'Unknown error'}`);
          }
        }
      } catch (error) {
        console.error('RadicleCommands: Clone from Radicle command failed:', error);
        uiService.showError('Failed to clone DreamNode');
      }
    }
  });

  // Configure Radicle Passphrase - Optional command for users without ssh-agent
  plugin.addCommand({
    id: 'configure-radicle-passphrase',
    name: 'Configure Radicle Passphrase',
    callback: async () => {
      try {
        console.log('RadicleCommands: Configure Radicle Passphrase command initiated');
        const radicleService = serviceManager.getRadicleService();

        // Check if Radicle is available
        const isAvailable = await radicleService.isAvailable();
        if (!isAvailable) {
          uiService.showError('Radicle CLI not available. Please install Radicle: https://radicle.xyz');
          return;
        }

        // Prompt for passphrase
        const passphrase = await uiService.promptForText(
          'Enter your Radicle passphrase (stored in memory for this session only)',
          ''
        );

        if (!passphrase || passphrase.trim() === '') {
          console.log('RadicleCommands: User cancelled passphrase configuration');
          return;
        }

        // Store in PassphraseManager
        passphraseManager.setPassphrase(passphrase.trim());
        console.log('RadicleCommands: Passphrase configured successfully');
        uiService.showSuccess('Radicle passphrase configured for this session');
      } catch (error) {
        console.error('RadicleCommands: Configure Radicle Passphrase command failed:', error);
        uiService.showError('Failed to configure passphrase');
      }
    }
  });

  // Sync Radicle peer following with Liminal Web relationships
  plugin.addCommand({
    id: 'sync-radicle-peer-following',
    name: 'Sync Radicle Peer Following',
    callback: async () => {
      try {
        console.log('🔄 [Radicle Peer Sync] Starting maintenance sync...');
        new Notice('Starting Radicle peer following sync...');

        const radicleService = serviceManager.getRadicleService();
        if (!radicleService) {
          throw new Error('Radicle service not available');
        }

        // Check if Radicle is available
        const isAvailable = await radicleService.isAvailable();
        if (!isAvailable) {
          throw new Error('Radicle CLI not installed or not in PATH');
        }

        // Get passphrase (from settings or prompt)
        const settings = (plugin as any).settings;
        let passphrase = settings?.radiclePassphrase || passphraseManager.getPassphrase();

        if (!passphrase || passphrase.trim() === '') {
          passphrase = await uiService.promptForText(
            'Enter your Radicle passphrase to sync peer following',
            ''
          );
          if (!passphrase || passphrase.trim() === '') {
            console.log('🔄 [Radicle Peer Sync] User cancelled - no passphrase provided');
            return;
          }
        }

        // Use the same pattern as relationship-commands.ts
        const adapter = plugin.app.vault.adapter as any;
        const vaultPath = adapter.basePath || '';
        const path = require('path');
        const fs = require('fs');
        const fsPromises = fs.promises;

        // Get all DreamNode directories
        const entries = await fsPromises.readdir(vaultPath, { withFileTypes: true });
        const dreamNodeDirs = [];

        for (const entry of entries) {
          if (!entry.isDirectory()) continue;

          const dirPath = path.join(vaultPath, entry.name);
          const uddPath = path.join(dirPath, '.udd');
          const gitPath = path.join(dirPath, '.git');

          try {
            await fsPromises.access(uddPath);
            await fsPromises.access(gitPath);
            dreamNodeDirs.push({ name: entry.name, path: dirPath });
          } catch {
            // Not a valid DreamNode, skip
            continue;
          }
        }

        console.log(`🔄 [Radicle Peer Sync] Found ${dreamNodeDirs.length} DreamNodes to scan`);

        // Load all UDD files in parallel
        const uddDataMap = new Map<string, {
          uuid: string;
          type: string;
          did?: string;
          radicleId?: string;
          relationships: string[];
          path: string;
          dirPath: string;
          dirName: string
        }>();

        await Promise.all(
          dreamNodeDirs.map(async ({ name, path: dirPath }) => {
            try {
              const uddPath = path.join(dirPath, '.udd');
              const uddContent = await fsPromises.readFile(uddPath, 'utf-8');
              const udd = JSON.parse(uddContent);

              const nodeType = udd.type || 'dream';
              console.log(`🔍 [Radicle Peer Sync] Scanning "${name}": type=${nodeType}, did=${udd.did || 'none'}, radicleId=${udd.radicleId || 'none'}`);

              // For Dreamer nodes, read liminal-web.json for relationships
              let relationships: string[] = [];
              if (nodeType === 'dreamer') {
                try {
                  const liminalWebPath = path.join(dirPath, 'liminal-web.json');
                  const liminalWebContent = await fsPromises.readFile(liminalWebPath, 'utf-8');
                  const liminalWeb = JSON.parse(liminalWebContent);
                  relationships = liminalWeb.relationships || [];
                  console.log(`🔍 [Radicle Peer Sync]   → Found liminal-web.json with ${relationships.length} relationships`);
                } catch (liminalError) {
                  console.log(`🔍 [Radicle Peer Sync]   → No liminal-web.json found (this is normal if no relationships yet)`);
                }
              }

              uddDataMap.set(udd.uuid, {
                uuid: udd.uuid,
                type: nodeType,
                did: udd.did,
                radicleId: udd.radicleId,
                relationships: relationships,
                path: uddPath,
                dirPath: dirPath,
                dirName: name
              });
            } catch (error) {
              console.error(`❌ [Radicle Peer Sync] Error reading ${name}/.udd:`, error);
            }
          })
        );

        console.log(`🔄 [Radicle Peer Sync] Loaded ${uddDataMap.size} UDD files`);

        // Find all Dreamer nodes with DIDs
        const dreamersWithDids: Array<{ uuid: string; did: string; data: any }> = [];

        for (const [uuid, data] of uddDataMap) {
          if (data.type === 'dreamer') {
            if (data.did && data.did.startsWith('did:key:')) {
              dreamersWithDids.push({ uuid, did: data.did, data });
              console.log(`✅ [Radicle Peer Sync] Found Dreamer with DID: "${data.dirName}" (${data.did}) with ${data.relationships.length} relationships`);
            } else {
              console.log(`⚠️ [Radicle Peer Sync] Dreamer "${data.dirName}" has no DID - skipping`);
            }
          }
        }

        console.log(`🔄 [Radicle Peer Sync] Found ${dreamersWithDids.length} Dreamers with DIDs`);

        // Helper to query existing follows for a specific repo
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);

        // Find rad command path (same pattern as npm/node finding)
        let radPath = 'rad';
        try {
          const { stdout } = await execAsync('which rad');
          radPath = stdout.trim() || 'rad';
        } catch {
          // Fallback to common locations if 'which' fails
          const commonRadPaths = [
            '/usr/local/bin/rad',
            '/opt/homebrew/bin/rad',
            `${(globalThis as any).process?.env?.HOME}/.radicle/bin/rad`
          ];

          for (const testPath of commonRadPaths) {
            try {
              await execAsync(`test -f ${testPath}`);
              radPath = testPath;
              break;
            } catch {
              continue;
            }
          }
        }

        console.log(`🔄 [Radicle Peer Sync] Using rad at: ${radPath}`);

        async function getExistingFollowsForRepo(repoPath: string): Promise<Set<string>> {
          const follows = new Set<string>();
          try {
            const { stdout } = await execAsync(`"${radPath}" follow`, { cwd: repoPath });
            // Parse output to extract DIDs (format: "did:key:..." or just the key part)
            const lines = stdout.split('\n');
            for (const line of lines) {
              const match = line.match(/did:key:[\w]+/);
              if (match) {
                follows.add(match[0]);
              }
            }
          } catch (error) {
            console.warn(`⚠️ [Radicle Peer Sync] Could not query follows for ${repoPath}:`, error);
          }
          return follows;
        }

        let totalRelationships = 0;
        let alreadyFollowing = 0;
        let alreadyDelegates = 0;
        let newFollows = 0;
        let newDelegates = 0;
        let newRemotes = 0;
        let scopeUpdates = 0;
        let errors = 0;

        // For each Dreamer with a DID, check their related nodes
        for (const { uuid: dreamerUuid, did, data: dreamerData } of dreamersWithDids) {
          const relatedNodeUuids = dreamerData.relationships || [];
          console.log(`🔄 [Radicle Peer Sync] Dreamer "${dreamerData.dirName}" has ${relatedNodeUuids.length} relationships`);

          // For each related node, check if it's a Radicle repo
          for (const relatedUuid of relatedNodeUuids) {
            const relatedData = uddDataMap.get(relatedUuid);

            if (!relatedData) {
              console.log(`🔄 [Radicle Peer Sync] Related node UUID ${relatedUuid} not found, skipping`);
              continue;
            }

            // Check if related node has a Radicle ID
            try {
              const radicleId = await radicleService.getRadicleId(relatedData.dirPath, passphrase);

              if (radicleId) {
                totalRelationships++;
                console.log(`🔄 [Radicle Peer Sync] Related node "${relatedData.dirName}" is a Radicle repo: ${radicleId}`);

                // STEP 1: Ensure peer is followed (node-level)
                const repoFollows = await getExistingFollowsForRepo(relatedData.dirPath);

                if (repoFollows.has(did)) {
                  alreadyFollowing++;
                  console.log(`✅ [Radicle Peer Sync] Already following ${did} for repo ${relatedData.dirName}`);
                } else {
                  try {
                    await radicleService.followPeer(did, passphrase, relatedData.dirPath);
                    newFollows++;
                    console.log(`✅ [Radicle Peer Sync] Now following ${did} for repo ${relatedData.dirName}`);
                  } catch (followError: any) {
                    console.error(`❌ [Radicle Peer Sync] Failed to follow ${did} for repo ${relatedData.dirName}:`, followError);
                    errors++;
                    continue; // Skip remaining steps if follow failed
                  }
                }

                // STEP 2: Add peer as equal delegate (threshold 1)
                try {
                  const wasAdded = await radicleService.addDelegate(relatedData.dirPath, did, dreamerData.dirName, passphrase);
                  if (wasAdded) {
                    newDelegates++;
                    console.log(`✅ [Radicle Peer Sync] Added ${dreamerData.dirName} as delegate for ${relatedData.dirName}`);
                  } else {
                    alreadyDelegates++;
                    console.log(`✅ [Radicle Peer Sync] ${dreamerData.dirName} already delegate for ${relatedData.dirName}`);
                  }
                } catch (delegateError: any) {
                  console.error(`❌ [Radicle Peer Sync] Failed to add delegate for ${relatedData.dirName}:`, delegateError.message);
                  errors++;
                }

                // STEP 3: Add peer's fork as git remote
                try {
                  await radicleService.addPeerRemote(relatedData.dirPath, dreamerData.dirName, radicleId, did);
                  newRemotes++;
                  console.log(`✅ [Radicle Peer Sync] Added git remote '${dreamerData.dirName}' for ${relatedData.dirName}`);
                } catch (remoteError: any) {
                  // Remote might already exist - log but don't fail
                  console.warn(`⚠️ [Radicle Peer Sync] Could not add remote (may already exist):`, remoteError.message);
                }

                // STEP 4: Set seeding scope to 'followed' (only direct peers)
                try {
                  console.log(`🔄 [Radicle Peer Sync] Setting seeding scope for ${relatedData.dirName}...`);
                  await radicleService.setSeedingScope(relatedData.dirPath, radicleId, 'followed');
                  scopeUpdates++;
                  console.log(`✅ [Radicle Peer Sync] Set seeding scope to 'followed' for ${relatedData.dirName}`);
                } catch (scopeError: any) {
                  console.error(`❌ [Radicle Peer Sync] Could not set seeding scope for ${relatedData.dirName}:`, scopeError.message);
                  errors++;
                }

              } else {
                console.log(`🔄 [Radicle Peer Sync] Related node "${relatedData.dirName}" is not a Radicle repo, skipping`);
              }
            } catch (error) {
              console.warn(`⚠️ [Radicle Peer Sync] Could not check Radicle status for "${relatedData.dirName}":`, error);
            }
          }
        }

        // Build summary message
        let summary: string;
        if (totalRelationships === 0) {
          summary = 'No Radicle relationships found';
        } else {
          const updates: string[] = [];
          if (newFollows > 0) updates.push(`${newFollows} follow${newFollows !== 1 ? 's' : ''}`);
          if (newDelegates > 0) updates.push(`${newDelegates} delegate${newDelegates !== 1 ? 's' : ''}`);
          if (newRemotes > 0) updates.push(`${newRemotes} remote${newRemotes !== 1 ? 's' : ''}`);
          if (scopeUpdates > 0) updates.push(`${scopeUpdates} scope update${scopeUpdates !== 1 ? 's' : ''}`);

          if (updates.length === 0 && errors === 0) {
            summary = `✓ All ${totalRelationships} peer relationship${totalRelationships > 1 ? 's' : ''} already configured for pure p2p!`;
          } else {
            const alreadyConfigured = alreadyFollowing + alreadyDelegates;
            summary = `Configured: ${updates.join(', ')}` +
                     (alreadyConfigured > 0 ? ` (${alreadyConfigured} already established)` : '') +
                     (errors > 0 ? ` ⚠️ ${errors} error${errors !== 1 ? 's' : ''}` : '');
          }
        }

        console.log(`✅ [Radicle Peer Sync] ${summary}`);
        new Notice(summary);

      } catch (error) {
        console.error('❌ [Radicle Peer Sync] Maintenance sync failed:', error);
        new Notice(`Failed to sync Radicle peer following: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  });
}
