/**
 * Bridge client — WebSocket connection from the Obsidian plugin to the
 * Tauri desktop daemon.
 *
 * Discovery: read the port from the daemon's config file. macOS:
 *   ~/Library/Application Support/org.projectliminality.interbrain/ipc-port
 * Linux:
 *   ~/.config/org.projectliminality.interbrain/ipc-port (or $XDG_CONFIG_HOME)
 * Windows:
 *   %APPDATA%/org.projectliminality.interbrain/ipc-port
 *
 * If the daemon is not running the bridge stays in `disconnected` state and
 * silently fails. Callers should check `isConnected()` before relying on it.
 */

import type {
  IpcMessage,
  OpMap,
  OpName,
  EventMap,
  EventName,
} from '../../shared/ipc-protocol';

const DAEMON_BUNDLE_ID = 'org.projectliminality.interbrain';
const RECONNECT_DELAY_MS = 5000;

type EventHandler<E extends EventName> = (payload: EventMap[E]) => void;

interface PendingRequest {
  resolve: (payload: unknown) => void;
  reject: (err: Error) => void;
}

export class BridgeClient {
  private ws: WebSocket | null = null;
  private port: number | null = null;
  private pending = new Map<string, PendingRequest>();
  private eventHandlers = new Map<string, Set<(payload: unknown) => void>>();
  private nextId = 1;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectingPromise: Promise<void> | null = null;

  /** True when a live WebSocket is open. */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /** Subscribe to connect events; fires every time the WS opens (initial + reconnects). */
  onConnected(handler: () => void): () => void {
    let set = this.connectHandlers;
    if (!set) {
      set = new Set();
      this.connectHandlers = set;
    }
    set.add(handler);
    if (this.isConnected()) {
      try { handler(); } catch (err) { console.error('connect handler', err); }
    }
    return () => { set!.delete(handler); };
  }

  private connectHandlers: Set<() => void> | null = null;
  private fireConnected() {
    if (!this.connectHandlers) return;
    for (const h of this.connectHandlers) {
      try { h(); } catch (err) { console.error('connect handler', err); }
    }
  }

  /** Attempt connection. Safe to call repeatedly; idempotent. */
  async connect(): Promise<void> {
    if (this.isConnected()) return;
    if (this.connectingPromise) return this.connectingPromise;
    this.connectingPromise = this.doConnect().finally(() => {
      this.connectingPromise = null;
    });
    return this.connectingPromise;
  }

  private async doConnect(): Promise<void> {
    try {
      const port = await this.discoverPort();
      if (port == null) {
        this.scheduleReconnect();
        return;
      }
      this.port = port;
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}`);
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error('connect timeout'));
        }, 3000);
        ws.addEventListener('open', () => {
          clearTimeout(timeout);
          this.ws = ws;
          this.attachHandlers(ws);
          this.fireConnected();
          resolve();
        });
        ws.addEventListener('error', err => {
          clearTimeout(timeout);
          reject(err instanceof Error ? err : new Error('ws error'));
        });
      });
    } catch {
      this.scheduleReconnect();
    }
  }

  private attachHandlers(ws: WebSocket) {
    ws.addEventListener('message', evt => this.handleMessage(evt.data));
    ws.addEventListener('close', () => {
      this.ws = null;
      this.scheduleReconnect();
    });
    ws.addEventListener('error', () => {
      this.ws = null;
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_DELAY_MS);
  }

  private handleMessage(raw: unknown) {
    if (typeof raw !== 'string') return;
    let msg: IpcMessage;
    try { msg = JSON.parse(raw) as IpcMessage; } catch { return; }
    if (msg.kind === 'response') {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if (msg.ok) pending.resolve(msg.payload);
      else pending.reject(new Error(`${msg.error.code}: ${msg.error.message}`));
    } else if (msg.kind === 'event') {
      const handlers = this.eventHandlers.get(msg.name);
      if (!handlers) return;
      for (const h of handlers) {
        try { h(msg.payload); } catch (err) {
          console.error('bridge event handler error', err);
        }
      }
    }
  }

  /** Send a typed request and await the response. */
  async request<O extends OpName>(op: O, payload: OpMap[O]['req']): Promise<OpMap[O]['res']> {
    if (!this.isConnected()) {
      await this.connect();
      if (!this.isConnected()) {
        throw new Error('daemon not reachable');
      }
    }
    const id = String(this.nextId++);
    return new Promise<OpMap[O]['res']>((resolve, reject) => {
      this.pending.set(id, {
        resolve: payload => resolve(payload as OpMap[O]['res']),
        reject,
      });
      this.ws!.send(JSON.stringify({ kind: 'request', id, op, payload }));
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`timeout: ${op}`));
      }, 30_000);
    });
  }

  onEvent<E extends EventName>(name: E, handler: EventHandler<E>): () => void {
    let set = this.eventHandlers.get(name);
    if (!set) {
      set = new Set();
      this.eventHandlers.set(name, set);
    }
    set.add(handler as (p: unknown) => void);
    return () => { set!.delete(handler as (p: unknown) => void); };
  }

  /**
   * Discover the daemon's IPC port. Uses Node `fs` directly because Obsidian
   * plugins run inside Electron which has full filesystem access.
   */
  private async discoverPort(): Promise<number | null> {
    const fs = require('fs');
    const path = require('path');
    const home = process.env.HOME || process.env.USERPROFILE;
    if (!home) return null;
    let configDir: string;
    if (process.platform === 'darwin') {
      configDir = path.join(home, 'Library/Application Support', DAEMON_BUNDLE_ID);
    } else if (process.platform === 'win32') {
      const appdata = process.env.APPDATA || path.join(home, 'AppData/Roaming');
      configDir = path.join(appdata, DAEMON_BUNDLE_ID);
    } else {
      const xdg = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
      configDir = path.join(xdg, DAEMON_BUNDLE_ID);
    }
    const portFile = path.join(configDir, 'ipc-port');
    if (!fs.existsSync(portFile)) return null;
    try {
      const text = fs.readFileSync(portFile, 'utf-8').trim();
      const port = parseInt(text, 10);
      if (Number.isNaN(port) || port < 1024 || port > 65535) return null;
      return port;
    } catch {
      return null;
    }
  }
}

let _instance: BridgeClient | null = null;

export function getBridge(): BridgeClient {
  if (!_instance) _instance = new BridgeClient();
  return _instance;
}
