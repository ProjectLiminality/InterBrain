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

export function TrayDashboard() {
  const [vaults, setVaults] = useState<VaultEntry[]>([]);
  const [status, setStatus] = useState<DaemonStatus>({ online: true, did: null, alias: null });

  useEffect(() => {
    refresh();
    const t = window.setInterval(refresh, 5000);
    return () => window.clearInterval(t);
  }, []);

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

      <div className="section-label">Vaults</div>
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

      <div className="tray-footer">
        <button onClick={openFirstRun}>Setup</button>
        <button className="danger" onClick={quitApp}>Quit</button>
      </div>
    </div>
  );
}

function short(did: string): string {
  if (did.length < 16) return did;
  return `${did.slice(0, 10)}…${did.slice(-4)}`;
}
