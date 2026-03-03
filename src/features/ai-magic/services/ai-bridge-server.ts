/**
 * AI Bridge WebSocket Server
 *
 * Exposes the InterBrain's AI inference service over a local WebSocket,
 * allowing external UIs (like the AURYN chatbot on mobile) to use the
 * same LLM provider configuration without needing API keys.
 *
 * Protocol mirrors the iframe postMessage AI bridge exactly:
 *
 * Client → Server (JSON):
 *   { type: "ai-inference-stream-request", requestId, messages, complexity?, options? }
 *   { type: "ai-inference-stream-cancel", requestId }
 *   { type: "ai-bridge-probe" }
 *
 * Server → Client (JSON):
 *   { type: "ai-bridge-ready", version: "2" }
 *   { type: "ai-inference-stream-chunk", requestId, chunk }
 *   { type: "ai-inference-stream-done", requestId, provider, model, usage }
 *   { type: "ai-inference-stream-error", requestId, error, partialContent? }
 */

import { generateStreamAI } from './inference-service';
import type { AIMessage, TaskComplexity } from '../types';
import type { StreamInferenceOptions } from './inference-service';

// Node.js modules available in Obsidian's Electron context
const http = require('http') as typeof import('http');
const crypto = require('crypto') as typeof import('crypto');

const AI_BRIDGE_PORT = 27182; // e (Euler's number) — easy to remember, unlikely to conflict

interface ActiveStream {
	abortController: AbortController;
}

let server: ReturnType<typeof http.createServer> | null = null;
let activeStreams = new Map<string, ActiveStream>();
// Track connected WebSocket fds for cleanup
let connectedSockets = new Set<ReturnType<typeof require>>();

/**
 * Minimal WebSocket frame handling (no dependencies)
 *
 * We implement just enough of RFC 6455 to handle JSON text frames,
 * since we're in Electron and can't easily import 'ws'.
 */

function acceptWebSocket(req: any, socket: any): void {
	const key = req.headers['sec-websocket-key'];
	if (!key) {
		socket.destroy();
		return;
	}

	const acceptKey = crypto
		.createHash('sha1')
		.update(key + '258EAFA5-E914-47DA-95CA-5AB5DC63B175')
		.digest('base64');

	socket.write(
		'HTTP/1.1 101 Switching Protocols\r\n' +
		'Upgrade: websocket\r\n' +
		'Connection: Upgrade\r\n' +
		`Sec-WebSocket-Accept: ${acceptKey}\r\n` +
		'\r\n'
	);

	connectedSockets.add(socket);

	// Send ai-bridge-ready immediately
	sendWSFrame(socket, JSON.stringify({
		type: 'ai-bridge-ready',
		version: '2'
	}));

	let buffer = Buffer.alloc(0);

	socket.on('data', (data: Buffer) => {
		buffer = Buffer.concat([buffer, data]);

		while (buffer.length >= 2) {
			const frame = parseWSFrame(buffer);
			if (!frame) break; // incomplete frame

			buffer = buffer.slice(frame.totalLength);

			if (frame.opcode === 0x8) {
				// Close frame
				socket.end();
				return;
			}

			if (frame.opcode === 0x9) {
				// Ping — send pong
				sendWSFrame(socket, frame.payload, 0xA);
				continue;
			}

			if (frame.opcode === 0x1) {
				// Text frame
				handleMessage(socket, frame.payload.toString('utf8'));
			}
		}
	});

	socket.on('close', () => {
		connectedSockets.delete(socket);
		// Abort any active streams for this socket
		// (we'd need per-socket tracking for this, but for now active streams
		// are keyed by requestId which is sufficient for cancellation)
	});

	socket.on('error', () => {
		connectedSockets.delete(socket);
	});
}

interface WSFrame {
	opcode: number;
	payload: Buffer;
	totalLength: number;
}

function parseWSFrame(buf: Buffer): WSFrame | null {
	if (buf.length < 2) return null;

	const firstByte = buf[0];
	const secondByte = buf[1];
	const opcode = firstByte & 0x0F;
	const masked = (secondByte & 0x80) !== 0;
	let payloadLength = secondByte & 0x7F;
	let offset = 2;

	if (payloadLength === 126) {
		if (buf.length < 4) return null;
		payloadLength = buf.readUInt16BE(2);
		offset = 4;
	} else if (payloadLength === 127) {
		if (buf.length < 10) return null;
		// For our use case, payload will never exceed 32-bit size
		payloadLength = buf.readUInt32BE(6);
		offset = 10;
	}

	if (masked) {
		if (buf.length < offset + 4 + payloadLength) return null;
		const maskKey = buf.slice(offset, offset + 4);
		offset += 4;
		const payload = buf.slice(offset, offset + payloadLength);
		for (let i = 0; i < payload.length; i++) {
			payload[i] ^= maskKey[i % 4];
		}
		return { opcode, payload, totalLength: offset + payloadLength };
	} else {
		if (buf.length < offset + payloadLength) return null;
		const payload = buf.slice(offset, offset + payloadLength);
		return { opcode, payload, totalLength: offset + payloadLength };
	}
}

