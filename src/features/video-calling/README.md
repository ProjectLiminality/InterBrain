# Video Calling Feature

Video call initiation and management for dreamer-type DreamNodes.

## Purpose

This feature slice owns all video calling functionality in InterBrain. Currently minimal with macOS FaceTime automation, but designed to grow:

- **Current**: FaceTime integration via AppleScript (macOS only)
- **Future**: Support for additional video calling apps (Zoom, Meet, etc.)
- **Eventually**: Native WebRTC video calling built into InterBrain

All video calling capabilities—whether external app automation or internal implementation—will live in this feature slice.

## Key Files

- **`service.ts`**: FaceTimeService class that uses AppleScript to control macOS FaceTime app (start/end calls, check availability)
- **`commands.ts`**: Registers two Obsidian commands: "Start Video Call" and "End Video Call"
- **`index.ts`**: Exports registerFaceTimeCommands for plugin registration

## Main Exports

- `registerFaceTimeCommands(plugin, uiService, vaultService, faceTimeService)` - Registers commands with Obsidian plugin

## Behavior

**Start Video Call**:
1. Validates selected node is a dreamer-type DreamNode
2. Reads `.udd` metadata for email/phone contact info
3. Launches FaceTime via AppleScript with contact pre-filled
4. Automatically triggers "Start Conversation Mode" (copilot layout + transcription)

**End Video Call**:
1. Quits FaceTime app entirely (not just active call)
2. Automatically triggers "End Conversation Mode" if in copilot layout

## Platform Limitations

- macOS only (uses AppleScript and FaceTime)
- No Windows/Linux support currently
- endCall() quits FaceTime entirely rather than ending just the active call

## Dependencies

- Node.js `child_process` exec (via require in Electron context)
- UIService for user notifications
- VaultService for reading .udd metadata
- InterBrainStore for selected node state
- Conversation Mode commands (external dependency via executeCommandById)
