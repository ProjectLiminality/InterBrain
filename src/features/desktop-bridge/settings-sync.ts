/**
 * Settings sync — keeps plugin.settings in sync with the daemon.
 *
 * The plugin's existing 57+ consumers read `plugin.settings.X` synchronously.
 * Rather than rewrite every callsite as async, we treat plugin.settings as a
 * write-through cache: on bridge connect, we fetch daemon settings and copy
 * the system-level fields into plugin.settings; on `settings-changed` events,
 * we refresh the cache. Writes from the plugin's own settings tab still go
 * through Obsidian's normal save flow, but for migrated fields the daemon is
 * the source of truth and the plugin tab simply doesn't expose them anymore.
 *
 * Fields that live in the daemon (system-level):
 *   claudeApiKey, openaiApiKey, groqApiKey, xaiApiKey,
 *   defaultAIProvider, transcriptionModel, transcriptionLanguage,
 *   ollamaEndpoint
 *
 * Fields that stay in the plugin (GUI/behavior):
 *   transcriptionEnabled, transcriptionSetupComplete, transcriptionSearchBufferSize,
 *   webLinkAnalyzerEnabled, webLinkAnalyzerSetupComplete,
 *   constellationMaxNodes, constellationPrioritizeClusters,
 *   userEmail, hasLaunchedBefore, offlineMode
 */

import type InterBrainPlugin from '../../main';
import { getBridge } from './bridge-client';

/**
 * Plugin-settings keys that are owned by the daemon (system-level config:
 * API keys, AI provider, transcription settings). Pure type — no runtime
 * value, since these are only referenced in the typed `set()` helper below.
 */
type SystemLevelKey =
  | 'claudeApiKey'
  | 'openaiApiKey'
  | 'groqApiKey'
  | 'xaiApiKey'
  | 'defaultAIProvider'
  | 'transcriptionModel'
  | 'transcriptionLanguage';

interface DaemonSettingsShape {
  codingAgentCommand: string;
  defaultAIProvider: string;
  apiKeys: {
    claude?: string;
    openai?: string;
    groq?: string;
    xai?: string;
  };
  ollamaEndpoint: string;
  whisperModel: string;
  whisperLanguage: string;
}

/** Map daemon settings shape onto the plugin.settings field names. */
function applyDaemonSettings(plugin: InterBrainPlugin, daemon: DaemonSettingsShape): boolean {
  let changed = false;
  const set = (k: SystemLevelKey, v: string | undefined) => {
    const settings = plugin.settings as unknown as Record<string, unknown>;
    const current = settings[k];
    const next = v ?? '';
    if (current !== next) {
      settings[k] = next;
      changed = true;
    }
  };
  set('claudeApiKey', daemon.apiKeys.claude);
  set('openaiApiKey', daemon.apiKeys.openai);
  set('groqApiKey', daemon.apiKeys.groq);
  set('xaiApiKey', daemon.apiKeys.xai);
  set('defaultAIProvider', daemon.defaultAIProvider);
  set('transcriptionModel', daemon.whisperModel);
  set('transcriptionLanguage', daemon.whisperLanguage);
  return changed;
}

/**
 * Wire up bidirectional settings sync. Call once during plugin onload, after
 * settings have been loaded.
 *
 * Returns a teardown function.
 */
export function startSettingsSync(plugin: InterBrainPlugin): () => void {
  const bridge = getBridge();

  const refresh = async () => {
    if (!bridge.isConnected()) return;
    try {
      const res = await bridge.request('get-settings', {});
      const daemon = res.settings as unknown as DaemonSettingsShape;
      const changed = applyDaemonSettings(plugin, daemon);
      if (changed) {
        // Persist to Obsidian's plugin data file so the in-memory cache survives reload
        // (the daemon remains source of truth — this is just keeping the cache warm).
        await plugin.saveData(plugin.settings);
      }
    } catch (err) {
      console.warn('[settings-sync] refresh failed:', err);
    }
  };

  // 1) Initial connect — populate cache from daemon.
  const offConnect = bridge.onConnected(() => { void refresh(); });

  // 2) Daemon broadcasts when its settings change (from tray dashboard).
  const offEvent = bridge.onEvent('settings-changed', payload => {
    const daemon = (payload as { settings: DaemonSettingsShape }).settings;
    const changed = applyDaemonSettings(plugin, daemon);
    if (changed) void plugin.saveData(plugin.settings);
  });

  // 3) Kick off the connection in the background.
  void bridge.connect();

  return () => {
    offConnect();
    offEvent();
  };
}

/**
 * One-time helper used by the plugin settings tab to push a field UP to the
 * daemon. Used by sections that still render the field locally (the goal is
 * to stop rendering them, but during the transition this lets writes flow).
 */
export async function pushSettingToDaemon(field: SystemLevelKey, value: string): Promise<void> {
  const bridge = getBridge();
  if (!bridge.isConnected()) {
    try { await bridge.connect(); } catch { /* offline; just write to plugin */ }
  }
  if (!bridge.isConnected()) return;
  // Translate field to daemon shape.
  const partial: Partial<DaemonSettingsShape> = {};
  switch (field) {
    case 'claudeApiKey': partial.apiKeys = { claude: value }; break;
    case 'openaiApiKey': partial.apiKeys = { openai: value }; break;
    case 'groqApiKey':   partial.apiKeys = { groq: value }; break;
    case 'xaiApiKey':    partial.apiKeys = { xai: value }; break;
    case 'defaultAIProvider': partial.defaultAIProvider = value; break;
    case 'transcriptionModel': partial.whisperModel = value; break;
    case 'transcriptionLanguage': partial.whisperLanguage = value; break;
  }
  // Daemon does a deep-merge for apiKeys, so we need to fetch + merge first
  // when partial.apiKeys is set. Simplest: send a full settings object.
  try {
    const current = await bridge.request('get-settings', {});
    const merged = { ...current.settings } as DaemonSettingsShape;
    if (partial.apiKeys) {
      merged.apiKeys = { ...merged.apiKeys, ...partial.apiKeys };
    }
    if (partial.defaultAIProvider !== undefined) merged.defaultAIProvider = partial.defaultAIProvider;
    if (partial.whisperModel !== undefined) merged.whisperModel = partial.whisperModel;
    if (partial.whisperLanguage !== undefined) merged.whisperLanguage = partial.whisperLanguage;
    await bridge.request('set-settings', { settings: merged as unknown as Parameters<typeof bridge.request<'set-settings'>>[1]['settings'] });
  } catch (err) {
    console.warn('[settings-sync] push failed:', err);
  }
}
