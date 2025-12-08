import React from 'react';
import { Perspective } from '../services/perspective-service';
import { AudioClipPlayer } from './AudioClipPlayer';
import separatorImage from '../../dreamweaving/assets/Separator.png';
import styles from '../../dreamweaving/dreamsong.module.css';

interface PerspectivesSectionProps {
	perspectives: Perspective[];
	vaultPath: string;
	dreamNodeRepoPath: string; // Path to the DreamNode that owns these perspectives
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
	dreamNodeRepoPath,
	onDreamerNodeClick
}) => {
	if (perspectives.length === 0) {
		return null;
	}

	return (
		<div className="perspectives-section" style={{ marginTop: '3rem' }}>
			{/* Header matching DreamSong header style */}
			<div className={styles.dreamSongHeader}>
				<div className={styles.dreamSongTitle}>Perspectives</div>
				<img
					src={separatorImage}
					alt="Separator"
					className={styles.dreamSongSeparator}
				/>
			</div>

			{/* Perspectives list */}
			<div className="perspectives-list" style={{ padding: '0 2rem' }}>
				{perspectives.map((perspective) => (
					<AudioClipPlayer
						key={perspective.uuid}
						perspective={perspective}
						vaultPath={vaultPath}
						dreamNodeRepoPath={dreamNodeRepoPath}
						onLabelClick={() => onDreamerNodeClick(perspective.dreamerNodeId)}
					/>
				))}
			</div>
		</div>
	);
};
