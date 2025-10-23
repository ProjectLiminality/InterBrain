import React, { useState, useRef, useEffect } from 'react';
import { Perspective } from '../conversational-copilot/services/perspective-service';
import { getAudioStreamingService } from './services/audio-streaming-service';

interface AudioClipPlayerProps {
	perspective: Perspective;
	vaultPath: string;
	onLabelClick: () => void;
}

/**
 * Audio clip player with temporal masking for Songline perspectives.
 * Plays a specific segment of a conversation recording.
 */
export const AudioClipPlayer: React.FC<AudioClipPlayerProps> = ({
	perspective,
	vaultPath,
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
				const audioPath = path.join(vaultPath, perspective.sourceAudioPath);
				const dataUrl = await audioStreamingService.loadAudioAsDataUrl(audioPath);
				setAudioUrl(dataUrl);
			} catch (error) {
				console.error('Failed to load audio:', error);
			}
		};

		loadAudio();
	}, [vaultPath, perspective.sourceAudioPath]);

	// Duration of the clip
	const clipDuration = perspective.endTime - perspective.startTime;

	// Initialize audio to start position
	useEffect(() => {
		const audio = audioRef.current;
		if (audio) {
			audio.currentTime = perspective.startTime;
		}
	}, [perspective.startTime]);

	// Handle play/pause
	const togglePlay = () => {
		const audio = audioRef.current;
		if (!audio) return;

		if (isPlaying) {
			audio.pause();
		} else {
			// Ensure we start at the clip start time
			if (audio.currentTime < perspective.startTime || audio.currentTime >= perspective.endTime) {
				audio.currentTime = perspective.startTime;
			}
			audio.play();
		}
	};

	// Handle time updates - implement temporal masking
	const handleTimeUpdate = () => {
		const audio = audioRef.current;
		if (!audio) return;

		const clipTime = audio.currentTime - perspective.startTime;
		setCurrentTime(clipTime);

		// Temporal mask: Stop and reset when reaching end of clip
		if (audio.currentTime >= perspective.endTime) {
			audio.pause();
			audio.currentTime = perspective.startTime;
			setIsPlaying(false);
			setCurrentTime(0);
		}
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

			{/* Hidden audio element */}
			<audio
				ref={audioRef}
				src={audioUrl}
				onTimeUpdate={handleTimeUpdate}
				onPlay={handlePlay}
				onPause={handlePause}
				onEnded={handlePause}
			/>

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
