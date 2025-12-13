/**
 * Songline Feature
 *
 * Living definitions through conversation clips.
 *
 * This feature provides the ability to create "perspectives" - audio clips from conversations
 * that serve as living definitions of DreamNodes. Instead of static text definitions,
 * Songlines capture moments where concepts are discussed organically in conversation,
 * preserving the authentic voice and context.
 *
 * ## Core Concepts
 *
 * - **Perspectives**: Audio clips that define/describe a DreamNode from someone's perspective
 * - **Conversations**: Full conversation recordings stored in DreamNode repositories
 * - **Audio Trimming**: Service to extract specific time ranges from full conversations
 * - **Sovereign Storage**: Each perspective is stored directly in the relevant DreamNode's repo
 *
 * ## Architecture
 *
 * Songline code is now consolidated within this feature:
 * - `services/perspective-service.ts` - Manages perspectives.json files
 * - `services/conversations-service.ts` - Manages conversation recordings
 * - `services/audio-trimming-service.ts` - Trims recordings to clips
 * - `services/audio-recording-service.ts` - Coordinates recording
 * - `components/PerspectivesSection.tsx` - UI for viewing perspectives
 * - `components/ConversationsSection.tsx` - UI for viewing conversations
 * - `components/AudioClipPlayer.tsx` - Audio playback component
 *
 * ## Data Structure
 *
 * Perspectives are stored in each DreamNode's repository:
 * ```
 * DreamNode/
 * ├── .udd (contains perspectives array)
 * ├── conversations/
 * │   ├── conversation-{timestamp}.mp3 (full conversation recording)
 * │   └── {speaker-alias}-on-{node-name}-{timestamp}.mp3 (trimmed clips)
 * └── perspectives.json (legacy - being phased out in favor of .udd)
 * ```
 *
 * @packageDocumentation
 */

// Export services
export {
	PerspectiveService,
	PerspectiveServiceImpl,
	Perspective,
	PerspectivesFile,
	initializePerspectiveService,
	getPerspectiveService
} from './services/perspective-service';

export {
	ConversationsService,
	ConversationsServiceImpl,
	Conversation,
	initializeConversationsService,
	getConversationsService
} from './services/conversations-service';

export {
	AudioTrimmingService,
	AudioTrimOptions,
	initializeAudioTrimmingService,
	getAudioTrimmingService
} from './services/audio-trimming-service';

export {
	AudioRecordingService,
	AudioRecordingServiceImpl,
	initializeAudioRecordingService,
	getAudioRecordingService
} from './services/audio-recording-service';

// Export components
export { PerspectivesSection } from './components/PerspectivesSection';
export { ConversationsSection } from './components/ConversationsSection';
export { AudioClipPlayer } from './components/AudioClipPlayer';
