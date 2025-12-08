# Video Calling Feature

macOS FaceTime integration for initiating video calls with dreamer-type DreamNodes.

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
