/**
 * InterBrain signaling mailbox.
 *
 * One Durable Object per peer-pair "room". Room ID is derived deterministically
 * from the two participants' DIDs by the clients (sha256 of sorted DIDs, hex).
 * The Worker never sees plaintext DIDs in the room ID.
 *
 * Endpoints:
 *   GET  /health
 *   POST /room/:id/blob          — append a signed signaling blob
 *   GET  /room/:id/blobs         — list/long-poll pending blobs (one-shot)
 *   GET  /room/:id/ws            — WebSocket subscribe (hibernating)
 *   POST /room/:id/clear         — drop blobs the caller has consumed
 *
 * Cloudflare never sees git data. Only SDP/ICE and similar handshake metadata.
 */

import type { DurableObjectState } from '@cloudflare/workers-types';

export interface Env {
  ROOM: DurableObjectNamespace;
}

const MAX_BLOB_BYTES = 64 * 1024;          // 64KB hard cap per blob
const MAX_BLOBS_PER_ROOM = 32;             // bounded per-room storage
const BLOB_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface SignalingBlob {
  /** Monotonic sequence number assigned by the room. */
  seq: number;
  /** Sender's DID (claim only — verification is the receiver's responsibility). */
  from: string;
  /** Wall-clock timestamp set by the room on receipt. */
  receivedAt: number;
  /** Caller-controlled expiry. */
  expiresAt: number;
  /** Opaque payload (SDP, ICE, etc.). Receiver verifies the signature. */
  data: string;
  /** Detached signature over `data`, base64. */
  sig: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response('ok', { status: 200 });
    }
    const match = url.pathname.match(/^\/room\/([a-f0-9]{64})(\/.*)?$/);
    if (!match) return new Response('not found', { status: 404 });
    const roomId = match[1];
    const id = env.ROOM.idFromName(roomId);
    const stub = env.ROOM.get(id);
    return stub.fetch(request);
  },
};

export class Room {
  private state: DurableObjectState;
  private sockets = new Set<WebSocket>();

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const action = url.pathname.split('/').pop();

    if (action === 'ws') {
      return this.handleWebSocket(request);
    }
    if (request.method === 'POST' && action === 'blob') {
      return this.handlePostBlob(request);
    }
    if (request.method === 'GET' && action === 'blobs') {
      return this.handleListBlobs();
    }
    if (request.method === 'POST' && action === 'clear') {
      return this.handleClear(request);
    }
    return new Response('not found', { status: 404 });
  }

  private async handlePostBlob(request: Request): Promise<Response> {
    const text = await request.text();
    if (text.length > MAX_BLOB_BYTES) {
      return json({ error: 'blob too large' }, 413);
    }
    let parsed: { from?: string; data?: string; sig?: string; expiresAt?: number };
    try {
      parsed = JSON.parse(text);
    } catch {
      return json({ error: 'invalid json' }, 400);
    }
    if (!parsed.from || !parsed.data || !parsed.sig) {
      return json({ error: 'from, data, sig required' }, 400);
    }
    const seq = ((await this.state.storage.get<number>('seq')) ?? 0) + 1;
    const blob: SignalingBlob = {
      seq,
      from: parsed.from,
      receivedAt: Date.now(),
      expiresAt: Math.min(parsed.expiresAt ?? Date.now() + BLOB_TTL_MS, Date.now() + BLOB_TTL_MS),
      data: parsed.data,
      sig: parsed.sig,
    };
    const blobs = (await this.state.storage.get<SignalingBlob[]>('blobs')) ?? [];
    blobs.push(blob);
    while (blobs.length > MAX_BLOBS_PER_ROOM) blobs.shift();
    await this.state.storage.put('blobs', blobs);
    await this.state.storage.put('seq', seq);
    await this.state.storage.setAlarm(Date.now() + BLOB_TTL_MS + 60_000);

    // Fan out to subscribed sockets.
    const frame = JSON.stringify({ kind: 'blob', blob });
    for (const ws of this.sockets) {
      try { ws.send(frame); } catch { /* ignore */ }
    }
    return json({ ok: true, seq });
  }

  private async handleListBlobs(): Promise<Response> {
    const blobs = (await this.state.storage.get<SignalingBlob[]>('blobs')) ?? [];
    const live = blobs.filter(b => b.expiresAt > Date.now());
    return json({ blobs: live });
  }

  private async handleClear(request: Request): Promise<Response> {
    let parsed: { upToSeq?: number };
    try { parsed = await request.json(); } catch { return json({ error: 'invalid json' }, 400); }
    const upTo = parsed.upToSeq ?? Number.MAX_SAFE_INTEGER;
    const blobs = (await this.state.storage.get<SignalingBlob[]>('blobs')) ?? [];
    const remaining = blobs.filter(b => b.seq > upTo);
    await this.state.storage.put('blobs', remaining);
    return json({ ok: true, remaining: remaining.length });
  }

  private handleWebSocket(request: Request): Response {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('websocket required', { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    this.sockets.add(server);
    // Replay any pending blobs.
    this.state.storage.get<SignalingBlob[]>('blobs').then(existing => {
      for (const blob of existing ?? []) {
        if (blob.expiresAt > Date.now()) {
          try { server.send(JSON.stringify({ kind: 'blob', blob })); } catch { /* ignore */ }
        }
      }
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  // Hibernation lifecycle — Cloudflare wakes us for any of these.
  async webSocketMessage(_ws: WebSocket, _msg: ArrayBuffer | string) {
    // Clients use HTTP POST to send blobs; the WS is one-way (server → client).
    // We accept and ignore inbound messages to keep the connection alive.
  }
  async webSocketClose(ws: WebSocket) { this.sockets.delete(ws); }
  async webSocketError(ws: WebSocket) { this.sockets.delete(ws); }

  async alarm() {
    const blobs = (await this.state.storage.get<SignalingBlob[]>('blobs')) ?? [];
    const live = blobs.filter(b => b.expiresAt > Date.now());
    if (live.length === 0) {
      await this.state.storage.deleteAll();
    } else {
      await this.state.storage.put('blobs', live);
      await this.state.storage.setAlarm(Date.now() + BLOB_TTL_MS + 60_000);
    }
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
