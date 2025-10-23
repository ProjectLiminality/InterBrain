import React, { useState, useEffect } from 'react';
import { DreamNode } from '../../types/dreamnode';

interface ReadmeSectionProps {
	dreamNode: DreamNode;
	vaultPath: string;
	onEdit?: () => void; // Optional callback for editing README
}

/**
 * README Section Component
 *
 * Displays the README.md content as a collapsible section at the bottom of DreamSong UI.
 * Always collapsed by default - README serves as supplementary reference material.
 */
export const ReadmeSection: React.FC<ReadmeSectionProps> = ({
	dreamNode,
	vaultPath,
	onEdit
}) => {
	const [readmeContent, setReadmeContent] = useState<string>('');
	const [isExpanded, setIsExpanded] = useState(false);

	// Load README content
	useEffect(() => {
		const loadReadme = async () => {
			const fs = require('fs').promises;
			const path = require('path');

			try {
				const absoluteRepoPath = path.join(vaultPath, dreamNode.repoPath);
				const readmePath = path.join(absoluteRepoPath, 'README.md');

				const content = await fs.readFile(readmePath, 'utf-8');
				setReadmeContent(content);
			} catch (error) {
				// README not found or read error - component won't render
				console.log(`README not found for ${dreamNode.name}`);
				setReadmeContent('');
			}
		};

		loadReadme();
	}, [dreamNode.id, vaultPath]);

	// Don't render if no README content
	if (!readmeContent) {
		return null;
	}

	return (
		<div className="readme-section" style={{ padding: '2rem', borderTop: '1px solid var(--background-modifier-border)', position: 'relative' }}>
			{/* Edit button (top right) */}
			{onEdit && (
				<button
					onClick={onEdit}
					style={{
						position: 'absolute',
						top: '1rem',
						right: '1rem',
						padding: '0.4rem 0.8rem',
						fontSize: '0.8em',
						cursor: 'pointer',
						border: '1px solid var(--background-modifier-border)',
						borderRadius: '4px',
						background: 'var(--background-secondary)',
						color: 'var(--text-muted)',
						opacity: 0.6,
						transition: 'opacity 0.2s',
						zIndex: 10
					}}
					onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
					onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
					title="Edit README"
				>
					✏️ Edit
				</button>
			)}

			{/* Header with toggle button */}
			<div className="readme-header" style={{ marginBottom: '1rem' }}>
				<button
					onClick={() => setIsExpanded(!isExpanded)}
					style={{
						width: '100%',
						padding: '0.5rem',
						fontSize: '0.95em',
						fontWeight: 500,
						cursor: 'pointer',
						border: '1px solid var(--background-modifier-border)',
						borderRadius: '4px',
						background: 'var(--background-secondary)',
						color: 'var(--text-normal)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between'
					}}
				>
					<span>{isExpanded ? '▼' : '▶'} README</span>
					<span style={{ fontSize: '0.85em', opacity: 0.7 }}>Supplementary Information</span>
				</button>
			</div>

			{/* Expandable README content */}
			{isExpanded && (
				<div
					className="readme-content"
					style={{
						padding: '1rem',
						background: 'var(--background-secondary)',
						borderRadius: '4px',
						fontSize: '0.9em',
						color: 'var(--text-muted)',
						lineHeight: '1.6',
						whiteSpace: 'pre-wrap',
						maxHeight: '600px',
						overflowY: 'auto',
						fontFamily: 'var(--font-monospace)'
					}}
				>
					{readmeContent}
				</div>
			)}
		</div>
	);
};
