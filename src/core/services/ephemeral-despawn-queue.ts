/**
 * Ephemeral Despawn Queue
 *
 * Staggers ephemeral node unmounts so they don't all hit the main thread in one frame.
 * When multiple ephemeral-exit animations complete at roughly the same time, each
 * would call despawnEphemeralNode() → Zustand set() → React unmount. With 15+ nodes
 * finishing in the same frame, that blocks the main thread for 50-100ms.
 *
 * This queue collects despawn requests and drains them one-by-one with a configurable
 * interval between each, spreading unmount cost across multiple frames.
 */

import { useInterBrainStore } from '../store/interbrain-store';

/** Milliseconds to wait before starting to drain (lets animations settle) */
const DESPAWN_INITIAL_DELAY_MS = 500;

/** Milliseconds between individual despawn operations */
const DESPAWN_INTERVAL_MS = 40;

let queue: string[] = [];
let drainTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Enqueue a node for deferred despawning.
 * The node has already finished its exit animation and is off-screen.
 * The first enqueue starts a 500ms cooldown before any despawns begin,
 * giving spawn animations time to settle on the main thread.
 */
export function queueEphemeralDespawn(nodeId: string): void {
  queue.push(nodeId);
  // Start the initial delay if not already waiting/draining
  if (drainTimer === null) {
    drainTimer = globalThis.setTimeout(drainNext, DESPAWN_INITIAL_DELAY_MS);
  }
}

/**
 * Cancel a pending despawn for a node that's being reclaimed by a new layout.
 * Returns true if the node was found and removed from the queue.
 * This allows a node mid-despawn-wait to be reused without spawning a new one.
 */
export function cancelEphemeralDespawn(nodeId: string): boolean {
  const index = queue.indexOf(nodeId);
  if (index !== -1) {
    queue.splice(index, 1);
    return true;
  }
  return false;
}

/**
 * Flush all queued despawns immediately (e.g., when returning to constellation
 * and no animations are running). Use sparingly — this defeats the stagger purpose.
 */
export function flushDespawnQueue(): void {
  if (drainTimer !== null) {
    globalThis.clearTimeout(drainTimer);
    drainTimer = null;
  }
  const store = useInterBrainStore.getState();
  for (const nodeId of queue) {
    if (store.ephemeralNodes.has(nodeId)) {
      store.despawnEphemeralNode(nodeId);
    }
  }
  queue = [];
}

function drainNext(): void {
  if (queue.length === 0) {
    drainTimer = null;
    return;
  }

  const nodeId = queue.shift()!;
  const store = useInterBrainStore.getState();

  // Node may have been re-spawned or already cleaned up — skip if gone
  if (store.ephemeralNodes.has(nodeId)) {
    store.despawnEphemeralNode(nodeId);
  }

  // Schedule next drain
  if (queue.length > 0) {
    drainTimer = globalThis.setTimeout(drainNext, DESPAWN_INTERVAL_MS);
  } else {
    drainTimer = null;
  }
}
