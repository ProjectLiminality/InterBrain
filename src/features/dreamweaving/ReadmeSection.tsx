import React, { useState, useEffect, useRef } from 'react';
import { DreamNode } from '../../types/dreamnode';
import separatorImage from '../../assets/images/Separator.png';
import styles from './dreamsong.module.css';

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
	const contentRef = useRef<HTMLDivElement>(null);

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

	// Render markdown when content or expanded state changes
	useEffect(() => {
		const renderMarkdown = async () => {
			if (isExpanded && readmeContent && contentRef.current) {
				// Clear existing content
				contentRef.current.innerHTML = '';

				// Access Obsidian's MarkdownRenderer from globalThis (not window)
				const app = (window as any).app;
				const MarkdownRenderer = (globalThis as any).MarkdownRenderer;

				console.log('[README] MarkdownRenderer available?', !!MarkdownRenderer);
				console.log('[README] renderMarkdown function?', !!MarkdownRenderer?.renderMarkdown);

				if (MarkdownRenderer && MarkdownRenderer.renderMarkdown) {
					try {
						console.log('[README] Attempting to render markdown...');
						// Render markdown using Obsidian's API (async)
						const sourcePath = `${dreamNode.repoPath}/README.md`;
						await MarkdownRenderer.renderMarkdown(
							readmeContent,
							contentRef.current,
							sourcePath,
							app
						);
						console.log('[README] Markdown rendered successfully');
					} catch (error) {
						console.error('[README] Failed to render markdown:', error);
						// Fallback: simple formatting
						contentRef.current.innerHTML = `<pre style="white-space: pre-wrap; font-family: inherit; line-height: 1.6;">${readmeContent}</pre>`;
					}
				} else {
					console.log('[README] MarkdownRenderer not available, using fallback');
					// Fallback: simple formatting with line breaks preserved
					contentRef.current.innerHTML = `<pre style="white-space: pre-wrap; font-family: inherit; line-height: 1.6;">${readmeContent}</pre>`;
				}
			}
		};

		renderMarkdown();
	}, [isExpanded, readmeContent, dreamNode.repoPath]);

	// Don't render if no README content
	if (!readmeContent) {
		return null;
	}

	return (
		<div className="readme-section" style={{ padding: '2rem', borderTop: '1px solid var(--background-modifier-border)', position: 'relative' }}>
			{/* Header matching DreamSong header style */}
			<div className={styles.dreamSongHeader}>
				{/* Edit button (top right) - lucide-edit icon */}
				{onEdit && (
					<button
						onClick={onEdit}
						style={{
							position: 'absolute',
							top: '1rem',
							right: '2rem',
							padding: '0.5rem',
							cursor: 'pointer',
							border: '1px solid var(--background-modifier-border)',
							borderRadius: '4px',
							background: 'var(--background-secondary)',
							color: 'var(--text-muted)',
							opacity: 0.6,
							transition: 'opacity 0.2s',
							zIndex: 10,
							display: 'flex',
							alignItems: 'center'
						}}
						onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
						onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
						title="Edit README"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
							<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
						</svg>
					</button>
				)}

				<div className={styles.dreamSongTitle} style={{ cursor: 'pointer' }} onClick={() => setIsExpanded(!isExpanded)}>
					{isExpanded ? '▼' : '▶'} README
				</div>
				<img
					src={separatorImage}
					alt="Separator"
					className={styles.dreamSongSeparator}
				/>
			</div>

			{/* Expandable README content - rendered as Obsidian markdown */}
			{isExpanded && (
				<div
					ref={contentRef}
					className="readme-content markdown-preview-view"
					style={{
						padding: '1rem 2rem 2rem 2rem',
						fontSize: '0.9em',
						color: 'var(--text-normal)',
						lineHeight: '1.6',
						maxHeight: '600px',
						overflowY: 'auto'
					}}
				/>
			)}
		</div>
	);
};
