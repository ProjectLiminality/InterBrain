import React, { useState, useEffect } from 'react';
import { DreamNode } from '../../types/dreamnode';
import separatorImage from '../../assets/images/Separator.png';
import styles from './dreamsong.module.css';

interface ReadmeSectionProps {
	dreamNode: DreamNode;
	vaultPath: string;
	onEdit?: () => void; // Callback for opening README
}

/**
 * README Section Component
 *
 * Displays a clickable link to open the README.md file in Obsidian.
 * Only shows if README exists.
 */
export const ReadmeSection: React.FC<ReadmeSectionProps> = ({
	dreamNode,
	vaultPath,
	onEdit
}) => {
	const [readmeExists, setReadmeExists] = useState<boolean>(false);

	// Check if README exists
	useEffect(() => {
		const checkReadme = async () => {
			const fs = require('fs').promises;
			const path = require('path');

			try {
				const absoluteRepoPath = path.join(vaultPath, dreamNode.repoPath);
				const readmePath = path.join(absoluteRepoPath, 'README.md');

				await fs.access(readmePath);
				setReadmeExists(true);
			} catch {
				// README not found
				setReadmeExists(false);
			}
		};

		checkReadme();
	}, [dreamNode.id, vaultPath]);

	// Don't render if no README
	if (!readmeExists) {
		return null;
	}

	return (
		<div className="readme-section" style={{ padding: '2rem', borderTop: '1px solid var(--background-modifier-border)' }}>
			{/* Clickable header that opens README file */}
			<div
				className={styles.dreamSongHeader}
				style={{ cursor: 'pointer' }}
				onClick={onEdit}
				title="Click to open README"
			>
				<div className={styles.dreamSongTitle}>
					README
				</div>
				<img
					src={separatorImage}
					alt="Separator"
					className={styles.dreamSongSeparator}
				/>
			</div>
		</div>
	);
};
