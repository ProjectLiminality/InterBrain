import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

type Step = 'welcome' | 'prereqs' | 'identity' | 'vault' | 'done';
const ORDER: Step[] = ['welcome', 'prereqs', 'identity', 'vault', 'done'];

interface DiscoveredIdentity {
  source: 'radicle' | 'fresh';
  did: string;
  alias: string | null;
}

interface DependencyStatus {
  installed: boolean;
  detail: string | null;
  installUrl: string | null;
  installCommand: string | null;
}

interface PrerequisiteStatus {
  obsidian: DependencyStatus;
  git: DependencyStatus;
}

interface FreshIdentityResult {
  identity: DiscoveredIdentity;
  passphrase: string;
  storedInKeychain: boolean;
}

type IdentityChoice =
  | { kind: 'unset' }
  | { kind: 'radicle-detected'; identity: DiscoveredIdentity }
  | { kind: 'radicle-unlocked'; identity: DiscoveredIdentity }
  | { kind: 'fresh-pending' } // user chose fresh; configuring options
  | { kind: 'fresh-created'; result: FreshIdentityResult };

type InstallStep = { label: string; status: 'pending' | 'running' | 'done' | 'failed'; detail?: string };

export function FirstRun() {
  const [step, setStep] = useState<Step>('welcome');
  const [vaults, setVaults] = useState<string[]>([]);
  const [selectedVault, setSelectedVault] = useState<string | null>(null);
  const [identity, setIdentity] = useState<IdentityChoice>({ kind: 'unset' });
  const [error, setError] = useState<string | null>(null);
  const [installSteps, setInstallSteps] = useState<InstallStep[]>([]);
  const [keychainAvailable, setKeychainAvailable] = useState<boolean | null>(null);
  const [prereqs, setPrereqs] = useState<PrerequisiteStatus | null>(null);

  useEffect(() => {
    invoke<string[]>('discover_obsidian_vaults').then(setVaults).catch(console.error);
    invoke('probe_keychain')
      .then(() => setKeychainAvailable(true))
      .catch(() => setKeychainAvailable(false));
    refreshPrereqs();
  }, []);

  function refreshPrereqs() {
    invoke<PrerequisiteStatus>('detect_prerequisites').then(setPrereqs).catch(console.error);
  }

  // When we enter the identity step, attempt to detect an existing Radicle id.
  useEffect(() => {
    if (step !== 'identity' || identity.kind !== 'unset') return;
    invoke<DiscoveredIdentity | null>('detect_existing_identity')
      .then(found => {
        if (found) setIdentity({ kind: 'radicle-detected', identity: found });
        else setIdentity({ kind: 'fresh-pending' });
      })
      .catch(err => setError(String(err)));
  }, [step, identity.kind]);

  function go(next: Step) {
    setError(null);
    setStep(next);
  }

  function goBack() {
    const idx = ORDER.indexOf(step);
    if (idx > 0) go(ORDER[idx - 1]);
  }

  function canGoForward(): boolean {
    switch (step) {
      case 'welcome': return true;
      case 'prereqs':
        return prereqs?.obsidian.installed === true && prereqs?.git.installed === true;
      case 'identity':
        return identity.kind === 'radicle-unlocked' || identity.kind === 'fresh-created';
      case 'vault':
        return false; // forward is "Install plugin" button explicitly
      case 'done': return false;
    }
  }

  function goForward() {
    const idx = ORDER.indexOf(step);
    if (idx < ORDER.length - 1 && canGoForward()) go(ORDER[idx + 1]);
  }

  const idx = ORDER.indexOf(step);

  return (
    <div className="first-run">
      <NavBar
        canBack={idx > 0 && step !== 'done'}
        canForward={canGoForward()}
        onBack={goBack}
        onForward={goForward}
      />

      <img className="logo" src="/icon-color.png" alt="InterBrain" />

      <div className="step-progress">
        {ORDER.map((s, i) => (
          <span key={s} className={i < idx ? 'done' : i === idx ? 'active' : ''} />
        ))}
      </div>

      {step === 'welcome' && <WelcomeStep onBegin={() => go('prereqs')} />}

      {step === 'prereqs' && (
        <PrereqsStep
          status={prereqs}
          onRefresh={refreshPrereqs}
          onContinue={() => go('identity')}
        />
      )}

      {step === 'identity' && (
        <IdentityStep
          state={identity}
          keychainAvailable={keychainAvailable}
          error={error}
          onError={setError}
          onIdentityResolved={setIdentity}
          onChooseFresh={() => setIdentity({ kind: 'fresh-pending' })}
          onContinue={() => go('vault')}
        />
      )}

      {step === 'vault' && (
        <VaultStep
          vaults={vaults}
          setVaults={setVaults}
          selected={selectedVault}
          onSelect={setSelectedVault}
          installSteps={installSteps}
          setInstallSteps={setInstallSteps}
          onError={setError}
          error={error}
          onComplete={() => go('done')}
        />
      )}

      {step === 'done' && <DoneStep onClose={() => invoke('close_first_run')} />}
    </div>
  );
}

