/**
 * Tiny in-memory cache of plugin settings, for the few non-React, non-plugin
 * code paths that need to read user state without going through the plugin
 * instance (FeedbackModal, etc.).
 *
 * The plugin populates this on load via `setCachedSettings`. Daemon-owned
 * fields (API keys) flow through the desktop-bridge settings-sync and stay
 * in plugin.settings; this cache just makes them reachable from contexts
 * that don't have a plugin reference.
 */

interface CachedSettings {
	claudeApiKey: string;
}

let cached: CachedSettings | null = null;

export function setCachedSettings(s: CachedSettings): void {
	cached = s;
}

export function getCachedSettings(): CachedSettings | null {
	return cached;
}
