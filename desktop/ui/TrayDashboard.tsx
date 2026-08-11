import { useEffect, useState } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';

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

interface GhStatus {
  installed: boolean;
  authenticated: boolean;
  username: string | null;
  version: string | null;
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

interface IncomingEntry {
  vaultPath: string;
  vaultName: string;
  dreamnodePath: string;
  dreamnodeUuid: string;
  dreamnodeName: string;
  nodeType: string;
  dreamTalkPath: string | null;
  totalCommits: number;
  peers: string[];
}

interface OutboxEntry {
  vaultPath: string;
  vaultName: string;
  dreamnodePath: string;
  dreamnodeUuid: string;
  dreamnodeName: string;
  nodeType: string;
  dreamTalkPath: string | null;
  commitsUnpushed: number;
}

interface ActivityScanResult {
  incoming: IncomingEntry[];
  outgoing: OutboxEntry[];
  scannedAtMs: number;
}

type Pane = 'vaults' | 'activity' | 'settings';

export function TrayDashboard() {
  const [vaults, setVaults] = useState<VaultEntry[]>([]);
  const [status, setStatus] = useState<DaemonStatus>({ online: true, did: null, alias: null });
  const [gh, setGh] = useState<GhStatus | null>(null);
  const [pane, setPane] = useState<Pane>('vaults');
  const [settings, setSettings] = useState<DaemonSettings | null>(null);
  const [activity, setActivity] = useState<ActivityScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  // "+ Add vault" inline picker state (Vaults pane)
  const [addingVault, setAddingVault] = useState(false);
  const [discovered, setDiscovered] = useState<string[] | null>(null);
  const [installingVault, setInstallingVault] = useState<string | null>(null);
  const [addVaultError, setAddVaultError] = useState<string | null>(null);

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
      const g = await invoke<GhStatus>('gh_status');
      setGh(g);
      // Cached last scan — cheap; picks up scheduled-scan results as they land.
      const a = await invoke<ActivityScanResult | null>('activity_get');
      setActivity(a);
    } catch (err) {
      console.error('refresh failed', err);
    }
  }

  async function scanActivityNow() {
    setScanning(true);
    try {
      const a = await invoke<ActivityScanResult>('activity_scan');
      setActivity(a);
    } catch (err) {
      console.error('activity scan failed', err);
    } finally {
      setScanning(false);
    }
  }

  // Deep-link into Obsidian: open the right vault, select the DreamNode,
  // and pop the appropriate modal (Check-for-Updates / Share-Changes).
  // The dashboard itself never acts — it's an overview + shortcut.
  async function openActivityEntry(vaultName: string, uuid: string, mode: 'inbox' | 'outbox') {
    const url =
      `obsidian://interbrain-activity?vault=${encodeURIComponent(vaultName)}` +
      `&uuid=${encodeURIComponent(uuid)}&mode=${mode}`;
    try {
      await invoke('open_external_url', { url });
    } catch (err) {
      console.error('open activity entry failed', err);
    }
  }

  async function toggleAddVault() {
    setAddVaultError(null);
    if (addingVault) {
      setAddingVault(false);
      return;
    }
    setAddingVault(true);
    try {
      const found = await invoke<string[]>('discover_obsidian_vaults');
      setDiscovered(found);
    } catch (err) {
      console.error('vault discovery failed', err);
      setDiscovered([]);
    }
  }

  async function addVault(vaultPath: string) {
    setInstallingVault(vaultPath);
    setAddVaultError(null);
    try {
      await invoke('install_plugin_into_vault', { vaultPath });
      await refresh();
      setAddingVault(false);
    } catch (err) {
      console.error('install into vault failed', err);
      setAddVaultError(String(err));
    } finally {
      setInstallingVault(null);
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
          {gh?.authenticated && gh.username
            ? `@${gh.username}`
            : (status.alias ?? (status.did ? short(status.did) : 'signed out'))}
        </div>
      </div>

      <div className="pane-tabs">
        <button className={pane === 'vaults' ? 'active' : ''} onClick={() => setPane('vaults')}>Vaults</button>
        <button className={pane === 'activity' ? 'active' : ''} onClick={() => setPane('activity')}>
          Activity{activity && activity.incoming.length > 0 ? ` (${activity.incoming.length})` : ''}
        </button>
        <button className={pane === 'settings' ? 'active' : ''} onClick={() => setPane('settings')}>Settings</button>
      </div>

      {pane === 'vaults' && (
        <div className="vault-list">
          {vaults.length === 0 && !addingVault && (
            <div style={{ color: 'var(--ib-text-muted)', fontSize: 13, padding: '8px 10px' }}>
              No vaults yet. Add one below, or run Setup for the guided flow.
            </div>
          )}
          {vaults.map(v => {
            // Dev mode toggle is macOS-only for now — Windows junctions work
            // but the build pipeline (npm install, npm build) inside the
            // vault hasn't been hardened cross-platform yet.
            const isMac = typeof navigator !== 'undefined' && navigator.platform.startsWith('Mac');
            const devModeAvailable = isMac;
            return (
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
                    onClick={() => devModeAvailable && toggleDevMode(v.path, v.devMode)}
                    disabled={!devModeAvailable}
                    title={
                      !devModeAvailable
                        ? 'Dev mode is macOS-only for now (coming soon on Windows)'
                        : v.devMode
                          ? 'Switch to managed mode'
                          : 'Switch to dev mode'
                    }
                  >
                    ⚙
                  </button>
                </div>
              </div>
            );
          })}

          {/* Add a vault without going through the full Setup flow. */}
          <div style={{ padding: '6px 10px' }}>
            <button className="text-btn" onClick={toggleAddVault} title="Install InterBrain into another Obsidian vault">
              {addingVault ? '× Cancel' : '+ Add vault'}
            </button>
          </div>
          {addingVault && (
            <>
              {discovered === null && (
                <div style={{ color: 'var(--ib-text-muted)', fontSize: 13, padding: '4px 10px' }}>
                  Looking for Obsidian vaults…
                </div>
              )}
              {discovered !== null && (() => {
                const registered = new Set(vaults.map(v => v.path));
                const candidates = discovered.filter(p => !registered.has(p));
                if (candidates.length === 0) {
                  return (
                    <div style={{ color: 'var(--ib-text-muted)', fontSize: 13, padding: '4px 10px' }}>
                      No other Obsidian vaults found. Use Setup to create a new one.
                    </div>
                  );
                }
                return candidates.map(p => {
                  const name = p.split(/[\\/]/).filter(Boolean).pop() ?? p;
                  const busy = installingVault === p;
                  return (
                    <div key={p} className="vault-row">
                      <div className="vault-name" title={p}>{name}</div>
                      <div className="vault-actions">
                        <button
                          className="text-btn"
                          disabled={installingVault !== null}
                          onClick={() => addVault(p)}
                          title={`Install InterBrain into ${p}`}
                        >
                          {busy ? 'Installing…' : 'Add'}
                        </button>
                      </div>
                    </div>
                  );
                });
              })()}
              {addVaultError && (
                <div style={{ color: 'var(--ib-danger, #e06c75)', fontSize: 12, padding: '4px 10px' }}>
                  {addVaultError}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {pane === 'activity' && (
        <ActivityPane
          activity={activity}
          scanning={scanning}
          onScan={scanActivityNow}
          onOpen={openActivityEntry}
        />
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

interface ActivityPaneProps {
  activity: ActivityScanResult | null;
  scanning: boolean;
  onScan: () => void;
  onOpen: (vaultName: string, uuid: string, mode: 'inbox' | 'outbox') => void;
}

/**
 * Mini DreamNode: the node exactly as it looks in the DreamSpace, in
 * miniature — circular DreamTalk thumbnail on black, ringed blue for
 * dreams / red for dreamers. Images stream over the Tauri asset protocol
 * (no base64 round-trips); non-image media and empty nodes fall back to
 * a plain ringed circle. Colors mirror dreamNodeStyles in the plugin.
 */
function MiniNode({ nodeType, dreamTalkPath, name }: { nodeType: string; dreamTalkPath: string | null; name: string }) {
  const ring = nodeType === 'dreamer' ? '#FF6B6B' : '#479FF8';
  const ext = dreamTalkPath?.split('.').pop()?.toLowerCase() ?? '';
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
  const size = 34;
  const base: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    border: `2px solid ${ring}`,
    background: '#000',
    flexShrink: 0,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
  if (dreamTalkPath && isImage) {
    return (
      <div style={base}>
        <img
          src={convertFileSrc(dreamTalkPath)}
          alt=""
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      </div>
    );
  }
  return (
    <div style={{ ...base, color: 'var(--ib-text-muted)', fontSize: 13 }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

/**
 * Activity feed (#393): a pure overview of what flows in and out across all
 * vaults — one aggregated row per DreamNode. Rows carry no actions; clicking
 * deep-links into Obsidian where the node is selected and the appropriate
 * modal opens (Check-for-Updates for incoming, Share-Changes for unshared).
 */
function ActivityPane({ activity, scanning, onScan, onOpen }: ActivityPaneProps) {
  const muted = { color: 'var(--ib-text-muted)', fontSize: 13, padding: '8px 10px' } as const;
  const sectionLabel = {
    color: 'var(--ib-text-muted)',
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    padding: '10px 10px 4px',
  };
  const countChip: React.CSSProperties = {
    color: 'var(--ib-text-muted)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    border: '1px solid var(--ib-border, rgba(255,255,255,0.18))',
    borderRadius: 6,
    padding: '3px 8px',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };

  return (
    <div className="vault-list">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px 0' }}>
        <span style={{ color: 'var(--ib-text-muted)', fontSize: 12 }}>
          {scanning
            ? 'Scanning…'
            : activity
              ? `Last scan ${new Date(activity.scannedAtMs).toLocaleTimeString()}`
              : 'No scan yet'}
        </span>
        <button className="icon-btn" onClick={onScan} disabled={scanning} title="Scan now">
          ↻
        </button>
      </div>

      {!activity && !scanning && (
        <div style={muted}>The first background scan runs shortly after launch — or scan now.</div>
      )}

      {activity && (
        <>
          <div style={sectionLabel}>Incoming</div>
          {activity.incoming.length === 0 && <div style={muted}>Nothing new from your peers.</div>}
          {activity.incoming.map(e => (
            <div
              key={e.dreamnodePath}
              className="vault-row"
              style={{ cursor: 'pointer', gap: 10 }}
              onClick={() => onOpen(e.vaultName, e.dreamnodeUuid, 'inbox')}
              title={`Review incoming commits for ${e.dreamnodeName} (${e.peers.map(p => '@' + p).join(', ')})`}
            >
              <MiniNode nodeType={e.nodeType} dreamTalkPath={e.dreamTalkPath} name={e.dreamnodeName} />
              <div className="vault-name">{e.dreamnodeName}</div>
              <div style={countChip}>
                {e.totalCommits} commit{e.totalCommits === 1 ? '' : 's'}
              </div>
            </div>
          ))}

          <div style={sectionLabel}>Unshared</div>
          {activity.outgoing.length === 0 && <div style={muted}>Everything you've committed is shared.</div>}
          {activity.outgoing.map(e => (
            <div
              key={e.dreamnodePath}
              className="vault-row"
              style={{ cursor: 'pointer', gap: 10 }}
              onClick={() => onOpen(e.vaultName, e.dreamnodeUuid, 'outbox')}
              title={`Review & share unpushed commits for ${e.dreamnodeName}`}
            >
              <MiniNode nodeType={e.nodeType} dreamTalkPath={e.dreamTalkPath} name={e.dreamnodeName} />
              <div className="vault-name">{e.dreamnodeName}</div>
              <div style={countChip}>
                {e.commitsUnpushed} commit{e.commitsUnpushed === 1 ? '' : 's'}
              </div>
            </div>
          ))}
        </>
      )}
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
      <SectionDivider />
      <GitHubSection />
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.94 10.94 0 0112 19c-6.5 0-10-7-10-7a18.6 18.6 0 014.22-5.19" />
      <path d="M9.9 4.24A10.94 10.94 0 0112 4c6.5 0 10 7 10 7a18.7 18.7 0 01-2.16 3.19" />
      <path d="M9.88 9.88A3 3 0 0014.12 14.12" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
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
  const [revealed, setRevealed] = useState(false);
  useEffect(() => { setDraft(value); }, [value]);
  const dirty = draft !== value;

  function commit() {
    onCommit(draft);
  }
  function reset() {
    setDraft(value);
  }

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 11, color: 'var(--ib-text-muted)', marginBottom: 2 }}>{label}</div>
      <div className="api-key-input-row">
        <div className="api-key-input-wrapper">
          <input
            type={revealed ? 'text' : 'password'}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder={placeholder}
          />
          <button
            type="button"
            className="api-key-eye"
            aria-label={revealed ? 'Hide value' : 'Show value'}
            title={revealed ? 'Hide value' : 'Show value'}
            onClick={() => setRevealed(r => !r)}
          >
            {revealed ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        {dirty && (
          <>
            <button
              type="button"
              className="api-key-action save"
              aria-label="Save"
              title="Save"
              onClick={commit}
            >
              <CheckIcon />
            </button>
            <button
              type="button"
              className="api-key-action cancel"
              aria-label="Discard changes"
              title="Discard changes"
              onClick={reset}
            >
              <XIcon />
            </button>
          </>
        )}
      </div>
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

interface GhStatus {
  installed: boolean;
  authenticated: boolean;
  username: string | null;
  version: string | null;
}

interface DeviceFlowStart {
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
  deviceCode: string;
}

function GitHubSection() {
  const [status, setStatus] = useState<GhStatus | null>(null);
  const [phase, setPhase] = useState<'idle' | 'starting' | 'awaiting' | 'finishing' | 'signing-out'>('idle');
  const [flow, setFlow] = useState<DeviceFlowStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  const refresh = async () => {
    try {
      const s = await invoke<GhStatus>('gh_status');
      setStatus(s);
    } catch (err) {
      console.error('gh_status failed', err);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const signIn = async () => {
    setError(null);
    setCodeCopied(false);
    setPhase('starting');
    try {
      const start = await invoke<DeviceFlowStart>('gh_begin_sign_in');
      setFlow(start);
      // Auto-copy the code so the user can paste it directly in the browser.
      try {
        await navigator.clipboard.writeText(start.userCode);
        setCodeCopied(true);
      } catch { /* clipboard may be blocked — code is still visible in UI */ }
      setPhase('awaiting');
      // Begin polling. This await resolves when the user finishes auth.
      setPhase('finishing');
      await invoke<string>('gh_complete_sign_in', {
        deviceCode: start.deviceCode,
        interval: start.interval,
      });
      await refresh();
      setFlow(null);
      setPhase('idle');
    } catch (err) {
      console.error('sign-in failed', err);
      setError(typeof err === 'string' ? err : (err as Error).message);
      setFlow(null);
      setPhase('idle');
    }
  };

  const cancelSignIn = () => {
    // We don't have a server-side cancel, but the polling will time out.
    // Just clear local state so the user can retry.
    setFlow(null);
    setPhase('idle');
    setError(null);
  };

  const signOut = async () => {
    setError(null);
    setPhase('signing-out');
    try {
      await invoke('gh_sign_out');
      await refresh();
    } catch (err) {
      console.error('gh_sign_out failed', err);
      setError(typeof err === 'string' ? err : (err as Error).message);
    } finally {
      setPhase('idle');
    }
  };

  const copyCode = async () => {
    if (!flow) return;
    try {
      await navigator.clipboard.writeText(flow.userCode);
      setCodeCopied(true);
    } catch { /* ignore */ }
  };

  const reopenBrowser = async () => {
    if (!flow) return;
    try {
      await invoke('open_external_url', { url: flow.verificationUri });
    } catch { /* ignore */ }
  };

  return (
    <>
      <label className="setting-label">GitHub</label>

      {status === null && (
        <div className="setting-muted">Checking…</div>
      )}

      {status && !status.installed && (
        <div className="setting-muted">
          gh CLI not installed.
        </div>
      )}

      {/* Authenticated */}
      {status && status.installed && status.authenticated && phase !== 'starting' && phase !== 'awaiting' && phase !== 'finishing' && (
        <>
          <div className="gh-identity">
            Signed in as <strong>{status.username}</strong>
          </div>
          <button
            type="button"
            className="ib-btn"
            onClick={signOut}
            disabled={phase === 'signing-out'}
          >
            {phase === 'signing-out' ? 'Signing out…' : 'Sign out'}
          </button>
        </>
      )}

      {/* Not authenticated, no flow in progress */}
      {status && status.installed && !status.authenticated && phase === 'idle' && (
        <button type="button" className="ib-btn" onClick={signIn}>
          Sign in with GitHub
        </button>
      )}

      {/* Flow in progress: starting (briefly) */}
      {phase === 'starting' && (
        <div className="setting-muted">Opening browser…</div>
      )}

      {/* Flow in progress: awaiting / finishing — show device code + cancel */}
      {(phase === 'awaiting' || phase === 'finishing') && flow && (
        <div className="gh-flow">
          <div className="gh-flow-instruction">
            Enter this code in your browser:
          </div>
          <div className="gh-code-row">
            <code className="gh-code" onClick={copyCode}>{flow.userCode}</code>
            <button
              type="button"
              className="ib-btn ib-btn-small"
              onClick={copyCode}
            >
              {codeCopied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="gh-flow-actions">
            <button type="button" className="ib-btn ib-btn-link" onClick={reopenBrowser}>
              Reopen browser
            </button>
            <button type="button" className="ib-btn ib-btn-link" onClick={cancelSignIn}>
              Cancel
            </button>
          </div>
          <div className="setting-muted gh-flow-hint">
            Waiting for authorization…
          </div>
        </div>
      )}

      {error && (
        <div className="setting-error">{error}</div>
      )}

      {status?.version && (
        <div className="setting-muted setting-faint">
          gh {status.version}
        </div>
      )}

      <div className="setting-help">
        Used for publishing DreamSongs to GitHub Pages.
      </div>
    </>
  );
}

function short(did: string): string {
  if (did.length < 16) return did;
  return `${did.slice(0, 10)}…${did.slice(-4)}`;
}
