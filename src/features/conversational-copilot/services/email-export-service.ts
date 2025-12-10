import { App, Notice } from 'obsidian';
import { DreamNode } from '../../dreamnode';
import { InvocationEvent } from './conversation-recording-service';
import { URIHandlerService } from '../../uri-handler';
import { ShareLinkService } from '../../github-publishing/share-link-service';
import { serviceManager } from '../../../core/services/service-manager';
import { useInterBrainStore } from '../../../core/store/interbrain-store';
import { getPDFGeneratorService } from './pdf-generator-service';
import * as os from 'os';
import * as path from 'path';

/**
 * Email Export Service
 *
 * Generates pre-filled Apple Mail drafts with conversation summaries and deep links
 */
export class EmailExportService {
	private app: App;
	private plugin: any;

	constructor(app: App, plugin: any) {
		this.app = app;
		this.plugin = plugin;
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

			// Get recipient DID if available (for automatic delegation)
			const recipientDid = conversationPartner.did;
			console.log(`👤 [EmailExport] Recipient DID: ${recipientDid || 'none'}`);

			// Get sender's identity for collaboration handshake
			const radicleService = serviceManager.getRadicleService();
			let senderDid: string | undefined;
			let senderName: string | undefined;
	
			try {
				const identity = await radicleService.getIdentity();
				senderDid = identity.did;
				senderName = identity.alias || 'Friend';
				console.log(`👤 [EmailExport] Sender identity: ${senderName} (${senderDid})`);
			} catch (error) {
				console.warn('⚠️ [EmailExport] Could not get Radicle identity:', error);
			}

			// Get sender's email from settings (optional)
			const senderEmail = this.plugin.settings?.userEmail || undefined;
			if (senderEmail) {
				console.log(`📧 [EmailExport] Sender email: ${senderEmail}`);
			}

			// Get peer's Dreamer node UUID (for DID backpropagation)
			const dreamerUuid = conversationPartner.id;
			console.log(`👤 [EmailExport] Peer Dreamer node UUID: ${dreamerUuid} (${conversationPartner.name})`);

			// Share each invoked node and collect URIs
			const shareLinkService = new ShareLinkService(this.app, this.plugin);
			const sharedLinks: Array<{ nodeName: string; uri: string; identifier: string }> = [];

			console.log(`🔗 [EmailExport] Sharing ${invocations.length} invoked nodes...`);

			for (const inv of invocations) {
				try {
					const nodeData = useInterBrainStore.getState().dreamNodes.get(inv.dreamUUID);
					if (!nodeData?.node) {
						console.warn(`⚠️ [EmailExport] Node not found in store: ${inv.dreamUUID} (${inv.nodeName})`);
						continue;
					}

					// Share the node (init Radicle → publish → add delegate → generate URI)
					const { uri, identifier } = await shareLinkService.generateShareLink(nodeData.node, recipientDid);

					sharedLinks.push({
						nodeName: inv.nodeName,
						uri: uri,
						identifier: identifier
					});

					console.log(`✅ [EmailExport] Shared "${inv.nodeName}": ${identifier}`);
				} catch (error) {
					console.error(`❌ [EmailExport] Failed to share "${inv.nodeName}":`, error);
					// Continue with other nodes
				}
			}

			console.log(`✅ [EmailExport] Successfully shared ${sharedLinks.length}/${invocations.length} nodes`);

			// Build email components
			const subject = this.buildSubject(conversationPartner, conversationStartTime);
			const body = this.buildEmailBody(
				conversationPartner,
				conversationStartTime,
				conversationEndTime,
				sharedLinks,
				aiSummary,
				senderDid,
				senderName,
				dreamerUuid,
				senderEmail
			);

			// Collect deep links for PDF
			const deepLinks = sharedLinks.map(link => ({
				nodeName: link.nodeName,
				link: link.uri
			}));

			// Extract identifiers for batch link
			const allIdentifiers = sharedLinks.map(link => link.identifier);

			// Build install script links for PDF (using interactive mode with bash wrapper)
			const installScriptBase = 'https://raw.githubusercontent.com/ProjectLiminality/InterBrain/main/install.sh';
			const interbrainGitHub = 'github.com/ProjectLiminality/InterBrain';
			const conservativeIdentifiers = [interbrainGitHub];
			const conservativeUri = URIHandlerService.generateBatchNodeLink(vaultName, conservativeIdentifiers, senderDid, senderName, senderEmail);
			const dreamerUuidParam = dreamerUuid ? ` --dreamer-uuid "${dreamerUuid}"` : '';
			const conservativeInstall = `bash <(curl -fsSL ${installScriptBase}) --uri "${conservativeUri}"${dreamerUuidParam}`;

			let fullInstall: string | undefined;
			if (invocations.length > 0 && allIdentifiers.length > 0) {
				const fullIdentifiers = [interbrainGitHub, ...allIdentifiers];
				const fullUri = URIHandlerService.generateBatchNodeLink(vaultName, fullIdentifiers, senderDid, senderName, senderEmail);
				fullInstall = `bash <(curl -fsSL ${installScriptBase}) --uri "${fullUri}"${dreamerUuidParam}`;
			}

			const installLinks = {
				conservative: conservativeInstall,
				full: fullInstall
			};

			// Generate PDF with ALL content (no separate email body needed)
			const pdfPath = path.join(os.tmpdir(), `interbrain-summary-${Date.now()}.pdf`);
			const pdfGenerator = getPDFGeneratorService();
			await pdfGenerator.generateCallSummary(
				conversationPartner,
				conversationStartTime,
				conversationEndTime,
				invocations,
				aiSummary,
				deepLinks,
				installLinks,
				pdfPath
			);

			// Get recipient email (from metadata or parameter)
			const toEmail = recipientEmail || await this.getRecipientEmail(conversationPartner);

			// Create .eml with plain text body + PDF attachment
			await this.createMailDraftWithPDF(toEmail, subject, body, pdfPath);

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
		sharedLinks: Array<{ nodeName: string; uri: string; identifier: string }>,
		aiSummary: string,
		senderDid?: string,
		senderName?: string,
		dreamerUuid?: string,
		senderEmail?: string
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
		if (sharedLinks.length > 0) {
			body += `---\n\n`;
			body += `## Shared DreamNodes\n\n`;
			body += `During our conversation, I shared ${sharedLinks.length} DreamNode${sharedLinks.length > 1 ? 's' : ''}:\n\n`;

			sharedLinks.forEach((link, i) => {
				body += `${i + 1}. **${link.nodeName}**\n`;
				body += `   → ${link.uri}\n\n`;
			});

			// Add batch clone link if multiple nodes shared
			if (sharedLinks.length > 1) {
				const allIdentifiers = sharedLinks.map(l => l.identifier);
				const batchLink = URIHandlerService.generateBatchNodeLink('', allIdentifiers, senderDid, senderName, senderEmail);
				body += `\n📦 **Clone all shared nodes at once**: ${batchLink}\n\n`;
			}
		}

		// Add InterBrain installation options
		body += `---\n\n`;
		body += `## 💡 New to InterBrain?\n\n`;
		body += `Choose your installation path:\n\n`;

		// Build install script URIs (using interactive mode with bash wrapper)
		const installScriptBase = 'https://raw.githubusercontent.com/ProjectLiminality/InterBrain/main/install.sh';

		// Conservative install: Just InterBrain + sender connection (always included)
		const interbrainGitHub = 'github.com/ProjectLiminality/InterBrain';
		const conservativeIdentifiers = [interbrainGitHub];
		const conservativeUri = URIHandlerService.generateBatchNodeLink('', conservativeIdentifiers, senderDid, senderName, senderEmail);
		const dreamerUuidParam = dreamerUuid ? ` --dreamer-uuid "${dreamerUuid}"` : '';
		const conservativeInstall = `bash <(curl -fsSL ${installScriptBase}) --uri "${conservativeUri}"${dreamerUuidParam}`;

		body += `**🌱 Minimal Install** (InterBrain + connection to ${senderName || 'me'}):\n\n`;
		body += `\`\`\`\n${conservativeInstall}\n\`\`\`\n\n`;

		// Full install: InterBrain + all shared nodes (if any were shared during call)
		if (sharedLinks.length > 0) {
			const allIdentifiers = sharedLinks.map(l => l.identifier);
			const fullIdentifiers = [interbrainGitHub, ...allIdentifiers];
			const fullUri = URIHandlerService.generateBatchNodeLink('', fullIdentifiers, senderDid, senderName, senderEmail);
			const fullInstall = `bash <(curl -fsSL ${installScriptBase}) --uri "${fullUri}"${dreamerUuidParam}`;

			body += `**🚀 Full Install** (InterBrain + all ${sharedLinks.length} shared DreamNode${sharedLinks.length > 1 ? 's' : ''}):\n\n`;
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
	 * Create Apple Mail draft using AppleScript with body content + PDF attachment
	 */
	private async createMailDraftWithPDF(to: string, subject: string, body: string, pdfPath: string): Promise<void> {
		console.log(`📧 [EmailExport] Creating Apple Mail draft via AppleScript`);
		console.log(`📧 [EmailExport] PDF path:`, pdfPath);
		console.log(`📧 [EmailExport] Recipient:`, to);

		try {
			const childProcess = (window as any).require('child_process');
			const fs = (window as any).require('fs');
			const os = (window as any).require('os');
			const path = (window as any).require('path');
			const { exec } = childProcess;

			// Write AppleScript to temp file to avoid shell escaping issues
			const tempScriptPath = path.join(os.tmpdir(), `interbrain-mail-${Date.now()}.scpt`);

			// Build AppleScript with proper string escaping for AppleScript (not shell)
			const escapeForAppleScript = (str: string): string => {
				return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
			};

			const appleScript = `
tell application "Mail"
	set newMessage to make new outgoing message with properties {subject:"${escapeForAppleScript(subject)}", content:"${escapeForAppleScript(body)}", visible:true}

	tell newMessage
		make new to recipient with properties {address:"${escapeForAppleScript(to)}"}

		-- Attach PDF file
		make new attachment with properties {file name:POSIX file "${escapeForAppleScript(pdfPath)}"} at after the last paragraph
	end tell

	activate
end tell
`;

			// Write script to temp file
			fs.writeFileSync(tempScriptPath, appleScript, 'utf-8');

			// Execute via temp file (no shell escaping needed!)
			await new Promise<void>((resolve, reject) => {
				exec(`osascript "${tempScriptPath}"`, (error: any, stdout: any, stderr: any) => {
					// Clean up temp file
					try {
						fs.unlinkSync(tempScriptPath);
					} catch (cleanupError) {
						console.warn('⚠️ [EmailExport] Failed to clean up temp script:', cleanupError);
					}

					if (error) {
						console.error('❌ [EmailExport] AppleScript failed:', error);
						console.error('❌ [EmailExport] stderr:', stderr);
						reject(error);
					} else {
						console.log('✅ [EmailExport] Apple Mail draft created successfully');
						resolve();
					}
				});
			});

			console.log(`✅ [EmailExport] Email draft created with body + PDF attachment`);
		} catch (error) {
			console.error('❌ [EmailExport] Failed to create Mail draft:', error);
			throw new Error('Failed to create email draft via AppleScript');
		}
	}
}

// Singleton instance
let _emailExportService: EmailExportService | null = null;

export function initializeEmailExportService(app: App, plugin: any): void {
	_emailExportService = new EmailExportService(app, plugin);
	console.log(`📧 [EmailExport] Service initialized`);
}

export function getEmailExportService(): EmailExportService {
	if (!_emailExportService) {
		throw new Error('EmailExportService not initialized. Call initializeEmailExportService() first.');
	}
	return _emailExportService;
}
