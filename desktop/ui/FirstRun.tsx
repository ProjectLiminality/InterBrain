import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

type Step = 'welcome' | 'identity' | 'vault' | 'done';
const ORDER: Step[] = ['welcome', 'identity', 'vault', 'done'];

interface DiscoveredIdentity {
  source: 'radicle' | 'fresh';
  did: string;
  alias: string | null;
}

export function FirstRun() {
  const [step, setStep] = useState<Step>('welcome');
  const [vaults, setVaults] = useState<string[]>([]);
  const [selectedVault, setSelectedVault] = useState<string | null>(null);
  const [identity, setIdentity] = useState<DiscoveredIdentity | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<string[]>('discover_obsidian_vaults').then(setVaults).catch(console.error);
  }, []);

  async function go(next: Step) {
    setError(null);
    setStep(next);
  }

  async function detectIdentity() {
    setBusy(true);
    setError(null);
    try {
      const found = await invoke<DiscoveredIdentity | null>('detect_existing_identity');
      if (found) setIdentity(found);
      else {
        const fresh = await invoke<DiscoveredIdentity>('generate_fresh_identity');
        setIdentity(fresh);
      }
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function unlockExisting() {
    if (!identity) return;
    setBusy(true);
    setError(null);
    try {
      await invoke('unlock_existing_identity', { passphrase });
      await go('vault');
    } catch (e: unknown) {
      setError('Could not unlock with that passphrase.');
    } finally {
      setBusy(false);
    }
  }

  async function pickVault() {
    const path = await openDialog({ directory: true, multiple: false, title: 'Choose Obsidian vault' });
    if (typeof path === 'string') {
      setSelectedVault(path);
      if (!vaults.includes(path)) setVaults([...vaults, path]);
    }
  }

  async function installPlugin() {
    if (!selectedVault) return;
    setBusy(true);
    setError(null);
    try {
      await invoke('install_plugin_into_vault', { vaultPath: selectedVault });
      await go('done');
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    await invoke('close_first_run');
  }

  const idx = ORDER.indexOf(step);

  return (
    <div className="first-run">
      <img className="logo" src="/icon-color.png" alt="InterBrain" />

      <div className="step-progress">
        {ORDER.map((s, i) => (
          <span key={s} className={i < idx ? 'done' : i === idx ? 'active' : ''} />
        ))}
      </div>

      {step === 'welcome' && (
        <>
          <h1>Welcome to InterBrain</h1>
          <p className="tagline">Knowledge gardening as a way of being together.</p>
          <p className="step-body">
            We'll set up your identity, install the plugin into one of your Obsidian
            vaults, and leave a small companion app running in your menu bar. Takes
            about a minute.
          </p>
          <div className="step-actions">
            <button className="btn-primary" onClick={() => { go('identity'); detectIdentity(); }}>
              Begin
            </button>
          </div>
        </>
      )}

      {step === 'identity' && (
        <>
          <h2>Your identity</h2>
          {!identity && (
            <p className="step-body">{busy ? 'Looking for an existing identity…' : ''}</p>
          )}
          {identity?.source === 'radicle' && (
            <>
              <p className="step-body">
                We found an existing Radicle identity on this machine. Unlock it to
                reuse your DID — your existing connections continue uninterrupted.
              </p>
              <div style={{ fontSize: 12, color: 'var(--ib-text-muted)', marginBottom: 14 }}>
                {identity.did}
              </div>
              <input
                type="password"
                placeholder="Radicle passphrase"
                value={passphrase}
                onChange={e => setPassphrase(e.target.value)}
              />
              <div className="step-actions">
                <button className="btn-secondary" onClick={async () => {
                  const fresh = await invoke<DiscoveredIdentity>('generate_fresh_identity');
                  setIdentity(fresh);
                }}>
                  Start fresh
                </button>
                <button className="btn-primary" onClick={unlockExisting} disabled={busy || !passphrase}>
                  {busy ? 'Unlocking…' : 'Unlock'}
                </button>
              </div>
            </>
          )}
          {identity?.source === 'fresh' && (
            <>
              <p className="step-body">
                A new cryptographic identity has been generated for you and stored
                in your system keychain. You won't need to enter a passphrase again.
              </p>
              <div style={{ fontSize: 12, color: 'var(--ib-text-muted)', marginBottom: 14 }}>
                {identity.did}
              </div>
              <div className="step-actions">
                <button className="btn-primary" onClick={() => go('vault')}>Continue</button>
              </div>
            </>
          )}
          {error && <p style={{ color: 'var(--ib-red)', marginTop: 12 }}>{error}</p>}
        </>
      )}

      {step === 'vault' && (
        <>
          <h2>Choose your vault</h2>
          <p className="step-body">
            InterBrain installs as a plugin in an Obsidian vault. Pick an existing
            vault or browse to one.
          </p>
          {vaults.length > 0 && (
            <select
              value={selectedVault ?? ''}
              onChange={e => setSelectedVault(e.target.value || null)}
              style={{ marginBottom: 12 }}
            >
              <option value="">— select a vault —</option>
              {vaults.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          )}
          <div className="step-actions">
            <button className="btn-secondary" onClick={pickVault}>Browse…</button>
            <button className="btn-primary" onClick={installPlugin} disabled={!selectedVault || busy}>
              {busy ? 'Installing…' : 'Install plugin'}
            </button>
          </div>
          {error && <p style={{ color: 'var(--ib-red)', marginTop: 12 }}>{error}</p>}
        </>
      )}

      {step === 'done' && (
        <>
          <h2>You're set up.</h2>
          <p className="step-body">
            InterBrain lives in your menu bar. Click the icon any time to open
            your vault, change settings, or invite a friend in.
          </p>
          <div className="step-actions">
            <button className="btn-primary" onClick={finish}>Done</button>
          </div>
        </>
      )}
    </div>
  );
}
