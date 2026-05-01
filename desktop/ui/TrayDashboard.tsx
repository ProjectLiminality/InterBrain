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

function SettingsPane({ settings, onSave }: SettingsPaneProps) {
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
    <div className="settings-pane">
      <label className="setting-label">Coding agent</label>
      <select value={presetLabel} onChange={e => handlePresetChange(e.target.value)}>
        {CODING_AGENT_PRESETS.map(p => (
          <option key={p.label} value={p.label}>{p.label}</option>
        ))}
      </select>
      {isCustom && (
        <>
          <input
            type="text"
            value={customCommand}
            onChange={e => setCustomCommand(e.target.value)}
            onBlur={saveCustom}
            placeholder="shell command…"
            style={{ marginTop: 6 }}
          />
        </>
      )}
      <div className="setting-help">
        Run when you click ▶ on a dev-mode vault, or trigger "Open coding agent"
        on any DreamNode in Obsidian.
      </div>
    </div>
  );
}

function short(did: string): string {
  if (did.length < 16) return did;
  return `${did.slice(0, 10)}…${did.slice(-4)}`;
}
