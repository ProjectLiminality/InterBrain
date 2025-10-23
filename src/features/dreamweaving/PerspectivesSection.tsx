import React from 'react';
import { Perspective } from '../conversational-copilot/services/perspective-service';
import { AudioClipPlayer } from './AudioClipPlayer';

interface PerspectivesSectionProps {
	perspectives: Perspective[];
	vaultPath: string;
	onDreamerNodeClick: (dreamerNodeId: string) => void;
}

/**
 * Perspectives Section Component
 *
 * Displays a collection of conversation clips (Perspectives) for a DreamNode.
 * Each perspective provides a "living definition" from real conversations.
 */
export const PerspectivesSection: React.FC<PerspectivesSectionProps> = ({
	perspectives,
	vaultPath,
	onDreamerNodeClick
}) => {
	if (perspectives.length === 0) {
		return null;
	}

	return (
		<div className="perspectives-section" style={{ marginTop: '2rem' }}>
			{/* Header with separator (same style as DreamSong header) */}
			<div className="perspectives-header" style={{ marginBottom: '1.5rem' }}>
				<h2 style={{
					fontSize: '1.5em',
					fontWeight: 600,
					marginBottom: '0.5rem',
					color: 'var(--text-normal)'
				}}>
					Perspectives
				</h2>
				<div style={{
					height: '1px',
					background: 'var(--background-modifier-border)',
					marginBottom: '1rem'
				}} />
			</div>

			{/* Perspectives list */}
			<div className="perspectives-list">
				{perspectives.map((perspective) => (
					<AudioClipPlayer
						key={perspective.uuid}
						perspective={perspective}
						vaultPath={vaultPath}
						onLabelClick={() => onDreamerNodeClick(perspective.dreamerNodeId)}
					/>
				))}
			</div>
		</div>
	);
};
