import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface VaultEntry {
  path: string;
  name: string;
  pluginInstalled: boolean;
  devMode: boolean;
}

interface DaemonStatus {
  online: boolean;
  did: string | null;
  alias: string | null;
}

interface DaemonSettings {
  codingAgentCommand: string;
  defaultAIProvider: string;
  apiKeys: Record<string, string | undefined>;
  ollamaEndpoint: string;
  whisperModel: string;
  whisperLanguage: string;
}

const CODING_AGENT_PRESETS: { label: string; command: string }[] = [
  {
    label: 'Claude Code (resume)',
    command: 'claude --continue --allow-dangerously-skip-permissions || claude --allow-dangerously-skip-permissions',
  },
  { label: 'Claude Code (fresh session)', command: 'claude --allow-dangerously-skip-permissions' },
  { label: 'Aider', command: 'aider' },
  { label: 'Cursor (workspace)', command: 'cursor .' },
  { label: 'Custom…', command: 'CUSTOM' },
];

type Pane = 'vaults' | 'settings';

export function TrayDashboard() {
  const [vaults, setVaults] = useState<VaultEntry[]>([]);
  const [status, setStatus] = useState<DaemonStatus>({ online: true, did: null, alias: null });
  const [pane, setPane] = useState<Pane>('vaults');
  const [settings, setSettings] = useState<DaemonSettings | null>(null);

  useEffect(() => {
    refresh();
    const t = window.setInterval(refresh, 5000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (pane === 'settings' && !settings) {
      invoke<DaemonSettings>('get_settings').then(setSettings).catch(console.error);
    }
  }, [pane, settings]);

  async function refresh() {
    try {
      const v = await invoke<VaultEntry[]>('list_vaults');
      setVaults(v);
      const s = await invoke<DaemonStatus>('get_status');
      setStatus(s);
    } catch (err) {
      console.error('refresh failed', err);
    }
  }

  async function saveSettings(next: DaemonSettings) {
    const saved = await invoke<DaemonSettings>('set_settings', { settings: next });
    setSettings(saved);
  }

  async function openInObsidian(vaultPath: string) {
    await invoke('open_vault_in_obsidian', { vaultPath });
  }

  async function toggleDevMode(vaultPath: string, current: boolean) {
    await invoke('set_dev_mode', { vaultPath, enabled: !current });
    await refresh();
  }

  async function openCodingAgent(vaultPath: string) {
    await invoke('open_coding_agent', { repoPath: `${vaultPath}/InterBrain` });
  }

  async function openFirstRun() {
    await invoke('open_first_run_window');
  }

  async function quitApp() {
    await invoke('quit_app');
  }

  return (
    <div className="tray-dashboard">
      <div className="tray-header">
        <img src="/icon-color.png" alt="InterBrain" />
        <div className="tray-title">InterBrain</div>
        <div className="tray-status">
          <span className={`status-dot ${status.online ? '' : 'offline'}`} />
          {status.alias ?? (status.did ? short(status.did) : 'no identity')}
        </div>
      </div>

      <div className="pane-tabs">
        <button className={pane === 'vaults' ? 'active' : ''} onClick={() => setPane('vaults')}>Vaults</button>
        <button className={pane === 'settings' ? 'active' : ''} onClick={() => setPane('settings')}>Settings</button>
      </div>

      {pane === 'vaults' && (
        <div className="vault-list">
          {vaults.length === 0 && (
            <div style={{ color: 'var(--ib-text-muted)', fontSize: 13, padding: '8px 10px' }}>
              No vaults yet. Run setup to install InterBrain into a vault.
            </div>
          )}
          {vaults.map(v => (
            <div key={v.path} className="vault-row">
              <div
                className="vault-name"
                onClick={() => openInObsidian(v.path)}
                title={v.path}
              >
                {v.name}
              </div>
              <div className={`vault-mode ${v.devMode ? 'dev' : ''}`}>
                {v.devMode ? 'dev' : 'managed'}
              </div>
              <div className="vault-actions">
                {v.devMode && (
                  <button
                    className="icon-btn dev"
                    onClick={() => openCodingAgent(v.path)}
                    title="Open coding agent"
                  >
                    ▶
                  </button>
                )}
                <button
                  className="icon-btn"
                  onClick={() => toggleDevMode(v.path, v.devMode)}
                  title={v.devMode ? 'Switch to managed mode' : 'Switch to dev mode'}
                >
                  ⚙
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pane === 'settings' && settings && (
        <SettingsPane settings={settings} onSave={saveSettings} />
      )}
      {pane === 'settings' && !settings && (
        <div style={{ color: 'var(--ib-text-muted)', fontSize: 13, padding: '8px 10px' }}>
          Loading…
        </div>
      )}

      <div className="tray-footer">
        <button onClick={openFirstRun}>Setup</button>
        <button className="danger" onClick={quitApp}>Quit</button>
      </div>
    </div>
  );
}

interface SettingsPaneProps {
  settings: DaemonSettings;
  onSave: (s: DaemonSettings) => Promise<void>;
}

const AI_PROVIDERS = [
  { value: 'claude', label: 'Claude' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'groq', label: 'Groq' },
  { value: 'xai', label: 'xAI Grok' },
  { value: 'ollama', label: 'Ollama (local)' },
];

const WHISPER_MODELS = [
  { value: 'tiny', label: 'tiny — fastest, lowest accuracy' },
  { value: 'base.en', label: 'base.en — English-only, very fast' },
  { value: 'base', label: 'base — multilingual, very fast' },
  { value: 'small.en', label: 'small.en — English-only, balanced' },
  { value: 'small', label: 'small — multilingual, balanced (default)' },
  { value: 'medium', label: 'medium — slower, higher accuracy' },
  { value: 'large-v3', label: 'large-v3 — best accuracy, slow' },
  { value: 'large-v3-turbo', label: 'large-v3-turbo — best/fast balance' },
];

const WHISPER_LANGS = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'it', label: 'Italian' },
  { value: 'nl', label: 'Dutch' },
  { value: 'ja', label: 'Japanese' },
  { value: 'zh', label: 'Chinese' },
];

function SettingsPane({ settings, onSave }: SettingsPaneProps) {
  return (
    <div className="settings-pane">
      <CodingAgentSection settings={settings} onSave={onSave} />
      <SectionDivider />
      <AIProviderSection settings={settings} onSave={onSave} />
      <SectionDivider />
      <ApiKeysSection settings={settings} onSave={onSave} />
      <SectionDivider />
      <LocalAISection settings={settings} onSave={onSave} />
      <SectionDivider />
      <TranscriptionSection settings={settings} onSave={onSave} />
    </div>
  );
}

function SectionDivider() {
  return (
    <div
      style={{
        margin: '14px 0 6px',
        borderTop: '1px solid var(--ib-divider)',
      }}
    />
  );
}

function CodingAgentSection({ settings, onSave }: SettingsPaneProps) {
  const matchingPreset = CODING_AGENT_PRESETS.find(p => p.command === settings.codingAgentCommand);
  const [presetLabel, setPresetLabel] = useState(matchingPreset?.label ?? 'Custom…');
  const [customCommand, setCustomCommand] = useState(settings.codingAgentCommand);

  async function handlePresetChange(label: string) {
    setPresetLabel(label);
    const preset = CODING_AGENT_PRESETS.find(p => p.label === label);
    if (!preset) return;
    if (preset.command === 'CUSTOM') return;
    setCustomCommand(preset.command);
    await onSave({ ...settings, codingAgentCommand: preset.command });
  }

  async function saveCustom() {
    await onSave({ ...settings, codingAgentCommand: customCommand });
  }

  const isCustom = presetLabel === 'Custom…';

  return (
    <>
      <label className="setting-label">Coding agent</label>
      <select value={presetLabel} onChange={e => handlePresetChange(e.target.value)}>
        {CODING_AGENT_PRESETS.map(p => (
          <option key={p.label} value={p.label}>{p.label}</option>
        ))}
      </select>
      {isCustom && (
        <input
          type="text"
          value={customCommand}
          onChange={e => setCustomCommand(e.target.value)}
          onBlur={saveCustom}
          placeholder="shell command…"
          style={{ marginTop: 6 }}
        />
      )}
      <div className="setting-help">
        Runs when you click ▶ on a dev-mode vault, or trigger "Open coding agent"
        on a DreamNode in Obsidian.
      </div>
    </>
  );
}

function AIProviderSection({ settings, onSave }: SettingsPaneProps) {
  return (
    <>
      <label className="setting-label">Default AI provider</label>
      <select
        value={settings.defaultAIProvider}
        onChange={e => onSave({ ...settings, defaultAIProvider: e.target.value })}
      >
        {AI_PROVIDERS.map(p => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>
      <div className="setting-help">
        Used by the InterBrain plugin for LLM calls. Local models (Ollama) need
        no API key; remote providers require a key below.
      </div>
    </>
  );
}

function ApiKeysSection({ settings, onSave }: SettingsPaneProps) {
  function setKey(provider: 'claude' | 'openai' | 'groq' | 'xai', value: string) {
    void onSave({
      ...settings,
      apiKeys: { ...settings.apiKeys, [provider]: value || undefined },
    });
  }

  return (
    <>
      <label className="setting-label">API keys</label>
      <ApiKeyInput
        label="Claude (Anthropic)"
        placeholder="sk-ant-..."
        value={settings.apiKeys.claude ?? ''}
        onCommit={v => setKey('claude', v)}
      />
      <ApiKeyInput
        label="OpenAI"
        placeholder="sk-..."
        value={settings.apiKeys.openai ?? ''}
        onCommit={v => setKey('openai', v)}
      />
      <ApiKeyInput
        label="Groq"
        placeholder="gsk_..."
        value={settings.apiKeys.groq ?? ''}
        onCommit={v => setKey('groq', v)}
      />
      <ApiKeyInput
        label="xAI Grok"
        placeholder="xai-..."
        value={settings.apiKeys.xai ?? ''}
        onCommit={v => setKey('xai', v)}
      />
      <div className="setting-help">
        Stored locally on this machine. Saved to disk when you click outside the
        field.
      </div>
    </>
  );
}

function ApiKeyInput({
  label, placeholder, value, onCommit,
}: { label: string; placeholder: string; value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 11, color: 'var(--ib-text-muted)', marginBottom: 2 }}>{label}</div>
      <input
        type="password"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { if (draft !== value) onCommit(draft); }}
        placeholder={placeholder}
      />
    </div>
  );
}

function LocalAISection({ settings, onSave }: SettingsPaneProps) {
  const [draft, setDraft] = useState(settings.ollamaEndpoint);
  useEffect(() => { setDraft(settings.ollamaEndpoint); }, [settings.ollamaEndpoint]);
  return (
    <>
      <label className="setting-label">Ollama endpoint</label>
      <input
        type="text"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== settings.ollamaEndpoint) {
            void onSave({ ...settings, ollamaEndpoint: draft });
          }
        }}
        placeholder="http://localhost:11434"
      />
      <div className="setting-help">
        Where the local Ollama server is reachable. Default is fine for most installs.
      </div>
    </>
  );
}

function TranscriptionSection({ settings, onSave }: SettingsPaneProps) {
  return (
    <>
      <label className="setting-label">Transcription (Whisper)</label>
      <div style={{ fontSize: 11, color: 'var(--ib-text-muted)', marginBottom: 2 }}>Model</div>
      <select
        value={settings.whisperModel}
        onChange={e => onSave({ ...settings, whisperModel: e.target.value })}
      >
        {WHISPER_MODELS.map(m => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>
      <div style={{ fontSize: 11, color: 'var(--ib-text-muted)', marginTop: 6, marginBottom: 2 }}>Language</div>
      <select
        value={settings.whisperLanguage}
        onChange={e => onSave({ ...settings, whisperLanguage: e.target.value })}
      >
        {WHISPER_LANGS.map(l => (
          <option key={l.value} value={l.value}>{l.label}</option>
        ))}
      </select>
      <div className="setting-help">
        Used by the conversational copilot and realtime transcription features.
      </div>
    </>
  );
}

function short(did: string): string {
  if (did.length < 16) return did;
  return `${did.slice(0, 10)}…${did.slice(-4)}`;
}
