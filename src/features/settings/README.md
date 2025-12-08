# Settings Feature Slice

Provides plugin settings UI with comprehensive system status checking for all InterBrain features.

## Purpose

Central configuration panel for managing API keys, feature toggles, and system dependencies. Includes real-time status monitoring for semantic search, transcription, web link analysis, Radicle network, GitHub, and Claude API.

## Key Files

- **index.ts** - Barrel export for settings module
- **settings-tab.ts** - Main settings UI (InterBrainSettingTab) with sections for each feature
  - Logo header and quick status overview grid
  - AI Integration (Claude API key)
  - Semantic Search (Ollama status, diagnostics, reindexing)
  - Transcription (Python/Whisper setup, enable/disable toggle)
  - Web Link Analyzer (Python/anthropic setup, requires Claude API)
  - Radicle Network (identity, passphrase, node control)
  - GitHub Sharing (fallback detection)
  - Keyboard shortcuts reference
  - Advanced (reset settings, export diagnostics)
- **settings-status-service.ts** - SettingsStatusService for checking feature availability
  - Checks Ollama health (semantic search)
  - Checks Python/venv existence (transcription, web-link-analyzer)
  - Checks Radicle CLI and identity
  - Checks git installation
  - Validates Claude API key format

## Main Exports

- `InterBrainSettings` (interface) - Settings schema with API keys and feature flags
- `DEFAULT_SETTINGS` - Default configuration values
- `InterBrainSettingTab` - Obsidian PluginSettingTab implementation
- `SettingsStatusService` - Service for checking system dependencies
- `SystemStatus` (interface) - Comprehensive status for all features
- `FeatureStatus` (interface) - Status schema for individual features

## Dependencies

- Obsidian Plugin API (App, PluginSettingTab, Setting)
- Feature services: OllamaEmbeddingService, TranscriptionService, RadicleService
- Node.js child_process for running shell commands
- Node.js fs/path for checking file system state

## Notes

- SettingsStatusService lazy-loads on first display (singleton service pattern)
- Auto-setup functionality for transcription and web-link-analyzer (background exec)
- Passphrase test functionality restarts Radicle node to validate credentials
- Logo loading uses Obsidian's getResourcePath API (expects InterBrain/InterBrain.png)
- Status overview grid provides click-to-scroll navigation to feature sections
