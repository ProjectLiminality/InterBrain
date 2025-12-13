import React, { useState, useEffect } from 'react';
import { DreamNode } from '../../dreamnode';
import { getConversationsService, type Conversation } from '../services/conversations-service';
import { useInterBrainStore } from '../../../core/store/interbrain-store';

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
	const [isLoadingConversations, setIsLoadingConversations] = useState(false);
	const [expandedTranscripts, setExpandedTranscripts] = useState<Set<string>>(new Set());
	const [transcriptContents, setTranscriptContents] = useState<Map<string, string>>(new Map());

	// Subscribe to store for lazy loading trigger
	const spatialLayout = useInterBrainStore(state => state.spatialLayout);
	const selectedNode = useInterBrainStore(state => state.selectedNode);

	// Lazy-load conversations only when node is selected in liminal-web mode
	useEffect(() => {
		const loadConversations = async () => {
			// Only load if:
			// 1. In liminal-web layout
			// 2. This node is selected
			// 3. Haven't loaded yet
			const isNodeSelected = spatialLayout === 'liminal-web' && selectedNode?.id === dreamerNode?.id;

			if (!isNodeSelected) {
				return;
			}

			// Skip if already loaded or loading
			if (conversations.length > 0 || isLoadingConversations) {
				return;
			}

			setIsLoadingConversations(true);

			try {
				const conversationsService = getConversationsService();
				const loadedConversations = await conversationsService.loadConversations(dreamerNode);
				setConversations(loadedConversations);
			} catch (error) {
				console.error('❌ [Conversations] Failed to load:', error);
				setConversations([]);
			} finally {
				setIsLoadingConversations(false);
			}
		};

		loadConversations();
	}, [dreamerNode.id, spatialLayout, selectedNode?.id, conversations.length, isLoadingConversations]);

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
					const conversationsService = getConversationsService();
					const content = await conversationsService.loadTranscript(transcriptPath);
					setTranscriptContents(new Map(transcriptContents).set(audioPath, content));
				} catch (error) {
					console.error('Failed to load transcript:', error);
					setTranscriptContents(new Map(transcriptContents).set(audioPath, 'Failed to load transcript'));
				}
			}
		}

		setExpandedTranscripts(newExpanded);
	};

	if (isLoadingConversations) {
		return (
			<div className="conversations-section" style={{ padding: '2rem', textAlign: 'center' }}>
				<p style={{ color: 'var(--text-muted)', fontSize: '0.9em' }}>
					Loading conversations...
				</p>
			</div>
		);
	}

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

						{/* Audio player - only render if audio data is loaded */}
						{convo.audioDataUrl ? (
							<audio
								controls
								src={convo.audioDataUrl}
								style={{
									width: '100%',
									marginBottom: '0.5rem'
								}}
							/>
						) : (
							<div style={{ padding: '0.5rem', fontSize: '0.85em', color: 'var(--text-muted)' }}>
								Loading audio...
							</div>
						)}

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
