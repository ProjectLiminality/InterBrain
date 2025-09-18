---
allowed-tools: Read, Write, Edit, MultiEdit
description: Create Open Collective update post from latest CHANGELOG entry
---

# Update Post Creation Command

This command helps create compelling Open Collective update posts based on the latest CHANGELOG.md entry, focusing on visually demonstrable features and user benefits.

## Phase 1: CHANGELOG Analysis & Visual Demo Strategy

1. **Read Latest CHANGELOG Entry**
   - Parse CHANGELOG.md to identify the most recent release
   - Extract version number, epic title, and key features
   - Identify completion status and technical achievements

2. **Analyze Visual Demo Potential**
   - Review all "Added" features for visual/interactive elements
   - Prioritize features that show clear user benefits and workflows
   - Identify features that demonstrate spatial/3D interactions
   - Look for drag-drop, animation, and real-time feedback capabilities

3. **Present Initial Demo Strategy**
   - Propose 3-4 top visual demo candidates with rationale
   - Suggest demo flow options (continuous workflow vs separate features)
   - Ask for feedback on priority and demo structure preferences

## Phase 2: Content Structure & Draft Creation

4. **Structure Discussion**
   - Propose post structure options based on CHANGELOG content:
     - **Epic-focused**: Multiple epics with embedded videos each
     - **Feature-focused**: Key features as main sections
     - **Workflow-focused**: End-to-end user journey demonstration
   - Get user preference on technical depth vs user benefits balance

5. **Create Working Draft File**
   - Create `/TEMP_update_draft.md` for iterative editing
   - Include proposed structure with placeholder video sections
   - Write compelling user-focused descriptions of key features
   - Maintain consistent tone with previous update posts
   - Include technical achievements section as supporting content

## Phase 3: Iterative Refinement

6. **Draft Review & Feedback**
   - Present draft structure and content
   - Iterate based on user feedback on tone, focus, and structure
   - Refine feature descriptions for maximum visual appeal
   - Ensure proper balance of user benefits vs technical achievements

7. **Finalize Content**
   - Complete final draft with all content except video embeds
   - Include clear placeholders for video embedding locations
   - Add standard "Thank You" section (unchanged across all posts)
   - Prepare draft for user's manual video creation workflow

## Phase 4: Post-Publication Cleanup

8. **Cleanup Process**
   - After user completes video recording/uploading and publishes post
   - Delete the temporary `/TEMP_update_draft.md` file
   - Confirm no working files remain in repository

## Key Principles

- **Visual-First**: Prioritize features that can be compellingly demonstrated
- **User Benefits**: Focus on what users can see/experience, not just technical implementation
- **Screen Recording Ready**: Structure content to support natural demo flows
- **Consistent Tone**: Match previous update posts' engaging, accessible style
- **Technical Balance**: Include technical achievements as supporting context, not primary focus

## Success Criteria

- [ ] Latest CHANGELOG parsed and key features identified
- [ ] Visual demo strategy proposed and refined with user input
- [ ] Post structure determined through collaborative discussion
- [ ] Complete draft created with video placeholders
- [ ] Content reviewed and approved by user
- [ ] Working files cleaned up after publication