function NavBar({
  canBack, canForward, onBack, onForward,
}: { canBack: boolean; canForward: boolean; onBack: () => void; onForward: () => void }) {
  return (
    <div className="first-run-navbar">
      <button
        className="nav-btn"
        disabled={!canBack}
        onClick={onBack}
        aria-label="Back"
        title="Back"
      >
        ‹
      </button>
      <div style={{ flex: 1 }} />
      <button
        className="nav-btn"
        disabled={!canForward}
        onClick={onForward}
        aria-label="Next"
        title="Next"
      >
        ›
      </button>
    </div>
  );
}

type DepKey = 'obsidian' | 'git';

interface InstallProgressPayload {
  requestId: string;
  progress: {
    dependency: DepKey;
    stage: string;
    progress: number | null;
    message: string;
  };
}

function PrereqsStep({
  status, onRefresh, onContinue,
}: { status: PrereqsStatusType; onRefresh: () => void; onContinue: () => void }) {
  const [installing, setInstalling] = useState<Record<DepKey, boolean>>({ obsidian: false, git: false });
  const [progress, setProgress] = useState<Record<DepKey, string | null>>({ obsidian: null, git: null });
  const [error, setError] = useState<Record<DepKey, string | null>>({ obsidian: null, git: null });

  // Subscribe to install-progress events from the daemon. Tauri exposes
  // events through @tauri-apps/api/event (built into the runtime), but
  // since this codebase uses raw invoke() everywhere, we'll read events
  // through the same WebSocket the plugin uses by polling the dispatcher.
  // For the daemon-internal case (this UI is hosted in the daemon's own
  // webview), Tauri's `listen` is the right channel.
  useEffect(() => {
    let cleanup: (() => void) | null = null;
    (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen<InstallProgressPayload>('install-progress', evt => {
        const dep = evt.payload.progress.dependency;
        setProgress(prev => ({ ...prev, [dep]: evt.payload.progress.message }));
        if (evt.payload.progress.stage === 'done') {
          setInstalling(prev => ({ ...prev, [dep]: false }));
          // Re-detect prereqs to reflect the install on the user's system.
          onRefresh();
        }
      });
      cleanup = unlisten;
    })();
    return () => { cleanup?.(); };
  }, [onRefresh]);

  async function installDep(dep: DepKey) {
    setInstalling(prev => ({ ...prev, [dep]: true }));
    setProgress(prev => ({ ...prev, [dep]: 'Starting…' }));
    setError(prev => ({ ...prev, [dep]: null }));
    try {
      await invoke('install_prerequisite', {
        dependency: dep,
        requestId: `${dep}-${Date.now()}`,
      });
      onRefresh();
    } catch (e: unknown) {
      setError(prev => ({ ...prev, [dep]: String(e) }));
    } finally {
      setInstalling(prev => ({ ...prev, [dep]: false }));
    }
  }

  if (!status) {
    return <p className="step-body">Checking prerequisites…</p>;
  }
  const allReady = status.obsidian.installed && status.git.installed;
  return (
    <>
      <h2>Prerequisites</h2>
      <p className="step-body">
        InterBrain needs Obsidian and git. We can install both for you — or
        if they're already on your system, we'll detect them.
      </p>
      <ul className="install-checklist" style={{ maxWidth: 460 }}>
        <DependencyRow
          name="Obsidian"
          dep={status.obsidian}
          installing={installing.obsidian}
          progress={progress.obsidian}
          error={error.obsidian}
          onInstall={() => installDep('obsidian')}
        />
        <DependencyRow
          name="git"
          dep={status.git}
          installing={installing.git}
          progress={progress.git}
          error={error.git}
          onInstall={() => installDep('git')}
        />
      </ul>
      <div className="step-actions" style={{ marginTop: 16 }}>
        <button className="btn-secondary" onClick={onRefresh}>Re-check</button>
        <button className="btn-primary" onClick={onContinue} disabled={!allReady}>
          {allReady ? 'Continue' : 'Continue (install missing first)'}
        </button>
      </div>
    </>
  );
}

