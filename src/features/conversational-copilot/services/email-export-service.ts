import { App, Notice } from 'obsidian';
import { DreamNode } from '../../../types/dreamnode';
import { InvocationEvent } from './conversation-recording-service';
import { URIHandlerService } from '../../../services/uri-handler-service';

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

			// Build email components
			const subject = this.buildSubject(conversationPartner, conversationStartTime);
			const body = this.buildEmailBody(
				conversationPartner,
				conversationStartTime,
				conversationEndTime,
				invocations,
				aiSummary,
				vaultName
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
	 * Build email body with metadata, summary, and deep links (HTML format)
	 */
	private buildEmailBody(
		conversationPartner: DreamNode,
		startTime: Date,
		endTime: Date,
		invocations: InvocationEvent[],
		aiSummary: string,
		vaultName: string
	): string {
		const duration = this.calculateDuration(startTime, endTime);
		const dateStr = startTime.toLocaleDateString();
		const timeStr = startTime.toLocaleTimeString();

		// Build HTML email body with clickable links
		let body = `<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6;">`;
		body += `<p>Hi ${conversationPartner.name},</p>`;
		body += `<p>Here's a summary of our call on ${dateStr} at ${timeStr} (Duration: ${duration}):</p>`;

		// Add AI-generated summary (preserve line breaks)
		body += `<div style="margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 5px;">`;
		body += aiSummary.replace(/\n/g, '<br>');
		body += `</div>`;

		// Add invoked DreamNodes section if any
		if (invocations.length > 0) {
			body += `<hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">`;
			body += `<h2 style="color: #333;">Shared DreamNodes</h2>`;
			body += `<p>During our conversation, I shared ${invocations.length} DreamNode${invocations.length > 1 ? 's' : ''}:</p>`;
			body += `<ul style="list-style: none; padding: 0;">`;

			invocations.forEach((inv, i) => {
				const invTimeStr = inv.timestamp.toLocaleTimeString();
				const deepLink = URIHandlerService.generateSingleNodeLink(vaultName, inv.dreamUUID);
				body += `<li style="margin: 15px 0; padding: 10px; background: #f9f9f9; border-left: 3px solid #4a90e2;">`;
				body += `<strong>${i + 1}. ${inv.nodeName}</strong> <span style="color: #666;">(${invTimeStr})</span><br>`;
				body += `<a href="${deepLink}" style="color: #4a90e2; text-decoration: none;">→ Click to clone this DreamNode</a>`;
				body += `</li>`;
			});

			body += `</ul>`;

			// Add batch clone link if multiple nodes
			if (invocations.length > 1) {
				const uuids = invocations.map(inv => inv.dreamUUID);
				const batchLink = URIHandlerService.generateBatchNodeLink(vaultName, uuids);
				body += `<p style="margin: 20px 0; padding: 15px; background: #e8f4f8; border-radius: 5px;">`;
				body += `📦 <strong>Clone all shared nodes at once:</strong> `;
				body += `<a href="${batchLink}" style="color: #4a90e2; text-decoration: none;">Click here to clone all ${invocations.length} nodes</a>`;
				body += `</p>`;
			}
		}

		// Add InterBrain download link
		body += `<hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">`;
		body += `<p>💡 <strong>New to InterBrain?</strong> `;
		body += `<a href="https://github.com/ProjectLiminality/InterBrain?tab=readme-ov-file#installation--setup" style="color: #4a90e2;">Download and install here</a></p>`;
		body += `<p style="color: #666; font-size: 14px;">Once installed, you can click the links above to instantly add these DreamNodes to your vault!</p>`;

		body += `<p style="margin-top: 30px;">Looking forward to our next conversation!</p>`;
		body += `</body></html>`;

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
		// Escape strings for AppleScript (different for subject vs HTML body)
		const escapeASText = (str: string): string => {
			return str
				.replace(/\\/g, '\\\\')
				.replace(/"/g, '\\"');
		};

		const escapedTo = escapeASText(to);
		const escapedSubject = escapeASText(subject);

		// For HTML content, we need to escape quotes but preserve the HTML structure
		// We'll write the HTML to a temporary variable in AppleScript
		const escapedBody = body
			.replace(/\\/g, '\\\\')
			.replace(/"/g, '\\"')
			.replace(/\$/g, '\\$'); // Escape dollar signs for AppleScript

		// Build AppleScript to create email draft with HTML content
		const appleScript = `
tell application "Mail"
	activate
	set htmlContent to "${escapedBody}"
	set newMessage to make new outgoing message with properties {subject:"${escapedSubject}", visible:true}
	tell newMessage
		${to ? `make new to recipient at end of to recipients with properties {address:"${escapedTo}"}` : ''}
		set html content to htmlContent
	end tell
end tell
`;

		console.log(`🍎 [EmailExport] Executing AppleScript to create Mail draft`);
		console.log(`🍎 [EmailExport] AppleScript preview (first 500 chars):`, appleScript.substring(0, 500));

		try {
			// Access Node.js child_process through Obsidian's environment
			const { exec } = (window as any).require('child_process');

			// Execute AppleScript
			const command = `osascript -e '${appleScript.replace(/'/g, "'\\''")}'`;
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
