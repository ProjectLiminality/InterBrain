/**
 * IPC protocol shared between the Obsidian plugin and the Tauri daemon.
 *
 * Transport: WebSocket on localhost. The daemon writes its chosen port to
 * `${TAURI_CONFIG_DIR}/ipc-port` (typically `~/Library/Application Support/org.projectliminality.interbrain/ipc-port`
 * on macOS). The plugin reads this file at startup to discover the daemon.
 *
 * Wire format: JSON, one message per WebSocket frame. Every request carries
 * an `id`; the matching response carries the same `id`. Server-initiated
 * notifications carry no `id`.
 */

export const IPC_PROTOCOL_VERSION = 1;

// ---------- Envelope ----------

export interface RequestEnvelope<TOp extends string = string, TPayload = unknown> {
  kind: 'request';
  id: string;
  op: TOp;
  payload: TPayload;
}

export interface ResponseEnvelope<TPayload = unknown> {
  kind: 'response';
  id: string;
  ok: true;
  payload: TPayload;
}

export interface ErrorEnvelope {
  kind: 'response';
  id: string;
  ok: false;
  error: { code: string; message: string };
}

export interface EventEnvelope<TName extends string = string, TPayload = unknown> {
  kind: 'event';
  name: TName;
  payload: TPayload;
}

export type IpcMessage =
  | RequestEnvelope
  | ResponseEnvelope
  | ErrorEnvelope
  | EventEnvelope;

// ---------- Operations ----------

/** `hello` — handshake. Plugin announces itself; daemon responds with version + identity status. */
export interface HelloRequest {
  pluginVersion: string;
}
export interface HelloResponse {
  daemonVersion: string;
  protocolVersion: number;
  identity: { did: string | null; alias: string | null };
  /**
   * Absolute path to the directory containing the `git-remote-interbrain`
   * binary. The plugin prepends this to its child-process PATH so git
   * operations against `interbrain://<uuid>` URLs can find the helper.
   * Optional only for backward compatibility with older daemons.
   */
  helperDir?: string;
}

/** `clone` — clone a DreamNode by uuid from a peer. */
export interface CloneRequest {
  uuid: string;
  peerDid: string;
  destPath: string;
}
export interface CloneResponse {
  destPath: string;
  commit: string;
}

/** `share` — push current state of a local DreamNode to a peer. */
export interface ShareRequest {
  repoPath: string;
  peerDid: string;
}
export interface ShareResponse {
  pushedCommit: string;
}

/** `fetch-updates` — pull latest from all known peers for a repo. */
export interface FetchUpdatesRequest {
  repoPath: string;
}
export interface FetchUpdatesResponse {
  newCommits: number;
}

/** `get-settings` / `set-settings` — daemon owns system-level settings. */
export interface DaemonSettings {
  codingAgentCommand: string;
  defaultAIProvider: 'claude' | 'openai' | 'groq' | 'xai' | 'ollama';
  apiKeys: Partial<Record<'claude' | 'openai' | 'groq' | 'xai', string>>;
  ollamaEndpoint: string;
  whisperModel: string;
  whisperLanguage: string;
}

export interface GetSettingsRequest {}
export interface GetSettingsResponse {
  settings: DaemonSettings;
}

export interface SetSettingsRequest {
  settings: Partial<DaemonSettings>;
}
export interface SetSettingsResponse {
  settings: DaemonSettings;
}

// ---------- Events (daemon → plugin) ----------

/** Progress for any long-running op (clone, share, fetch). */
export interface ProgressEvent {
  requestId: string;
  phase: 'negotiating' | 'connecting' | 'transferring' | 'finalizing';
  bytes?: number;
  total?: number;
}

/** Settings changed in the daemon (via tray dashboard); plugin should refresh. */
export interface SettingsChangedEvent {
  settings: DaemonSettings;
}

// ---------- Op map ----------

export interface OpMap {
  hello: { req: HelloRequest; res: HelloResponse };
  clone: { req: CloneRequest; res: CloneResponse };
  share: { req: ShareRequest; res: ShareResponse };
  'fetch-updates': { req: FetchUpdatesRequest; res: FetchUpdatesResponse };
  'get-settings': { req: GetSettingsRequest; res: GetSettingsResponse };
  'set-settings': { req: SetSettingsRequest; res: SetSettingsResponse };
  /**
   * Force a rebuild of the daemon's UUID index. The plugin calls this
   * after creating a DreamNode so the helper can immediately resolve
   * `interbrain://<uuid>` for the new node (otherwise weaving it as a
   * submodule fails with "uuid not found locally" until daemon restart).
   */
  'refresh-uuid-index': { req: Record<string, never>; res: Record<string, never> };
}

export type OpName = keyof OpMap;

export interface EventMap {
  progress: ProgressEvent;
  'settings-changed': SettingsChangedEvent;
}

export type EventName = keyof EventMap;
