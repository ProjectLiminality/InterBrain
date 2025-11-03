import { App, Notice } from 'obsidian';
import { DreamNode } from '../../../types/dreamnode';
import { InvocationEvent } from './conversation-recording-service';
import { URIHandlerService } from '../../../services/uri-handler-service';
import { getRadicleBatchInitService } from '../../../services/radicle-batch-init-service';
import { getGitHubBatchShareService } from '../../../services/github-batch-share-service';
import { serviceManager } from '../../../services/service-manager';
import { useInterBrainStore } from '../../../store/interbrain-store';

/**
 * Email Export Service
 *
 * Generates pre-filled Apple Mail drafts with conversation summaries and deep links
 */
export class EmailExportService {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Export conversation as pre-filled email draft
	 */
	async exportToEmail(
		conversationPartner: DreamNode,
		conversationStartTime: Date,
		conversationEndTime: Date,
		invocations: InvocationEvent[],
		aiSummary: string,
		recipientEmail?: string
	): Promise<void> {
		try {
			console.log(`📧 [EmailExport] Generating email for conversation with ${conversationPartner.name}`);

			// Get vault name for deep links
			const vaultName = this.app.vault.getName();

			// Check if Radicle is available on this machine FIRST
			const radicleService = serviceManager.getRadicleService();
			const radicleAvailable = await radicleService.isAvailable();

			let uuidToRadicleIdMap = new Map<string, string>();
			let uuidToGitHubUrlMap = new Map<string, string>();

			if (radicleAvailable) {
				// CRITICAL: Ensure all invoked nodes have Radicle IDs before generating links
				const nodeUUIDs = invocations.map(inv => inv.dreamUUID);
				console.log(`🔮 [EmailExport] Radicle available - ensuring ${nodeUUIDs.length} nodes have Radicle IDs...`);

				try {
					const batchInitService = getRadicleBatchInitService();
					uuidToRadicleIdMap = await batchInitService.ensureNodesHaveRadicleIds(nodeUUIDs);
					console.log(`✅ [EmailExport] ${uuidToRadicleIdMap.size}/${nodeUUIDs.length} nodes have Radicle IDs`);
				} catch (error) {
					console.error('❌ [EmailExport] Batch init failed, will use fallback:', error);
					// Continue with fallback for all nodes
				}
			} else {
				// FALLBACK: Ensure all invoked nodes have GitHub URLs before generating links
				const nodeUUIDs = invocations.map(inv => inv.dreamUUID);
				console.log(`🧪 [EmailExport] Radicle not available - ensuring ${nodeUUIDs.length} nodes have GitHub URLs...`);

				try {
					const batchShareService = getGitHubBatchShareService();
					uuidToGitHubUrlMap = await batchShareService.ensureNodesHaveGitHubUrls(nodeUUIDs);
					console.log(`✅ [EmailExport] ${uuidToGitHubUrlMap.size}/${nodeUUIDs.length} nodes have GitHub URLs`);
				} catch (error) {
					console.error('❌ [EmailExport] Batch GitHub share failed, will use UUID fallback:', error);
					// Continue with UUID fallback for all nodes
				}
			}


		// Get sender's identity for collaboration handshake
		let senderDid: string | undefined;
		let senderName: string | undefined;

		if (radicleAvailable) {
			try {
				const identity = await radicleService.getIdentity();
				senderDid = identity.did;
				senderName = identity.alias || 'Friend';
				console.log(`👤 [EmailExport] Sender identity: ${senderName} (${senderDid})`);
			} catch (error) {
				console.warn('⚠️ [EmailExport] Could not get Radicle identity:', error);
			}
		}
			// Build email components (with Radicle IDs or GitHub URLs where available)
			const subject = this.buildSubject(conversationPartner, conversationStartTime);
			const body = this.buildEmailBody(
				conversationPartner,
				conversationStartTime,
				conversationEndTime,
				invocations,
				aiSummary,
				vaultName,
				uuidToRadicleIdMap,
				uuidToGitHubUrlMap,
				senderDid,
				senderName
			);

			// Get recipient email (from metadata or parameter)
			const toEmail = recipientEmail || await this.getRecipientEmail(conversationPartner);

			// Generate and execute AppleScript
			await this.createMailDraft(toEmail, subject, body);

			new Notice('Email draft created in Apple Mail');
			console.log(`✅ [EmailExport] Email draft created successfully`);

		} catch (error) {
			console.error('Failed to export email:', error);
			throw new Error(`Email export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Build email subject line
	 */
	private buildSubject(conversationPartner: DreamNode, startTime: Date): string {
		const dateStr = startTime.toLocaleDateString();
		return `Call Summary: ${conversationPartner.name} - ${dateStr}`;
	}

	/**
	 * Build email body with metadata, summary, and deep links
	 */
	private buildEmailBody(
		conversationPartner: DreamNode,
		startTime: Date,
		endTime: Date,
		invocations: InvocationEvent[],
		aiSummary: string,
		vaultName: string,
		uuidToRadicleIdMap: Map<string, string>,
		uuidToGitHubUrlMap: Map<string, string>,
		senderDid?: string,
		senderName?: string
	): string {
		const duration = this.calculateDuration(startTime, endTime);
		const dateStr = startTime.toLocaleDateString();
		const timeStr = startTime.toLocaleTimeString();

		// Build email body
		let body = `Hi ${conversationPartner.name},\n\n`;
		body += `Here's a summary of our call on ${dateStr} at ${timeStr} (Duration: ${duration}):\n\n`;

		// Add AI-generated summary (if available)
		if (aiSummary && aiSummary.trim()) {
			body += `${aiSummary}\n\n`;
		}

		// Add invoked DreamNodes section if any
		if (invocations.length > 0) {
			body += `---\n\n`;
			body += `## Shared DreamNodes\n\n`;
			body += `During our conversation, I shared ${invocations.length} DreamNode${invocations.length > 1 ? 's' : ''}:\n\n`;

			// Get store to access node metadata (for GitHub URLs)
			const store = useInterBrainStore.getState();

			// Track all identifiers for batch link (mixed Radicle/GitHub/UUID)
			const allIdentifiers: string[] = [];

			invocations.forEach((inv, i) => {
				const invTimeStr = inv.timestamp.toLocaleTimeString();

				// Four-tier fallback: Radicle ID → Batch GitHub URL → Store GitHub URL → UUID
				const radicleId = uuidToRadicleIdMap.get(inv.dreamUUID);
				const githubUrlFromBatch = uuidToGitHubUrlMap.get(inv.dreamUUID);
				const nodeData = store.realNodes.get(inv.dreamUUID);
				const node = nodeData?.node;

				let deepLink: string;
				let identifier: string;

				if (radicleId) {
					// Primary: Radicle ID (peer-to-peer) with collaboration handshake
					deepLink = URIHandlerService.generateSingleNodeLink(vaultName, radicleId, senderDid, senderName);
					identifier = radicleId;
				} else if (githubUrlFromBatch) {
					// Fallback 1: GitHub URL from batch share (just pushed!)
					deepLink = URIHandlerService.generateGitHubCloneLink(vaultName, githubUrlFromBatch);
					// For batch link, store the repo path without protocol
					identifier = githubUrlFromBatch.replace(/^https?:\/\//, '');
					console.log(`📧 [EmailExport] Using batch GitHub URL for "${inv.nodeName}": ${githubUrlFromBatch}`);
				} else if (node?.githubRepoUrl) {
					// Fallback 2: GitHub URL from store (already existed)
					deepLink = URIHandlerService.generateGitHubCloneLink(vaultName, node.githubRepoUrl);
					// For batch link, store the repo path without protocol
					identifier = node.githubRepoUrl.replace(/^https?:\/\//, '');
					console.log(`📧 [EmailExport] Using stored GitHub URL for "${inv.nodeName}"`);
				} else {
					// Last resort: UUID (legacy, requires network broadcast)
					deepLink = URIHandlerService.generateSingleNodeLink(vaultName, inv.dreamUUID, senderDid, senderName);
					identifier = inv.dreamUUID;
					console.warn(`⚠️ [EmailExport] Node "${inv.nodeName}" has no Radicle ID or GitHub URL, using UUID fallback`);
				}

				allIdentifiers.push(identifier);

				body += `${i + 1}. **${inv.nodeName}** (${invTimeStr})\n`;
				body += `   → ${deepLink}\n\n`;
			});

			// Add batch clone link if multiple nodes shared
			if (invocations.length > 1) {
				const batchLink = URIHandlerService.generateBatchNodeLink(vaultName, allIdentifiers, senderDid, senderName);
				body += `\n📦 **Clone all shared nodes at once**: ${batchLink}\n\n`;
			}
		}

		// Add InterBrain installation options
		body += `---\n\n`;
		body += `## 💡 New to InterBrain?\n\n`;
		body += `Choose your installation path:\n\n`;

		// Build install script URIs
		const installScriptBase = 'https://raw.githubusercontent.com/ProjectLiminality/InterBrain/main/install.sh';

		// Conservative install: Just InterBrain + sender connection (always included)
		const interbrainGitHub = 'github.com/ProjectLiminality/InterBrain';
		const conservativeIdentifiers = [interbrainGitHub]; // Always include InterBrain itself
		const conservativeUri = URIHandlerService.generateBatchNodeLink(vaultName, conservativeIdentifiers, senderDid, senderName);
		const conservativeInstall = `curl -fsSL ${installScriptBase} | bash -s -- --uri "${conservativeUri}"`;

		body += `**🌱 Minimal Install** (InterBrain + connection to ${senderName || 'me'}):\n\n`;
		body += `\`\`\`\n${conservativeInstall}\n\`\`\`\n\n`;

		// Full install: InterBrain + all shared nodes (if any were shared during call)
		if (invocations.length > 0 && allIdentifiers.length > 0) {
			// Include InterBrain in the batch link along with all shared nodes
			const fullIdentifiers = [interbrainGitHub, ...allIdentifiers];
			const fullUri = URIHandlerService.generateBatchNodeLink(vaultName, fullIdentifiers, senderDid, senderName);
			const fullInstall = `curl -fsSL ${installScriptBase} | bash -s -- --uri "${fullUri}"`;

			body += `**🚀 Full Install** (InterBrain + all ${invocations.length} shared DreamNode${invocations.length > 1 ? 's' : ''}):\n\n`;
			body += `\`\`\`\n${fullInstall}\n\`\`\`\n\n`;
		}

		body += `Copy either command into Terminal to get started!\n\n`;
		body += `Or visit: https://github.com/ProjectLiminality/InterBrain?tab=readme-ov-file#installation--setup\n\n`;

		body += `Looking forward to our next conversation!\n`;

		return body;
	}

	/**
	 * Calculate conversation duration in human-readable format
	 */
	private calculateDuration(startTime: Date, endTime: Date): string {
		const durationMs = endTime.getTime() - startTime.getTime();
		const minutes = Math.floor(durationMs / 60000);
		const seconds = Math.floor((durationMs % 60000) / 1000);

		if (minutes > 0) {
			return `${minutes} minute${minutes > 1 ? 's' : ''}`;
		} else {
			return `${seconds} second${seconds > 1 ? 's' : ''}`;
		}
	}

	/**
	 * Get recipient email from DreamNode metadata
	 */
	private async getRecipientEmail(conversationPartner: DreamNode): Promise<string> {
		try {
			// Read metadata to get email
			const metadataPath = `${conversationPartner.repoPath}/.udd`;
			const metadataContent = await (this.app.vault.adapter as any).read(metadataPath);
			const metadata = JSON.parse(metadataContent);

			return metadata.email || '';
		} catch (error) {
			console.warn(`⚠️ [EmailExport] Could not read email from metadata:`, error);
			return '';
		}
	}

	/**
	 * Create Apple Mail draft using AppleScript via Electron
	 */
	private async createMailDraft(to: string, subject: string, body: string): Promise<void> {
		// Escape strings for AppleScript
		const escapeAS = (str: string): string => {
			return str
				.replace(/\\/g, '\\\\')
				.replace(/"/g, '\\"')
				.replace(/\n/g, '\\n')
				.replace(/\r/g, '\\r');
		};

		const escapedTo = escapeAS(to);
		const escapedSubject = escapeAS(subject);
		const escapedBody = escapeAS(body);

		// Build AppleScript to create email draft
		const appleScript = `
tell application "Mail"
	activate
	set newMessage to make new outgoing message with properties {subject:"${escapedSubject}", content:"${escapedBody}", visible:true}
	tell newMessage
		${to ? `make new to recipient at end of to recipients with properties {address:"${escapedTo}"}` : ''}
	end tell
end tell
`;

		console.log(`🍎 [EmailExport] Executing AppleScript to create Mail draft`);
		console.log(`🍎 [EmailExport] AppleScript preview (first 500 chars):`, appleScript.substring(0, 500));

		try {
			// Check if require is available
			if (!(window as any).require) {
				console.error('❌ [EmailExport] window.require is not available');
				throw new Error('Node.js require not available in this environment');
			}

			console.log('✅ [EmailExport] window.require is available');

			// Access Node.js child_process through Obsidian's environment
			const childProcess = (window as any).require('child_process');
			console.log('✅ [EmailExport] child_process module loaded:', !!childProcess);

			const { exec } = childProcess;
			console.log('✅ [EmailExport] exec function available:', typeof exec);

			// Execute AppleScript
			const command = `osascript -e '${appleScript.replace(/'/g, "'\\''")}'`;
			console.log(`🍎 [EmailExport] Command length:`, command.length);
			console.log(`🍎 [EmailExport] Executing command...`);

			await new Promise<void>((resolve, reject) => {
				exec(command, (error: any, stdout: any, stderr: any) => {
					if (error) {
						console.error('❌ [EmailExport] AppleScript error:', error);
						console.error('❌ [EmailExport] stderr:', stderr);
						reject(error);
					} else {
						console.log('✅ [EmailExport] AppleScript stdout:', stdout);
						resolve();
					}
				});
			});

			console.log(`✅ [EmailExport] AppleScript executed successfully`);
		} catch (error) {
			console.error('❌ [EmailExport] AppleScript execution failed:', error);
			throw new Error('Failed to create email draft - ensure Apple Mail is installed');
		}
	}
}

// Singleton instance
let _emailExportService: EmailExportService | null = null;

export function initializeEmailExportService(app: App): void {
	_emailExportService = new EmailExportService(app);
	console.log(`📧 [EmailExport] Service initialized`);
}

export function getEmailExportService(): EmailExportService {
	if (!_emailExportService) {
		throw new Error('EmailExportService not initialized. Call initializeEmailExportService() first.');
	}
	return _emailExportService;
}
