/**
 * helper-path-sync — prepend the daemon's binary directory to
 * `process.env.PATH` so any plugin-invoked git command can find the
 * `git-remote-interbrain` helper.
 *
 * The plugin runs many `git fetch` / `git submodule update --init` calls
 * via Node's `child_process`, which inherits `process.env.PATH` by default.
 * The helper is installed alongside the daemon binary (Mac:
 * `/Applications/InterBrain.app/Contents/MacOS/`, Windows:
 * `%LOCALAPPDATA%\InterBrain\`, Linux: `/opt/InterBrain/`). The daemon
 * advertises this directory in its `hello` handshake.
 *
 * Without this, any URL of the form `interbrain://<uuid>` fails with
 * "fatal: Unable to find remote helper for 'interbrain'".
 *
 * Idempotent — repeated calls do not double-prepend.
 */
import { getBridge } from './bridge-client';

/** Prepend the daemon's helper dir to PATH once it's known. Returns teardown. */
export function startHelperPathSync(): () => void {
  const bridge = getBridge();
  let applied: string | null = null;

  const apply = () => {
    const dir = bridge.helperDir();
    if (!dir || dir === applied) return;
    const proc = (globalThis as { process?: { env: Record<string, string | undefined>; platform: string } }).process;
    if (!proc) return;
    const sep = proc.platform === 'win32' ? ';' : ':';
    const current = proc.env.PATH ?? '';
    if (current.split(sep).includes(dir)) {
      applied = dir;
      return;
    }
    proc.env.PATH = current ? `${dir}${sep}${current}` : dir;
    applied = dir;
    console.log(`[helper-path-sync] prepended ${dir} to PATH`);
  };

  // Fire once now in case bridge has already connected, and again on every
  // reconnect (helperDir may not be populated until the first hello round-trip).
  apply();
  const off = bridge.onConnected(() => { apply(); });
  return off;
}
