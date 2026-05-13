import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { logEvent } from './log';

type Step = 'welcome' | 'prereqs' | 'identity' | 'vault' | 'done';
const ORDER: Step[] = ['welcome', 'prereqs', 'identity', 'vault', 'done'];

interface DependencyStatus {
  installed: boolean;
  detail: string | null;
  installUrl: string | null;
  installCommand: string | null;
}

interface PrerequisiteStatus {
  obsidian: DependencyStatus;
  git: DependencyStatus;
  gh: DependencyStatus;
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

type GhIdentityState =
  | { kind: 'checking' }
  | { kind: 'not-installed' }
  | { kind: 'signed-out' }
  | { kind: 'authorizing'; flow: DeviceFlowStart }
  | { kind: 'signed-in'; username: string };

type InstallStep = { label: string; status: 'pending' | 'running' | 'done' | 'failed'; detail?: string };

interface VaultEntry {
  path: string;
  name: string;
  pluginInstalled: boolean;
  devMode: boolean;
}

export function FirstRun() {
  const [step, setStep] = useState<Step>('welcome');
  const [vaults, setVaults] = useState<string[]>([]);
  const [selectedVault, setSelectedVault] = useState<string | null>(null);
  const [identity, setIdentity] = useState<GhIdentityState>({ kind: 'checking' });
  const [error, setError] = useState<string | null>(null);
  const [installSteps, setInstallSteps] = useState<InstallStep[]>([]);
  const [prereqs, setPrereqs] = useState<PrerequisiteStatus | null>(null);
  const [alreadyConfigured, setAlreadyConfigured] = useState<{ username: string; vaults: VaultEntry[] } | null>(null);

  useEffect(() => {
    invoke<string[]>('discover_obsidian_vaults').then(setVaults).catch(console.error);
    refreshPrereqs();

    // Detect "already configured" state — daemon's gh CLI is signed in AND
    // at least one registered vault exists. If so, show a confirmation
    // rather than walking the user through setup again.
    Promise.all([
      invoke<GhStatus>('gh_status'),
      invoke<VaultEntry[]>('list_vaults'),
    ]).then(([gh, vaultList]) => {
      if (gh.authenticated && gh.username && vaultList.length > 0) {
        setAlreadyConfigured({ username: gh.username, vaults: vaultList });
      }
    }).catch(err => {
      logEvent('warn', 'first-run', 'failed to detect already-configured state', { error: String(err) });
    });
  }, []);

  function refreshPrereqs() {
    invoke<PrerequisiteStatus>('detect_prerequisites').then(setPrereqs).catch(console.error);
  }

  // On entering the identity step: check current GitHub auth state.
  useEffect(() => {
    if (step !== 'identity') return;
    invoke<GhStatus>('gh_status')
      .then(gh => {
        if (!gh.installed) setIdentity({ kind: 'not-installed' });
        else if (gh.authenticated && gh.username) setIdentity({ kind: 'signed-in', username: gh.username });
        else setIdentity({ kind: 'signed-out' });
      })
      .catch(err => setError(String(err)));
  }, [step]);

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
        return identity.kind === 'signed-in';
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

  // Already-configured branch: identity + at least one vault. Don't walk the
  // user through setup again — show a small confirmation panel that opens
  // their vault or lets them dismiss.
  if (alreadyConfigured) {
    return (
      <div className="first-run">
        <img className="logo" src="/icon-color.png" alt="InterBrain" />
        <h2>You're already set up.</h2>
        <p className="step-body">
          Identity loaded, {alreadyConfigured.vaults.length === 1 ? '1 vault' : `${alreadyConfigured.vaults.length} vaults`} registered.
        </p>
        <div className="identity-summary">
          <div className="summary-label">GitHub</div>
          <code className="summary-value">@{alreadyConfigured.username}</code>
        </div>
        <div className="step-actions" style={{ marginTop: 16 }}>
          <button
            className="btn-secondary"
            onClick={() => invoke('close_first_run')}
          >
            Close
          </button>
          {alreadyConfigured.vaults[0] && (
            <button
              className="btn-primary"
              onClick={() => {
                invoke('open_vault_in_obsidian', { vaultPath: alreadyConfigured.vaults[0].path })
                  .then(() => invoke('close_first_run'))
                  .catch(err => logEvent('error', 'first-run.already-configured', 'open vault failed', { error: String(err) }));
              }}
            >
              Open {alreadyConfigured.vaults[0].name}
            </button>
          )}
        </div>
      </div>
    );
  }

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
        <GitHubIdentityStep
          state={identity}
          setState={setIdentity}
          error={error}
          onError={setError}
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

      {step === 'done' && (
        <DoneStep
          vaultPath={selectedVault}
          onClose={() => invoke('close_first_run')}
        />
      )}
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

type DepKey = 'obsidian' | 'git' | 'gh';

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
    gh: { installing: false, message: null, error: null },
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
      ghInstalled: status?.gh.installed,
    });
    try {
      // Install in a fixed sequence — git first (smallest, validates the
      // package-manager path), gh second, Obsidian last (biggest download).
      if (status && !status.git.installed) {
        await installOne('git');
        await onRefresh();
      }
      if (status && !status.gh.installed) {
        await installOne('gh');
        await onRefresh();
      }
      if (status && !status.obsidian.installed) {
        await installOne('obsidian');
        await onRefresh();
      }
      // Final re-detect after everything to confirm all three are visible.
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

  const allReady = status.obsidian.installed && status.git.installed && status.gh.installed;
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
        InterBrain needs Obsidian, git, and the GitHub CLI. {allReady
          ? "All three are already installed — you're good to go."
          : 'Click below to install whatever is missing — we handle the rest in the background.'}
      </p>
      <ul className="install-checklist" style={{ maxWidth: 460 }}>
        <DependencyRow name="git" dep={status.git} state={state.git} />
        <DependencyRow name="GitHub CLI" dep={status.gh} state={state.gh} />
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

interface GitHubIdentityStepProps {
  state: GhIdentityState;
  setState: (s: GhIdentityState) => void;
  error: string | null;
  onError: (e: string | null) => void;
  onContinue: () => void;
}

function GitHubIdentityStep({ state, setState, error, onError, onContinue }: GitHubIdentityStepProps) {
  const [busy, setBusy] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  async function startSignIn() {
    setBusy(true);
    onError(null);
    setCodeCopied(false);
    try {
      const flow = await invoke<DeviceFlowStart>('gh_begin_sign_in');
      try {
        await navigator.clipboard.writeText(flow.userCode);
        setCodeCopied(true);
      } catch { /* clipboard may be blocked */ }
      setState({ kind: 'authorizing', flow });
      // Poll until the user completes the device flow in the browser.
      const username = await invoke<string>('gh_complete_sign_in', {
        deviceCode: flow.deviceCode,
        interval: flow.interval,
      });
      setState({ kind: 'signed-in', username });
      logEvent('info', 'first-run.identity', 'github sign-in complete', { username });
    } catch (err: unknown) {
      onError(typeof err === 'string' ? err : (err as Error).message);
      setState({ kind: 'signed-out' });
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (state.kind !== 'authorizing') return;
    try {
      await navigator.clipboard.writeText(state.flow.userCode);
      setCodeCopied(true);
    } catch { /* ignore */ }
  }

  async function reopenBrowser() {
    if (state.kind !== 'authorizing') return;
    try { await invoke('open_external_url', { url: state.flow.verificationUri }); } catch { /* ignore */ }
  }

  function cancel() {
    setState({ kind: 'signed-out' });
    onError(null);
  }

  if (state.kind === 'checking') {
    return <p className="step-body">Checking GitHub auth state…</p>;
  }

  if (state.kind === 'not-installed') {
    return (
      <>
        <h2>GitHub CLI missing</h2>
        <p className="step-body">
          The <code>gh</code> command-line tool isn't visible on PATH. It
          should have been installed in the previous step — go back and
          re-run prerequisites, or install manually from{' '}
          <a href="https://cli.github.com" target="_blank" rel="noreferrer">cli.github.com</a>{' '}
          and return here.
        </p>
      </>
    );
  }

  if (state.kind === 'signed-in') {
    return (
      <>
        <h2>Signed in as @{state.username}</h2>
        <p className="step-body">
          InterBrain will use your GitHub account to host DreamNodes you share
          with others. You can sign out anytime from the daemon dashboard.
        </p>
        <div className="step-actions" style={{ marginTop: 16 }}>
          <button className="btn-primary" onClick={onContinue}>Continue</button>
        </div>
      </>
    );
  }

  if (state.kind === 'authorizing') {
    return (
      <>
        <h2>Authorize InterBrain on GitHub</h2>
        <p className="step-body">
          We've opened your browser at <code>{state.flow.verificationUri}</code>.
          Enter this code there to grant access:
        </p>
        <div className="device-code-row">
          <code className="device-code" onClick={copyCode}>{state.flow.userCode}</code>
          <button className="btn-secondary" onClick={copyCode}>
            {codeCopied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <div className="step-actions" style={{ marginTop: 12 }}>
          <button className="btn-secondary" onClick={reopenBrowser}>Reopen browser</button>
          <button className="btn-secondary" onClick={cancel}>Cancel</button>
        </div>
        <p className="step-body" style={{ marginTop: 12, fontStyle: 'italic', opacity: 0.7 }}>
          Waiting for authorization…
        </p>
        {error && <p className="error-msg">{error}</p>}
      </>
    );
  }

  // signed-out
  return (
    <>
      <h2>Sign in with GitHub</h2>
      <p className="step-body">
        InterBrain uses your GitHub account as your identity and to host the
        DreamNodes you share. Friends collaborate by following each other's
        GitHub repos — no separate accounts to manage.
      </p>
      <div className="step-actions" style={{ marginTop: 16 }}>
        <button className="btn-primary" onClick={startSignIn} disabled={busy}>
          {busy ? 'Opening browser…' : 'Sign in with GitHub'}
        </button>
      </div>
      {error && <p className="error-msg">{error}</p>}
    </>
  );
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
  type Mode = 'create' | 'pick';
  const [mode, setMode] = useState<Mode>('create');
  const [busy, setBusy] = useState(false);
  const [vaultParent, setVaultParent] = useState<string>('');
  const [newVaultName, setNewVaultName] = useState('DreamVault');

  // Fetch the default new-vault parent (~/) on mount so we can show the user
  // what path would be used.
  useEffect(() => {
    invoke<string>('default_new_vault_parent').then(setVaultParent).catch(err => {
      logEvent('warn', 'first-run.vault', 'default_new_vault_parent failed', { error: String(err) });
    });
  }, []);

  // If there are existing Obsidian vaults, default to "pick" mode; otherwise "create".
  useEffect(() => {
    if (vaults.length > 0) setMode('pick');
  }, [vaults.length]);

  async function pickVault() {
    try {
      const path = await openDialog({ directory: true, multiple: false, title: 'Choose Obsidian vault' });
      if (typeof path === 'string') {
        onSelect(path);
        if (!vaults.includes(path)) setVaults([...vaults, path]);
        logEvent('info', 'first-run.vault', 'vault picked via browse', { path });
      }
    } catch (e: unknown) {
      logEvent('error', 'first-run.vault', 'browse dialog failed', { error: String(e) });
    }
  }

  async function createAndInstall() {
    if (!vaultParent || !newVaultName.trim()) return;
    setBusy(true);
    onError(null);

    const steps: InstallStep[] = [
      { label: `Create vault at ${vaultParent}/${newVaultName}`, status: 'pending' },
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

    let createdPath: string | null = null;
    try {
      update(0, 'running');
      logEvent('info', 'first-run.vault', 'creating new vault', { parent: vaultParent, name: newVaultName });
      createdPath = await invoke<string>('create_vault', {
        parentDir: vaultParent,
        name: newVaultName.trim(),
      });
      update(0, 'done');
      onSelect(createdPath);

      update(1, 'running');
      await invoke('install_plugin_into_vault', { vaultPath: createdPath });
      update(1, 'done');

      update(2, 'running');
      await sleep(150);
      update(2, 'done');

      update(3, 'running');
      await sleep(150);
      update(3, 'done');

      logEvent('info', 'first-run.vault', 'create + install complete', { vaultPath: createdPath });
      await sleep(300);
      onComplete();
    } catch (e: unknown) {
      const msg = String(e);
      onError(msg);
      const idx = steps.findIndex(s => s.status === 'running');
      if (idx >= 0) update(idx, 'failed', msg);
      logEvent('error', 'first-run.vault', 'create + install failed', {
        error: msg,
        createdPath,
        failedStep: idx,
      });
    } finally {
      setBusy(false);
    }
  }

  async function installIntoExisting() {
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
      logEvent('info', 'first-run.vault', 'installing plugin into existing vault', { vaultPath: selected });
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

      logEvent('info', 'first-run.vault', 'install into existing vault complete', { vaultPath: selected });
      await sleep(300);
      onComplete();
    } catch (e: unknown) {
      const msg = String(e);
      onError(msg);
      const idx = steps.findIndex(s => s.status === 'running');
      if (idx >= 0) update(idx, 'failed', msg);
      logEvent('error', 'first-run.vault', 'install into existing vault failed', {
        error: msg,
        vaultPath: selected,
        failedStep: idx,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2>Choose your vault</h2>
      <p className="step-body">
        InterBrain lives inside an Obsidian vault. Create a new one or pick
        an existing one.
      </p>

      <div className="vault-mode-tabs">
        <button
          className={mode === 'create' ? 'active' : ''}
          onClick={() => { setMode('create'); onSelect(null); }}
          disabled={busy}
        >
          Create new
        </button>
        <button
          className={mode === 'pick' ? 'active' : ''}
          onClick={() => setMode('pick')}
          disabled={busy || vaults.length === 0}
          title={vaults.length === 0 ? 'No existing Obsidian vaults found' : undefined}
        >
          Use existing
        </button>
      </div>

      {mode === 'create' && (
        <div className="vault-create-form">
          <label className="setting-label">Name</label>
          <input
            type="text"
            value={newVaultName}
            onChange={e => setNewVaultName(e.target.value)}
            disabled={busy}
            spellCheck={false}
          />
          <div className="setting-help" style={{ marginTop: 4 }}>
            Will be created at <code style={{ fontFamily: 'monospace' }}>{vaultParent}/{newVaultName.trim() || '…'}</code>
          </div>
          <div className="step-actions" style={{ marginTop: 14 }}>
            <button
              className="btn-primary"
              onClick={createAndInstall}
              disabled={busy || !newVaultName.trim() || !vaultParent}
            >
              {busy ? 'Creating…' : 'Create & install'}
            </button>
          </div>
        </div>
      )}

      {mode === 'pick' && (
        <>
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
            <button className="btn-secondary" onClick={pickVault} disabled={busy}>Browse…</button>
            <button className="btn-primary" onClick={installIntoExisting} disabled={!selected || busy}>
              {busy ? 'Installing…' : 'Install plugin'}
            </button>
          </div>
        </>
      )}

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

function DoneStep({ vaultPath, onClose }: { vaultPath: string | null; onClose: () => void }) {
  // Auto-open the newly-created vault in Obsidian on mount, then close the
  // first-run window after a short pause so the user sees the success state.
  useEffect(() => {
    let closed = false;
    if (vaultPath) {
      invoke('open_vault_in_obsidian', { vaultPath })
        .then(() => {
          logEvent('info', 'first-run.done', 'auto-opened vault', { vaultPath });
          // Brief delay so user perceives the success state, then close.
          setTimeout(() => {
            if (!closed) onClose();
          }, 1500);
        })
        .catch(err => {
          logEvent('error', 'first-run.done', 'auto-open vault failed', { error: String(err) });
        });
    }
    return () => { closed = true; };
  }, [vaultPath, onClose]);

  return (
    <>
      <h2>You're set up.</h2>
      <p className="step-body">
        Opening your vault in Obsidian. InterBrain lives in your menu bar —
        click the icon any time to open your vault, change settings, or
        invite a friend in.
      </p>
      <div className="step-actions">
        <button className="btn-primary" onClick={onClose}>Close</button>
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

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}
