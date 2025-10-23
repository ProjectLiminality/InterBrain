import React, { useState, useEffect } from 'react';
import { DreamNode } from '../../types/dreamnode';
import { getAudioStreamingService } from './services/audio-streaming-service';

interface Conversation {
	audioPath: string;
	audioDataUrl: string; // Base64 data URL for playback
	transcriptPath: string;
	date: Date;
	title: string;
}

interface ConversationsSectionProps {
	dreamerNode: DreamNode;
	vaultPath: string;
}

/**
 * Conversations Section Component
 *
 * Displays the full conversation history for a DreamerNode.
 * Shows all conversation recordings with their transcripts.
 */
export const ConversationsSection: React.FC<ConversationsSectionProps> = ({
	dreamerNode,
	vaultPath: _vaultPath
}) => {
	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [expandedTranscripts, setExpandedTranscripts] = useState<Set<string>>(new Set());
	const [transcriptContents, setTranscriptContents] = useState<Map<string, string>>(new Map());

	// Load conversations on mount
	useEffect(() => {
		loadConversations();
	}, [dreamerNode.id]);

	const loadConversations = async () => {
		const fs = require('fs').promises;
		const path = require('path');

		console.log(`🎵 [Conversations] Loading conversations for ${dreamerNode.name}`);
		console.log(`🎵 [Conversations] repoPath: ${dreamerNode.repoPath}`);

		// Get vault path from DreamSong props (passed from parent)
		// If not available, try to get it from the global window object
		const vaultBasePath = (window as any).app?.vault?.adapter?.basePath;
		if (!vaultBasePath) {
			console.error(`❌ [Conversations] Cannot get vault base path`);
			return;
		}

		try {
			// Use absolute path
			const absoluteRepoPath = path.join(vaultBasePath, dreamerNode.repoPath);
			const conversationsDir = path.join(absoluteRepoPath, 'conversations');
			console.log(`🎵 [Conversations] Looking for directory: ${conversationsDir}`);

			try {
				await fs.access(conversationsDir);
				console.log(`✅ [Conversations] Directory exists`);
			} catch (error) {
				// No conversations directory
				console.warn(`⚠️ [Conversations] Directory not found:`, error);
				return;
			}

			// Read all files in conversations directory
			const files = await fs.readdir(conversationsDir);
			console.log(`📁 [Conversations] Found ${files.length} files:`, files);

			// Find audio files
			const audioFiles = files.filter((f: string) => f.endsWith('.mp3') || f.endsWith('.wav'));
			console.log(`🎵 [Conversations] Found ${audioFiles.length} audio files:`, audioFiles);

			// Build conversation objects
			const convos: Conversation[] = [];
			const audioStreamingService = getAudioStreamingService();

			for (const audioFile of audioFiles) {
				// Extract date from filename: conversation-2025-10-23-14-30.mp3
				const match = audioFile.match(/conversation-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/);
				if (match) {
					const [, year, month, day, hour, minute] = match;
					const date = new Date(
						parseInt(year),
						parseInt(month) - 1,
						parseInt(day),
						parseInt(hour),
						parseInt(minute)
					);

					// Find matching transcript in conversations/ directory
					const transcriptName = `transcript-${year}-${month}-${day}-${hour}-${minute}.md`;
					const transcriptPath = path.join(conversationsDir, transcriptName);

					// Check if transcript exists
					let hasTranscript = false;
					try {
						await fs.access(transcriptPath);
						hasTranscript = true;
					} catch {
						// Transcript not found
					}

					// Load audio file as base64 data URL via service
					const audioFilePath = path.join(conversationsDir, audioFile);
					let audioDataUrl = '';
					try {
						audioDataUrl = await audioStreamingService.loadAudioAsDataUrl(audioFilePath);
					} catch (error) {
						console.error(`Failed to load audio file ${audioFile}:`, error);
					}

					convos.push({
						audioPath: audioFilePath,
						audioDataUrl,
						transcriptPath: hasTranscript ? transcriptPath : '',
						date,
						title: date.toLocaleString('en-US', {
							dateStyle: 'medium',
							timeStyle: 'short'
						})
					});
				}
			}

			// Sort by date (newest first)
			convos.sort((a, b) => b.date.getTime() - a.date.getTime());

			setConversations(convos);
		} catch (error) {
			console.error('Failed to load conversations:', error);
		}
	};

	const toggleTranscript = async (audioPath: string, transcriptPath: string) => {
		const newExpanded = new Set(expandedTranscripts);

		if (expandedTranscripts.has(audioPath)) {
			// Collapse
			newExpanded.delete(audioPath);
		} else {
			// Expand - load transcript if not loaded
			newExpanded.add(audioPath);

			if (!transcriptContents.has(audioPath) && transcriptPath) {
				try {
					const fs = require('fs').promises;
					const content = await fs.readFile(transcriptPath, 'utf-8');

					// Extract conversation text (skip metadata header)
					const lines = content.split('\n');
					const separatorIndex = lines.findIndex((line: string) => line === '---');
					const conversationText = lines
						.slice(separatorIndex + 1)
						.join('\n')
						.trim();

					setTranscriptContents(new Map(transcriptContents).set(audioPath, conversationText));
				} catch (error) {
					console.error('Failed to load transcript:', error);
					setTranscriptContents(new Map(transcriptContents).set(audioPath, 'Failed to load transcript'));
				}
			}
		}

		setExpandedTranscripts(newExpanded);
	};

	if (conversations.length === 0) {
		return (
			<div className="conversations-section" style={{ padding: '2rem', textAlign: 'center' }}>
				<p style={{ color: 'var(--text-muted)', fontSize: '0.9em' }}>
					No conversation recordings yet
				</p>
			</div>
		);
	}

	return (
		<div className="conversations-section" style={{ padding: '2rem' }}>
			{/* Header with separator (same style as DreamSong header) */}
			<div className="conversations-header" style={{ marginBottom: '1.5rem' }}>
				<h2 style={{
					fontSize: '1.5em',
					fontWeight: 600,
					marginBottom: '0.5rem',
					color: 'var(--text-normal)'
				}}>
					Conversations
				</h2>
				<div style={{
					height: '1px',
					background: 'var(--background-modifier-border)',
					marginBottom: '1rem'
				}} />
			</div>

			{/* Conversations list */}
			<div className="conversations-list">
				{conversations.map((convo) => (
					<div key={convo.audioPath} className="conversation-item" style={{ marginBottom: '1.5rem' }}>
						{/* Date header */}
						<div style={{
							fontSize: '0.95em',
							fontWeight: 500,
							marginBottom: '0.5rem',
							color: 'var(--text-normal)'
						}}>
							{convo.title}
						</div>

						{/* Audio player */}
						<audio
							controls
							src={convo.audioDataUrl}
							style={{
								width: '100%',
								marginBottom: '0.5rem'
							}}
						/>

						{/* Transcript toggle */}
						{convo.transcriptPath && (
							<div className="transcript-toggle">
								<button
									onClick={() => toggleTranscript(convo.audioPath, convo.transcriptPath)}
									style={{
										padding: '0.25rem 0.5rem',
										fontSize: '0.85em',
										cursor: 'pointer',
										border: '1px solid var(--background-modifier-border)',
										borderRadius: '4px',
										background: 'var(--background-secondary)',
										color: 'var(--text-muted)'
									}}
								>
									{expandedTranscripts.has(convo.audioPath) ? '▼' : '▶'} Transcript
								</button>

								{expandedTranscripts.has(convo.audioPath) && (
									<div
										className="transcript-content"
										style={{
											marginTop: '0.5rem',
											padding: '0.75rem',
											background: 'var(--background-secondary)',
											borderRadius: '4px',
											fontSize: '0.85em',
											color: 'var(--text-muted)',
											lineHeight: '1.5',
											whiteSpace: 'pre-wrap',
											maxHeight: '400px',
											overflowY: 'auto'
										}}
									>
										{transcriptContents.get(convo.audioPath) || 'Loading...'}
									</div>
								)}
							</div>
						)}
					</div>
				))}
			</div>
		</div>
	);
};
