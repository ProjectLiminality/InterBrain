# Settings Feature Slice

Thin orchestrator for plugin settings UI. Delegates to feature-owned settings sections.

## Purpose

Central configuration panel that aggregates feature-owned settings sections. Only manages global settings (AI Integration, Keyboard Shortcuts, Advanced). Feature-specific settings are owned by their respective feature slices.

## Architecture: Feature-Owned Settings

Each feature owns its settings UI through a `settings-section.ts` file:

```
Feature Slice              → Settings Section
─────────────────────────────────────────────
semantic-search            → createSemanticSearchSettingsSection()
realtime-transcription     → createTranscriptionSettingsSection()
web-link-analyzer          → createWebLinkAnalyzerSettingsSection()
social-resonance-filter    → createRadicleSettingsSection()
github-publishing          → createGitHubSettingsSection()
```

## Key Files

- **index.ts** - Barrel export for settings module
- **settings-tab.ts** - Thin orchestrator (InterBrainSettingTab)
  - Logo header and quick status overview grid (global)
  - AI Integration section (global - Claude API key)
  - Delegates to feature-owned sections
  - Keyboard shortcuts reference (global)
  - Advanced section (global - reset, diagnostics)
- **settings-status-service.ts** - Aggregator for feature status
  - Delegates status checking to feature-owned status functions
  - Only owns Claude API key validation (global setting)
  - Static helper methods for status icons/colors

## Main Exports

- `InterBrainSettings` (interface) - Settings schema with API keys and feature flags
- `DEFAULT_SETTINGS` - Default configuration values
- `InterBrainSettingTab` - Obsidian PluginSettingTab implementation
- `SettingsStatusService` - Aggregator for system status
- `SystemStatus` (interface) - Comprehensive status for all features
- `FeatureStatus` (interface) - Status schema for individual features

## Dependencies

- Obsidian Plugin API (App, PluginSettingTab, Setting)
- Feature-owned settings sections (imported from each feature)

## Notes

- **No fs imports** - All filesystem operations delegated to feature services
- Features own their status checking via `check*Status()` functions
- Features own their settings UI via `create*SettingsSection()` functions
- SettingsStatusService only aggregates - doesn't do direct checking
- Logo loading uses Obsidian's getResourcePath API
- Status overview grid provides click-to-scroll navigation
