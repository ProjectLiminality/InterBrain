import { jsPDF } from 'jspdf';
import * as fs from 'fs';
import { DreamNode } from '../../dreamnode';
import { InvocationEvent } from './conversation-recording-service';

/**
 * PDF Generator Service
 *
 * Creates beautiful PDF summaries of video calls with:
 * - Black background with blue accents (InterBrain aesthetic)
 * - Clickable DreamNode links
 * - Professional typography
 * - Deep links to shared content
 */
export class PDFGeneratorService {

	/**
	 * Generate a beautiful PDF summary of a conversation
	 */
	async generateCallSummary(
		conversationPartner: DreamNode,
		conversationStartTime: Date,
		conversationEndTime: Date,
		invocations: InvocationEvent[],
		aiSummary: string,
		deepLinks: Array<{ nodeName: string; link: string; renderedImageDataUrl?: string }>,
		installLinks: { conservative: string; full?: string },
		outputPath: string
	): Promise<string> {
		console.log('📄 [PDFGenerator] Creating PDF document with jsPDF...');

		// Calculate approximate content height
		const margin = 50;
		const pageWidth = 595; // A4 width in points

		// Estimate total height needed
		let estimatedHeight = 80; // Header start
		estimatedHeight += 120; // Header section

		// Summary section
		if (aiSummary && aiSummary.trim()) {
			const summaryLines = Math.ceil(aiSummary.length / 80); // Rough estimate
			estimatedHeight += 50 + (summaryLines * 14);
		}

		// DreamNodes section (images + titles)
		estimatedHeight += 50; // Section header
		estimatedHeight += invocations.length * (150 + 20 + 25 + 25); // image + padding + title + spacing

		// Installation section
		estimatedHeight += 400; // Installation instructions

		estimatedHeight += 100; // Bottom padding

		// Create PDF with custom height (one long page)
		const doc = new jsPDF({
			orientation: 'portrait',
			unit: 'pt',
			format: [pageWidth, estimatedHeight]
		});

		const pageHeight = doc.internal.pageSize.getHeight();
		const contentWidth = pageWidth - (margin * 2);

		// Black background for entire page
		doc.setFillColor(0, 0, 0);
		doc.rect(0, 0, pageWidth, pageHeight, 'F');

		let yPosition = 80;

		// --- HEADER ---
		doc.setFontSize(28);
		doc.setTextColor(74, 144, 226); // #4A90E2 blue
		doc.text('Post-Call Summary', pageWidth / 2, yPosition, { align: 'center' });

		yPosition += 40;

		// Partner name
		doc.setFontSize(18);
		doc.setTextColor(255, 255, 255);
		doc.text(`Conversation with ${conversationPartner.name}`, pageWidth / 2, yPosition, { align: 'center' });

		yPosition += 30;

		// Date and time
		const dateStr = conversationStartTime.toLocaleDateString();
		const timeStr = conversationStartTime.toLocaleTimeString();
		const duration = this.calculateDuration(conversationStartTime, conversationEndTime);

		doc.setFontSize(12);
		doc.setTextColor(153, 153, 153); // #999999 gray
		doc.text(`${dateStr} at ${timeStr} • ${duration}`, pageWidth / 2, yPosition, { align: 'center' });

		yPosition += 50;

		// --- AI SUMMARY ---
		if (aiSummary && aiSummary.trim()) {
			doc.setFontSize(14);
			doc.setTextColor(74, 144, 226); // Blue
			doc.text('Summary', margin, yPosition);

			yPosition += 20;

			doc.setFontSize(11);
			doc.setTextColor(204, 204, 204); // #CCCCCC light gray
			const summaryLines = doc.splitTextToSize(aiSummary, contentWidth);
			doc.text(summaryLines, margin, yPosition);

			yPosition += (summaryLines.length * 14) + 30;
		}

		// --- SHARED DREAMNODES ---
		if (invocations.length > 0) {
			doc.setFontSize(14);
			doc.setTextColor(74, 144, 226); // Blue
			doc.text('Shared DreamNodes', margin, yPosition);

			yPosition += 20;

			doc.setFontSize(11);
			doc.setTextColor(204, 204, 204);
			doc.text(`During our conversation, I shared ${invocations.length} DreamNode${invocations.length > 1 ? 's' : ''}:`, margin, yPosition);

			yPosition += 25;

			// List each DreamNode with clickable link and image
			deepLinks.forEach((link, index) => {
				const invTimeStr = invocations[index].timestamp.toLocaleTimeString();

				console.log(`📄 [PDFGenerator] Processing ${link.nodeName}, has rendered image:`, !!link.renderedImageDataUrl);

				// Add rendered DreamTalk image (already includes circular mask and gradient overlay)
				if (link.renderedImageDataUrl) {
					try {
						console.log(`📷 [PDFGenerator] Adding rendered image to PDF for ${link.nodeName}`);

						const imageSize = 150; // Display size in PDF
						const imageX = margin + 20;
						const imageY = yPosition;
						const centerX = imageX + imageSize / 2;
						const centerY = imageY + imageSize / 2;
						const radius = imageSize / 2;

						// The image already has circular mask and gradient applied from canvas rendering
						// Just add it directly as PNG
						doc.addImage(link.renderedImageDataUrl, 'PNG', imageX, imageY, imageSize, imageSize);

						// Draw circular border (#4FC3F7 blue for 'dream' type nodes)
						doc.setDrawColor(79, 195, 247); // RGB for #4FC3F7
						doc.setLineWidth(2); // Border width
						doc.circle(centerX, centerY, radius, 'S'); // 'S' = stroke only

						// Make circular area clickable
						doc.link(imageX, imageY, imageSize, imageSize, { url: link.link });

						yPosition += imageSize + 20; // Increased padding between image and title
						console.log(`✅ [PDFGenerator] Rendered image added successfully for ${link.nodeName}`);
					} catch (error) {
						console.warn(`❌ [PDFGenerator] Failed to add rendered image for ${link.nodeName}:`, error);
					}
				} else {
					console.log(`⚠️ [PDFGenerator] No rendered image provided for ${link.nodeName}`);
				}

				// Node name (blue, clickable)
				doc.setFontSize(14);
				doc.setTextColor(74, 144, 226);
				const nodeName = `${index + 1}. ${link.nodeName}`;
				doc.textWithLink(nodeName, margin + 20, yPosition, { url: link.link });

				// Add time in gray next to name
				const nodeNameWidth = doc.getTextWidth(nodeName);
				doc.setTextColor(153, 153, 153);
				doc.text(` (${invTimeStr})`, margin + 20 + nodeNameWidth, yPosition);

				yPosition += 25; // Extra spacing between nodes
			});
		}

		// --- INSTALLATION SECTION ---
		yPosition += 30;

		doc.setFontSize(16);
		doc.setTextColor(74, 144, 226);
		doc.text('New to InterBrain?', margin, yPosition);

		yPosition += 30;

		doc.setFontSize(12);
		doc.setTextColor(204, 204, 204);
		doc.text('Choose your installation path:', margin, yPosition);

		yPosition += 30;

		// Minimal Install Button
		const buttonWidth = 200;
		const buttonHeight = 40;
		const buttonX = margin + 20;

		// Minimal Install
		doc.setFillColor(79, 195, 247); // Blue button
		doc.roundedRect(buttonX, yPosition, buttonWidth, buttonHeight, 5, 5, 'F');

		doc.setFontSize(14);
		doc.setTextColor(0, 0, 0); // Black text on blue button
		const minimalText = 'Minimal Install';
		const minimalTextWidth = doc.getTextWidth(minimalText);
		doc.textWithLink(
			minimalText,
			buttonX + (buttonWidth - minimalTextWidth) / 2,
			yPosition + buttonHeight / 2 + 5,
			{ url: installLinks.conservative }
		);

		yPosition += buttonHeight + 10;

		doc.setFontSize(10);
		doc.setTextColor(153, 153, 153);
		doc.text('(InterBrain + connection to sender)', buttonX, yPosition);

		yPosition += 30;

		// Full Install Button (if available)
		if (installLinks.full) {
			doc.setFillColor(79, 195, 247); // Blue button
			doc.roundedRect(buttonX, yPosition, buttonWidth, buttonHeight, 5, 5, 'F');

			doc.setFontSize(14);
			doc.setTextColor(0, 0, 0);
			const fullText = 'Full Install';
			const fullTextWidth = doc.getTextWidth(fullText);
			doc.textWithLink(
				fullText,
				buttonX + (buttonWidth - fullTextWidth) / 2,
				yPosition + buttonHeight / 2 + 5,
				{ url: installLinks.full }
			);

			yPosition += buttonHeight + 10;

			doc.setFontSize(10);
			doc.setTextColor(153, 153, 153);
			doc.text(`(InterBrain + all ${invocations.length} shared DreamNode${invocations.length > 1 ? 's' : ''})`, buttonX, yPosition);

			yPosition += 30;
		}

		// GitHub link
		doc.setFontSize(11);
		doc.setTextColor(204, 204, 204);
		doc.text('Or visit our GitHub:', margin, yPosition);

		yPosition += 20;

		doc.setFontSize(12);
		doc.setTextColor(74, 144, 226);
		const githubUrl = 'https://github.com/ProjectLiminality/InterBrain';
		doc.textWithLink(githubUrl, margin + 20, yPosition, { url: githubUrl });

		// Save PDF to file
		const pdfOutput = doc.output('arraybuffer');
		fs.writeFileSync(outputPath, globalThis.Buffer.from(pdfOutput));

		console.log('✅ [PDFGenerator] PDF created successfully:', outputPath);
		return outputPath;
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
}

// Singleton instance
let _pdfGeneratorService: PDFGeneratorService | null = null;

export function initializePDFGeneratorService(): void {
	_pdfGeneratorService = new PDFGeneratorService();
	console.log('📄 [PDFGenerator] Service initialized');
}

export function getPDFGeneratorService(): PDFGeneratorService {
	if (!_pdfGeneratorService) {
		throw new Error('PDFGeneratorService not initialized. Call initializePDFGeneratorService() first.');
	}
	return _pdfGeneratorService;
}