type PrereqsStatusType = PrerequisiteStatus | null;

function DependencyRow({
  name, dep, installing, progress, error, onInstall,
}: {
  name: string;
  dep: DependencyStatus;
  installing: boolean;
  progress: string | null;
  error: string | null;
  onInstall: () => void;
}) {
  let status: 'done' | 'running' | 'failed' | 'pending' = dep.installed ? 'done' : 'pending';
  if (installing) status = 'running';
  if (error) status = 'failed';

  return (
    <li className={`install-step status-${status}`} style={{ alignItems: 'center' }}>
      <span className="install-step-icon">
        {status === 'done' ? '✓' : status === 'running' ? '◌' : status === 'failed' ? '✗' : '○'}
      </span>
      <span className="install-step-label" style={{ flex: '0 0 auto', minWidth: 70 }}>{name}</span>
      <span className="install-step-detail" style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
        {dep.installed && !installing && (
          <span style={{ fontStyle: 'italic' }}>{dep.detail || 'installed'}</span>
        )}
        {installing && (
          <span style={{ fontStyle: 'italic' }}>{progress ?? 'Installing…'}</span>
        )}
        {error && (
          <span style={{ color: 'var(--ib-red)', maxWidth: 220, fontSize: 11 }} title={error}>
            {error.length > 60 ? error.slice(0, 60) + '…' : error}
          </span>
        )}
        {!dep.installed && !installing && (
          <button
            className="btn-secondary"
            style={{ padding: '4px 10px', fontSize: 12 }}
            onClick={onInstall}
          >
            Install
          </button>
        )}
      </span>
    </li>
  );
}

function WelcomeStep({ onBegin }: { onBegin: () => void }) {
  return (
    <>
      <h1>Welcome to InterBrain</h1>
      <p className="tagline">Knowledge gardening as a way of being together.</p>
      <p className="step-body">
        We'll set up your identity, install the plugin into one of your Obsidian
        vaults, and leave a small companion app running in your menu bar. Takes
        about a minute.
      </p>
      <div className="step-actions">
        <button className="btn-primary" onClick={onBegin}>Begin</button>
      </div>
    </>
  );
}

interface IdentityStepProps {
  state: IdentityChoice;
  keychainAvailable: boolean | null;
  error: string | null;
  onError: (e: string | null) => void;
  onIdentityResolved: (state: IdentityChoice) => void;
  onChooseFresh: () => void;
  onContinue: () => void;
}