function sendWSFrame(socket: any, data: string | Buffer, opcode = 0x1): void {
	try {
		if (socket.destroyed) return;

		const payload = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
		const len = payload.length;
		let header: Buffer;

		if (len < 126) {
			header = Buffer.alloc(2);
			header[0] = 0x80 | opcode; // FIN + opcode
			header[1] = len;
		} else if (len < 65536) {
			header = Buffer.alloc(4);
			header[0] = 0x80 | opcode;
			header[1] = 126;
			header.writeUInt16BE(len, 2);
		} else {
			header = Buffer.alloc(10);
			header[0] = 0x80 | opcode;
			header[1] = 127;
			header.writeUInt32BE(0, 2);
			header.writeUInt32BE(len, 6);
		}

		socket.write(Buffer.concat([header, payload]));
	} catch {
		// Socket may have been destroyed
	}
}

function sendJSON(socket: any, obj: Record<string, any>): void {
	sendWSFrame(socket, JSON.stringify(obj));
}

async function handleMessage(socket: any, raw: string): Promise<void> {
	let data: any;
	try {
		data = JSON.parse(raw);
	} catch {
		return;
	}

	if (data.type === 'ai-bridge-probe') {
		sendJSON(socket, { type: 'ai-bridge-ready', version: '2' });
		return;
	}

	if (data.type === 'ai-inference-stream-request') {
		const { requestId, messages, complexity, options } = data;
		const abortController = new AbortController();
		activeStreams.set(requestId, { abortController });
		let partialContent = '';

		try {
			const result = await generateStreamAI(
				messages as AIMessage[],
				(chunk: string) => {
					partialContent += chunk;
					sendJSON(socket, {
						type: 'ai-inference-stream-chunk',
						requestId,
						chunk,
					});
				},
				(complexity || 'standard') as TaskComplexity,
				{ ...options, signal: abortController.signal } as StreamInferenceOptions
			);

			sendJSON(socket, {
				type: 'ai-inference-stream-done',
				requestId,
				provider: result.provider,
				model: result.model,
				usage: result.usage,
			});
		} catch (err: any) {
			if (err?.name !== 'AbortError') {
				sendJSON(socket, {
					type: 'ai-inference-stream-error',
					requestId,
					error: err?.message || String(err),
					partialContent: partialContent || undefined,
				});
			}
		} finally {
			activeStreams.delete(requestId);
		}
		return;
	}

	if (data.type === 'ai-inference-stream-cancel') {
		const stream = activeStreams.get(data.requestId);
		if (stream) {
			stream.abortController.abort();
			activeStreams.delete(data.requestId);
		}
		return;
	}
}

/**
 * Start the AI Bridge WebSocket server.
 * Called during plugin bootstrap, after initializeInferenceService.
 */
export function startAIBridgeServer(): Promise<number> {
	return new Promise((resolve, reject) => {
		if (server) {
			resolve(AI_BRIDGE_PORT);
			return;
		}

		server = http.createServer((_req, res) => {
			// Simple health check for non-WebSocket requests
			res.writeHead(200, {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*',
			});
			res.end(JSON.stringify({ status: 'ok', service: 'ai-bridge' }));
		});

		server.on('upgrade', (req: any, socket: any, _head: any) => {
			acceptWebSocket(req, socket);
		});

		server.on('error', (err: any) => {
			if (err.code === 'EADDRINUSE') {
				console.warn(`[AI Bridge] Port ${AI_BRIDGE_PORT} in use, trying ${AI_BRIDGE_PORT + 1}`);
				server?.close();
				server = http.createServer();
				server!.on('upgrade', (req: any, socket: any) => {
					acceptWebSocket(req, socket);
				});
				server!.listen(AI_BRIDGE_PORT + 1, '0.0.0.0', () => {
					console.log(`[AI Bridge] WebSocket server listening on port ${AI_BRIDGE_PORT + 1}`);
					resolve(AI_BRIDGE_PORT + 1);
				});
			} else {
				console.error('[AI Bridge] Server error:', err);
				reject(err);
			}
		});

		server.listen(AI_BRIDGE_PORT, '0.0.0.0', () => {
			console.log(`[AI Bridge] WebSocket server listening on port ${AI_BRIDGE_PORT}`);
			resolve(AI_BRIDGE_PORT);
		});
	});
}

/**
 * Stop the AI Bridge WebSocket server.
 * Called during plugin unload.
 */
export function stopAIBridgeServer(): Promise<void> {
	return new Promise((resolve) => {
		// Abort all active streams
		for (const [, stream] of activeStreams) {
			stream.abortController.abort();
		}
		activeStreams.clear();

		// Close all connected sockets
		for (const socket of connectedSockets) {
			try { socket.destroy(); } catch (_e) { /* ignore cleanup errors */ }
		}
		connectedSockets.clear();

		if (server) {
			server.close(() => {
				console.log('[AI Bridge] WebSocket server stopped');
				server = null;
				resolve();
			});
		} else {
			resolve();
		}
	});
}
