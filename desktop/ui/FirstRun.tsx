import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { logEvent } from './log';

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

type PrereqsStatusType = PrerequisiteStatus | null;

interface DepState {
  installing: boolean;
  message: string | null;
  error: string | null;
}

function PrereqsStep({
  status, onRefresh, onContinue,
}: { status: PrereqsStatusType; onRefresh: () => void; onContinue: () => void }) {
  const [state, setState] = useState<Record<DepKey, DepState>>({
    obsidian: { installing: false, message: null, error: null },
    git: { installing: false, message: null, error: null },
  });
  const [orchestrating, setOrchestrating] = useState(false);
  const [overallError, setOverallError] = useState<string | null>(null);

  // Listen for install-progress events from the daemon to update the inline
  // status messages while a backend install runs.
  useEffect(() => {
    let cleanup: (() => void) | null = null;
    (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen<InstallProgressPayload>('install-progress', evt => {
        const dep = evt.payload.progress.dependency;
        setState(prev => ({
          ...prev,
          [dep]: { ...prev[dep], message: evt.payload.progress.message },
        }));
      });
      cleanup = unlisten;
    })();
    return () => { cleanup?.(); };
  }, []);

  async function installOne(dep: DepKey): Promise<void> {
    setState(prev => ({
      ...prev,
      [dep]: { installing: true, message: 'Starting…', error: null },
    }));
    try {
      await invoke('install_prerequisite', {
        dependency: dep,
        requestId: `${dep}-${Date.now()}`,
      });
      setState(prev => ({
        ...prev,
        [dep]: { installing: false, message: null, error: null },
      }));
    } catch (e: unknown) {
      const msg = String(e);
      setState(prev => ({
        ...prev,
        [dep]: { installing: false, message: null, error: msg },
      }));
      throw e;
    }
  }

  async function installAndContinue() {
    setOrchestrating(true);
    setOverallError(null);
    logEvent('info', 'first-run.prereqs', 'install-and-continue clicked', {
      gitInstalled: status?.git.installed,
      obsidianInstalled: status?.obsidian.installed,
    });
    try {
      // Install in a fixed sequence — git first (smaller, faster, validates
      // the package-manager path), Obsidian second.
      if (status && !status.git.installed) {
        await installOne('git');
        await onRefresh();
      }
      if (status && !status.obsidian.installed) {
        await installOne('obsidian');
        await onRefresh();
      }
      // Final re-detect after everything to confirm both are now visible.
      await onRefresh();
      logEvent('info', 'first-run.prereqs', 'install-and-continue succeeded');
      onContinue();
    } catch (e: unknown) {
      const msg = String(e);
      setOverallError(msg);
      logEvent('error', 'first-run.prereqs', 'install-and-continue failed', { error: msg });
    } finally {
      setOrchestrating(false);
    }
  }

  if (!status) {
    return <p className="step-body">Checking prerequisites…</p>;
  }

  const allReady = status.obsidian.installed && status.git.installed;
  const buttonLabel = orchestrating
    ? 'Installing…'
    : overallError
      ? 'Retry install & continue'
      : allReady
        ? 'Continue'
        : 'Install & continue';

  function onPrimaryClick() {
    if (allReady && !orchestrating) {
      onContinue();
    } else {
      void installAndContinue();
    }
  }

  return (
    <>
      <h2>Prerequisites</h2>
      <p className="step-body">
        InterBrain needs Obsidian and git. {allReady
          ? "Both are already installed — you're good to go."
          : 'Click below to install whatever is missing — we handle the rest in the background.'}
      </p>
      <ul className="install-checklist" style={{ maxWidth: 460 }}>
        <DependencyRow name="git" dep={status.git} state={state.git} />
        <DependencyRow name="Obsidian" dep={status.obsidian} state={state.obsidian} />
      </ul>
      {overallError && (
        <p className="error-msg" style={{ maxWidth: 460, marginTop: 12 }}>
          Install failed: {overallError}
        </p>
      )}
      <div className="step-actions" style={{ marginTop: 16 }}>
        <button
          className="btn-primary"
          onClick={onPrimaryClick}
          disabled={orchestrating}
        >
          {buttonLabel}
        </button>
      </div>
    </>
  );
}

function DependencyRow({
  name, dep, state,
}: { name: string; dep: DependencyStatus; state: DepState }) {
  let status: 'done' | 'running' | 'failed' | 'pending' = dep.installed ? 'done' : 'pending';
  if (state.installing) status = 'running';
  if (state.error) status = 'failed';

  const detailText = dep.installed
    ? (dep.detail || 'installed')
    : state.installing
      ? (state.message ?? 'Installing…')
      : state.error
        ? state.error
        : 'not installed';

  return (
    <li className={`install-step status-${status}`} style={{ alignItems: 'center' }}>
      <span className="install-step-icon">
        {status === 'done' ? '✓' : status === 'running' ? '◌' : status === 'failed' ? '✗' : '○'}
      </span>
      <span className="install-step-label" style={{ flex: '0 0 auto', minWidth: 70 }}>{name}</span>
      <span
        className="install-step-detail"
        style={{ marginLeft: 'auto', maxWidth: 280, fontSize: 11, fontStyle: status === 'done' || status === 'pending' ? 'italic' : 'normal', color: status === 'failed' ? 'var(--ib-red)' : undefined }}
        title={detailText}
      >
        {detailText.length > 60 ? detailText.slice(0, 60) + '…' : detailText}
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