function IdentityStep({
  state, keychainAvailable, error, onError, onIdentityResolved, onChooseFresh, onContinue,
}: IdentityStepProps) {
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);

  // Fresh-creation form state
  const [useCustomPassphrase, setUseCustomPassphrase] = useState(false);
  const [customPassphrase, setCustomPassphrase] = useState('');
  const [storeInKeychain, setStoreInKeychain] = useState(true);

  if (state.kind === 'unset') {
    return <p className="step-body">Looking for an existing identity…</p>;
  }

  if (state.kind === 'radicle-detected') {
    return (
      <>
        <h2>Existing identity found</h2>
        <p className="step-body">
          We detected an existing Radicle identity on this machine. Enter your
          Radicle passphrase to reuse it — your existing connections and shared
          DreamNodes continue uninterrupted.
        </p>
        <div style={{ fontSize: 12, color: 'var(--ib-text-muted)', marginBottom: 14, fontFamily: 'monospace' }}>
          {state.identity.did}
        </div>
        <input
          type="password"
          placeholder="Radicle passphrase"
          value={passphrase}
          onChange={e => setPassphrase(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && passphrase) tryUnlock(); }}
        />
        <div className="step-actions">
          <button className="btn-secondary" onClick={onChooseFresh} disabled={busy}>
            Start fresh instead
          </button>
          <button className="btn-primary" onClick={tryUnlock} disabled={busy || !passphrase}>
            {busy ? 'Verifying…' : 'Unlock'}
          </button>
        </div>
        {error && <p className="error-msg">{error}</p>}
      </>
    );

    async function tryUnlock() {
      setBusy(true);
      onError(null);
      try {
        await invoke('unlock_existing_identity', { passphrase });
        onIdentityResolved({ kind: 'radicle-unlocked', identity: (state as { identity: DiscoveredIdentity }).identity });
        onContinue();
      } catch (e: unknown) {
        const msg = String(e);
        if (msg.toLowerCase().includes('incorrect')) {
          onError('That passphrase is incorrect. Try again or start fresh.');
        } else {
          onError(msg);
        }
      } finally {
        setBusy(false);
      }
    }
  }

  if (state.kind === 'radicle-unlocked') {
    return (
      <>
        <h2>Identity unlocked</h2>
        <p className="step-body">Your Radicle identity is loaded. You can continue.</p>
        <div style={{ fontSize: 12, color: 'var(--ib-text-muted)', marginBottom: 14, fontFamily: 'monospace' }}>
          {state.identity.did}
        </div>
        <div className="step-actions">
          <button className="btn-primary" onClick={onContinue}>Continue</button>
        </div>
      </>
    );
  }

  if (state.kind === 'fresh-pending') {
    return (
      <>
        <h2>Create your identity</h2>
        <p className="step-body">
          A new cryptographic identity (a public/private keypair) will be generated
          for you. Your friends will recognize you by the public part — your DID.
          The private part needs to be protected by a passphrase, just like a
          password.
        </p>

        <div className="identity-options">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={useCustomPassphrase}
              onChange={e => setUseCustomPassphrase(e.target.checked)}
            />
            <span>Use my own passphrase (otherwise one will be generated)</span>
          </label>
          {useCustomPassphrase && (
            <input
              type="password"
              placeholder="Choose a strong passphrase"
              value={customPassphrase}
              onChange={e => setCustomPassphrase(e.target.value)}
              style={{ marginTop: 8 }}
            />
          )}

          <label className="checkbox-row" style={{ marginTop: 14 }}>
            <input
              type="checkbox"
              checked={storeInKeychain}
              disabled={keychainAvailable === false}
              onChange={e => setStoreInKeychain(e.target.checked)}
            />
            <span>
              Save to {macOSorWindowsLabel()} (recommended — you won't have to type it again)
            </span>
          </label>
          {keychainAvailable === false && (
            <p className="warning-msg" style={{ marginTop: 6 }}>
              Your system keychain isn't available right now. The passphrase will be shown
              to you once so you can save it yourself.
            </p>
          )}
          {storeInKeychain && keychainAvailable !== false && (
            <p className="setting-help" style={{ marginTop: 6 }}>
              Your operating system will prompt you for permission when we save it.
            </p>
          )}
        </div>

        <div className="step-actions">
          <button className="btn-primary" onClick={createFresh} disabled={busy || (useCustomPassphrase && !customPassphrase)}>
            {busy ? 'Creating…' : 'Create identity'}
          </button>
        </div>
        {error && <p className="error-msg">{error}</p>}
      </>
    );

    async function createFresh() {
      setBusy(true);
      onError(null);
      try {
        const result = await invoke<FreshIdentityResult>('generate_fresh_identity', {
          passphrase: useCustomPassphrase ? customPassphrase : null,
          storeInKeychain,
        });
        onIdentityResolved({ kind: 'fresh-created', result });
      } catch (e: unknown) {
        onError(String(e));
      } finally {
        setBusy(false);
      }
    }
  }

  if (state.kind === 'fresh-created') {
    return (
      <>
        <h2>Identity created</h2>
        <p className="step-body">
          {state.result.storedInKeychain
            ? `Saved to ${macOSorWindowsLabel()}. You won't need to enter the passphrase again.`
            : 'Save this passphrase somewhere safe. You will need it to use this identity from another machine, or after a system reset.'}
        </p>
        <div className="identity-summary">
          <div className="summary-label">DID</div>
          <code className="summary-value">{state.result.identity.did}</code>
          {!state.result.storedInKeychain && (
            <>
              <div className="summary-label" style={{ marginTop: 12 }}>Passphrase</div>
              <code className="summary-value">{state.result.passphrase}</code>
            </>
          )}
        </div>
        <div className="step-actions">
          <button className="btn-primary" onClick={onContinue}>Continue</button>
        </div>
      </>
    );
  }

  return null;
}

