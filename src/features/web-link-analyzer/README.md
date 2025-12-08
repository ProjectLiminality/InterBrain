# Web Link Analyzer

AI-powered web page summarization using Claude API via Python subprocess.

## Purpose

Analyzes web links to generate personalized summaries and downloads representative images for DreamNodes. Uses Python to work around Obsidian plugin environment restrictions on third-party Node.js packages.

## Key Files

- **service.ts** - Main service class that spawns Python process, manages analysis lifecycle, and updates DreamNode store
- **index.ts** - Exports singleton instance

## Main Exports

- `webLinkAnalyzerService` - Singleton service instance

## Key Operations

1. **analyzeWebLink()** - Main entry point: spawns Python process with URL, API key, and user profile path
2. **initialize()** - Sets vault and plugin paths for resolving script locations
3. **isSetupComplete()** - Checks if Python venv exists at expected location
4. **stop()** - Kills running analysis process

## Dependencies

- Python venv at `scripts/venv/` (platform-specific paths for Windows/Unix)
- Python script at `scripts/analyze-web-link.py`
- User profile at `~/.claude/CLAUDE.md` for personalization
- Anthropic API key from plugin settings

## Architecture Pattern

Similar to `realtime-transcription` feature - uses Python subprocess to avoid Node.js package restrictions in Obsidian plugins.

## Issues/Notes

- **Missing scripts directory**: No Python scripts found in repository. Expected `scripts/analyze-web-link.py` and venv setup.
- Feature appears incomplete - service exists but actual Python implementation is missing.
- May need setup documentation for users to install Python dependencies.
