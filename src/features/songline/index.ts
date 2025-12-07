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
 * ## Architecture (Pending Refactor)
 *
 * Currently, songline-related code is scattered across:
 * - `conversational-copilot/services/perspective-service.ts` → should move here
 * - `conversational-copilot/services/conversations-service.ts` → should move here
 * - `conversational-copilot/services/audio-trimming-service.ts` → should move here
 * - `dreamweaving/PerspectivesSection.tsx` → should move here
 * - `dreamweaving/ConversationsSection.tsx` → should move here
 * - `dreamweaving/AudioClipPlayer.tsx` → should move here
 *
 * See docs/refactor-plan.md section 3.7 for migration details.
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

// TODO: Move services from conversational-copilot once refactor is active
// TODO: Move components from dreamweaving once refactor is active
// TODO: Create barrel exports for all songline functionality

export {};