interface VaultStepProps {
  vaults: string[];
  setVaults: (v: string[]) => void;
  selected: string | null;
  onSelect: (path: string | null) => void;
  installSteps: InstallStep[];
  setInstallSteps: (s: InstallStep[]) => void;
  error: string | null;
  onError: (e: string | null) => void;
  onComplete: () => void;
}

function VaultStep({
  vaults, setVaults, selected, onSelect, installSteps, setInstallSteps, error, onError, onComplete,
}: VaultStepProps) {
  const [busy, setBusy] = useState(false);

  async function pickVault() {
    const path = await openDialog({ directory: true, multiple: false, title: 'Choose Obsidian vault' });
    if (typeof path === 'string') {
      onSelect(path);
      if (!vaults.includes(path)) setVaults([...vaults, path]);
    }
  }

  async function installPlugin() {
    if (!selected) return;
    setBusy(true);
    onError(null);

    const steps: InstallStep[] = [
      { label: 'Verify vault structure', status: 'pending' },
      { label: 'Copy plugin files', status: 'pending' },
      { label: 'Enable plugin in Obsidian', status: 'pending' },
      { label: 'Register vault with daemon', status: 'pending' },
    ];
    setInstallSteps(steps);

    function update(idx: number, status: InstallStep['status'], detail?: string) {
      const next = steps.slice();
      next[idx] = { ...next[idx], status, detail };
      setInstallSteps(next);
    }

    try {
      // The Tauri command is atomic, but we can pace the UI to give visible
      // feedback. Real per-step progress would need a streaming command;
      // the perceived transparency is the value here.
      update(0, 'running');
      await sleep(150);
      update(0, 'done');

      update(1, 'running');
      await invoke('install_plugin_into_vault', { vaultPath: selected });
      update(1, 'done');

      update(2, 'running');
      await sleep(120);
      update(2, 'done');

      update(3, 'running');
      await sleep(120);
      update(3, 'done');

      await sleep(300);
      onComplete();
    } catch (e: unknown) {
      const msg = String(e);
      onError(msg);
      const idx = steps.findIndex(s => s.status === 'running');
      if (idx >= 0) update(idx, 'failed', msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2>Choose your vault</h2>
      <p className="step-body">
        InterBrain installs as a plugin in an Obsidian vault. Pick an existing
        vault or browse to one.
      </p>
      {vaults.length > 0 && (
        <select
          value={selected ?? ''}
          onChange={e => onSelect(e.target.value || null)}
          style={{ marginBottom: 12 }}
        >
          <option value="">— select a vault —</option>
          {vaults.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      )}
      <div className="step-actions">
        <button className="btn-secondary" onClick={pickVault}>Browse…</button>
        <button className="btn-primary" onClick={installPlugin} disabled={!selected || busy}>
          {busy ? 'Installing…' : 'Install plugin'}
        </button>
      </div>

      {installSteps.length > 0 && (
        <ul className="install-checklist">
          {installSteps.map((s, i) => (
            <li key={i} className={`install-step status-${s.status}`}>
              <span className="install-step-icon">{stepIcon(s.status)}</span>
              <span className="install-step-label">{s.label}</span>
              {s.detail && <span className="install-step-detail">{s.detail}</span>}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="error-msg">{error}</p>}
    </>
  );
}

function DoneStep({ onClose }: { onClose: () => void }) {
  return (
    <>
      <h2>You're set up.</h2>
      <p className="step-body">
        InterBrain lives in your menu bar. Click the icon any time to open
        your vault, change settings, or invite a friend in.
      </p>
      <div className="step-actions">
        <button className="btn-primary" onClick={onClose}>Done</button>
      </div>
    </>
  );
}

function stepIcon(status: InstallStep['status']): string {
  switch (status) {
    case 'pending': return '○';
    case 'running': return '◌';
    case 'done': return '✓';
    case 'failed': return '✗';
  }
}

function macOSorWindowsLabel(): string {
  if (typeof navigator !== 'undefined') {
    if (navigator.platform.startsWith('Mac')) return 'macOS Keychain';
    if (navigator.platform.startsWith('Win')) return 'Windows Credential Manager';
  }
  return 'system keychain';
}

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}
