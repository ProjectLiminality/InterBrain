import React, { useState, useRef, useEffect } from 'react';
import { Perspective } from '../conversational-copilot/services/perspective-service';
import { getAudioStreamingService } from './services/audio-streaming-service';

interface AudioClipPlayerProps {
	perspective: Perspective;
	vaultPath: string;
	dreamNodeRepoPath: string; // Path to the DreamNode that owns this perspective
	onLabelClick: () => void;
}

/**
 * Audio clip player for Songline perspectives.
 * Plays sovereign audio clips (already trimmed, no temporal masking needed).
 */
export const AudioClipPlayer: React.FC<AudioClipPlayerProps> = ({
	perspective,
	vaultPath,
	dreamNodeRepoPath,
	onLabelClick
}) => {
	// eslint-disable-next-line no-undef
	const audioRef = useRef<HTMLAudioElement>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [showTranscript, setShowTranscript] = useState(false);

	// Load audio file as data URL via service
	const [audioUrl, setAudioUrl] = useState<string>('');

	useEffect(() => {
		const loadAudio = async () => {
			const path = require('path');
			const audioStreamingService = getAudioStreamingService();

			try {
				// Perspective sourceAudioPath is relative to DreamNode (e.g., "perspectives/clip-{uuid}.mp3")
				// We need to prepend the DreamNode's repoPath
				const audioPath = path.join(vaultPath, dreamNodeRepoPath, perspective.sourceAudioPath);
				const dataUrl = await audioStreamingService.loadAudioAsDataUrl(audioPath);
				setAudioUrl(dataUrl);
			} catch (error) {
				console.error('Failed to load audio:', error);
			}
		};

		loadAudio();
	}, [vaultPath, dreamNodeRepoPath, perspective.sourceAudioPath]);

	// Duration of the clip (sovereign clip, so endTime is the full duration)
	const clipDuration = perspective.endTime - perspective.startTime;

	// Handle play/pause
	const togglePlay = () => {
		const audio = audioRef.current;
		if (!audio) return;

		if (isPlaying) {
			audio.pause();
		} else {
			audio.play();
		}
	};

	// Handle time updates (no temporal masking needed - clip is already trimmed)
	const handleTimeUpdate = () => {
		const audio = audioRef.current;
		if (!audio) return;

		setCurrentTime(audio.currentTime);
	};

	// Handle play/pause state changes
	const handlePlay = () => setIsPlaying(true);
	const handlePause = () => setIsPlaying(false);

	// Format time as MM:SS
	const formatTime = (seconds: number): string => {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	};

	return (
		<div className="audio-clip-player" style={{ marginBottom: '1rem' }}>
			{/* Clickable label */}
			<div
				className="clip-label"
				onClick={onLabelClick}
				style={{
					fontSize: '0.9em',
					fontWeight: 500,
					marginBottom: '0.5rem',
					cursor: 'pointer',
					color: 'var(--text-accent)',
					textDecoration: 'underline'
				}}
			>
				{perspective.participants[0]} &lt;&gt; {perspective.participants[1]}
			</div>

			{/* Audio controls */}
			<div className="audio-controls" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
				<button
					onClick={togglePlay}
					style={{
						padding: '0.5rem 1rem',
						fontSize: '0.9em',
						cursor: 'pointer',
						border: '1px solid var(--background-modifier-border)',
						borderRadius: '4px',
						background: 'var(--background-primary-alt)',
						color: 'var(--text-normal)'
					}}
				>
					{isPlaying ? '⏸ Pause' : '▶ Play'}
				</button>

				<span style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>
					{formatTime(currentTime)} / {formatTime(clipDuration)}
				</span>
			</div>

			{/* Hidden audio element - only render when URL is loaded */}
			{audioUrl && (
				<audio
					ref={audioRef}
					src={audioUrl}
					onTimeUpdate={handleTimeUpdate}
					onPlay={handlePlay}
					onPause={handlePause}
					onEnded={handlePause}
				/>
			)}

			{/* Expandable transcript */}
			<div className="transcript-toggle">
				<button
					onClick={() => setShowTranscript(!showTranscript)}
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
					{showTranscript ? '▼' : '▶'} Transcript
				</button>

				{showTranscript && (
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
							whiteSpace: 'pre-wrap'
						}}
					>
						{perspective.transcript}
					</div>
				)}
			</div>
		</div>
	);
};
