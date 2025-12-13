# Web Link Analyzer

AI-powered web page summarization using Claude API via Python subprocess.

## Purpose

Analyzes web links to generate personalized summaries and downloads representative images for DreamNodes. Uses Python to work around Obsidian plugin environment restrictions on third-party Node.js packages.

## Directory Structure

```
web-link-analyzer/
├── services/
│   └── web-link-analyzer-service.ts  # Main service (spawns Python, manages analysis)
├── scripts/
│   ├── venv/                         # Python virtual environment
│   ├── analyze-web-link.py           # Python script for web analysis
│   ├── requirements.txt              # Python dependencies
│   └── setup.sh                      # venv setup script
├── index.ts                          # Barrel export
└── README.md                         # This file
```

## Main Exports

**Services:**
- `webLinkAnalyzerService` - Singleton service instance for analyzing web links

## Key Operations

1. **analyzeWebLink()** - Main entry point: spawns Python process with URL, API key, and user profile path
2. **initialize()** - Sets vault and plugin paths for resolving script locations
3. **isSetupComplete()** - Checks if Python venv exists at expected location
4. **stop()** - Kills running analysis process

## Architecture Pattern

Similar to `realtime-transcription` feature - uses Python subprocess to avoid Node.js package restrictions in Obsidian plugins.

**Process Flow:**
1. Service spawns Python script with URL and API key
2. Python script fetches web page content
3. Claude API analyzes content and generates summary
4. Representative image is downloaded
5. README.md and .udd file are updated in DreamNode repository
6. Service updates node title in store and triggers media reload

## Dependencies

- Python 3.9+ with virtual environment at `scripts/venv/`
- Python script at `scripts/analyze-web-link.py`
- User profile at `~/.claude/CLAUDE.md` for personalization
- Anthropic API key from plugin settings

## Integration Points

- **Used by**: `dreamnode/git-dreamnode-service` for enriching nodes created from web URLs
- **Used by**: `drag-and-drop` feature indirectly through git-dreamnode-service
- **Initialized by**: Plugin main.ts during startup
