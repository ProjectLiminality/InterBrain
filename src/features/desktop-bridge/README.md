# desktop-bridge

Connects the Obsidian plugin to the InterBrain desktop daemon over a localhost
WebSocket. Used to read system-level settings (coding agent command, API keys
in the future) and to delegate transport operations (clone, share, fetch).

## How it works

1. The daemon writes its chosen IPC port to
   `~/Library/Application Support/org.projectliminality.interbrain/ipc-port`
   (or platform equivalent).
2. On plugin startup, `bridge-client.ts` reads that file and connects to
   `ws://127.0.0.1:<port>`.
3. If the file is missing or the daemon isn't reachable, the bridge enters
   "offline" mode — features that rely on it fall back to plugin-local
   defaults.

## API

- `getBridge()` — singleton instance
- `bridge.isConnected()` — boolean
- `bridge.request(op, payload)` — typed request/response
- `bridge.onEvent(name, handler)` — subscribe to daemon events
