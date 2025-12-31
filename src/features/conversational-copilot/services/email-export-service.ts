import { App, Notice } from 'obsidian';
import { DreamNode } from '../../dreamnode';
import { InvocationEvent } from './conversation-recording-service';
import { URIHandlerService } from '../../uri-handler';
import { ShareLinkService } from '../../github-publishing/services/share-link-service';
import { serviceManager } from '../../../core/services/service-manager';
import { useInterBrainStore } from '../../../core/store/interbrain-store';
import { ManualEmailModal } from '../ui/ManualEmailModal';
// PDF generation disabled for now - keeping import for future use
// import { getPDFGeneratorService } from './pdf-generator-service';
// import * as os from 'os';
import * as path from 'path';

/**
 * Email Export Service
 *
 * - macOS: Generates pre-filled Apple Mail drafts
 * - Windows/Linux: Shows modal with copyable email fields
 */
export class EmailExportService {
	private app: App;
	private plugin: any;

	constructor(app: App, plugin: any) {
		this.app = app;
		this.plugin = plugin;
	}

	/**
	 * Check if running on macOS
	 */
	private isMacOS(): boolean {
		// eslint-disable-next-line no-undef
		return process.platform === 'darwin';
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

					// CRITICAL: Trigger background seeding so node is discoverable via seeds
					// This is the same step that copyShareLink() does but generateShareLink() skips
					if (identifier.startsWith('rad:') && nodeData.node.repoPath) {
						const absoluteRepoPath = path.join((this.app.vault.adapter as any).basePath, nodeData.node.repoPath);
						radicleService.seedInBackground(absoluteRepoPath, identifier);
						console.log(`🌐 [EmailExport] Triggered background seeding for "${inv.nodeName}"`);
					}

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

			// Get recipient email (from metadata or parameter)
			const toEmail = recipientEmail || await this.getRecipientEmail(conversationPartner);

			// Platform-specific email creation
			if (this.isMacOS()) {
				// macOS: Create Apple Mail draft
				await this.createMailDraft(toEmail, subject, body);
				new Notice('Email draft created in Apple Mail');
				console.log(`✅ [EmailExport] Email draft created successfully`);
			} else {
				// Windows/Linux: Show modal with copyable fields
				const modal = new ManualEmailModal(this.app, {
					to: toEmail,
					subject: subject,
					body: body
				});
				modal.open();
				console.log(`✅ [EmailExport] Manual email modal opened`);
			}

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
		_dreamerUuid?: string,
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
			body += `Shared DreamNodes\n\n`;
			body += `During our conversation, I shared ${sharedLinks.length} DreamNode${sharedLinks.length > 1 ? 's' : ''}:\n\n`;

			sharedLinks.forEach((link, i) => {
				body += `${i + 1}. ${link.nodeName}\n`;
				body += `   ${link.uri}\n\n`;
			});

			// Add batch clone link
			const allIdentifiers = sharedLinks.map(l => l.identifier);
			const batchLink = URIHandlerService.generateBatchNodeLink('', allIdentifiers, senderDid, senderName, senderEmail);
			body += `Get all at once: ${batchLink}\n\n`;
		}

		// Add InterBrain installation section
		body += `---\n\n`;
		body += `New to InterBrain?\n\n`;
		body += `Install InterBrain first, then come back and click the links above.\n\n`;
		body += `Installation Guide: https://github.com/ProjectLiminality/InterBrain#installation--setup\n\n`;

		// Add donation/support section
		body += `---\n\n`;
		body += `Support the Mission\n\n`;
		body += `As a core component of Project Liminality's mission to heal the fragmentation of the human family, InterBrain is being developed 100% independently based on crowdfunding support. If you resonate with this vision consider donating here:\n\n`;
		body += `https://opencollective.com/projectliminality\n\n`;

		body += `---\n\n`;
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
	 * Create Apple Mail draft using AppleScript (plain text, no attachment)
	 */
	private async createMailDraft(to: string, subject: string, body: string): Promise<void> {
		console.log(`📧 [EmailExport] Creating Apple Mail draft via AppleScript`);
		console.log(`📧 [EmailExport] Recipient:`, to);

		try {
			const childProcess = (window as any).require('child_process');
			const fs = (window as any).require('fs');
			const os = (window as any).require('os');
			const nodePath = (window as any).require('path');
			const { exec } = childProcess;

			// Write AppleScript to temp file to avoid shell escaping issues
			const tempScriptPath = nodePath.join(os.tmpdir(), `interbrain-mail-${Date.now()}.scpt`);

			// Build AppleScript with proper string escaping for AppleScript (not shell)
			const escapeForAppleScript = (str: string): string => {
				return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
			};

			const appleScript = `
tell application "Mail"
	set newMessage to make new outgoing message with properties {subject:"${escapeForAppleScript(subject)}", content:"${escapeForAppleScript(body)}", visible:true}

	tell newMessage
		make new to recipient with properties {address:"${escapeForAppleScript(to)}"}
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

			console.log(`✅ [EmailExport] Email draft created`);
		} catch (error) {
			console.error('❌ [EmailExport] Failed to create Mail draft:', error);
			throw new Error('Failed to create email draft via AppleScript');
		}
	}

	// PDF generation disabled for now - keeping method for future use
	// /**
	//  * Create Apple Mail draft using AppleScript with body content + PDF attachment
	//  */
	// private async createMailDraftWithPDF(to: string, subject: string, body: string, pdfPath: string): Promise<void> {
	// 	// ... PDF attachment logic preserved for future use
	// }
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
