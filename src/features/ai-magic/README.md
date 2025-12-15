# AI Magic Feature Slice

Unified AI provider management for InterBrain. Handles both local (Ollama) and remote (Claude) inference with intelligent routing and automatic fallback.

## Current Status (2024-12-15)

**Core Feature: COMPLETE** - Ready for private beta testing.

### What's Working
- Claude provider (remote)
- Ollama provider (local) with automatic hardware detection
- Unified inference service with provider routing
- Automatic fallback with user notification
- Settings panel with one-click model installation
- All consumers migrated to ai-magic service
- Thinking tag stripping for qwen3 model output

### Known Issues Being Investigated
- **Semantic deduplication in feedback service**: When using Ollama for AI-refined feedback, the deduplication may fail due to model response format. The safety net for thinking tags was added, but needs more testing. Check console for `[AI Magic] Using provider:` to verify which provider is active.

### Not Yet Implemented
- OpenRouter provider (placeholder in settings)
- web-link-analyzer migration (uses Python + Claude directly, lower priority)
- Cost tracking / usage statistics

## Architecture

### Directory Structure

```
ai-magic/
├── store/
│   └── slice.ts              # Zustand state for AI config
├── services/
│   ├── inference-service.ts  # Unified routing + fallback logic
│   ├── ollama-inference.ts   # Ollama chat API + thinking tag stripping
│   └── claude-provider.ts    # Anthropic API provider
├── types.ts                  # Core types, hardware detection, model configs
├── settings-section.ts       # Settings panel UI
├── commands.ts               # Test commands for debugging
├── index.ts                  # Barrel export
└── README.md
```

### Key Files

| File | Purpose |
|------|---------|
| `types.ts` | `TaskComplexity`, `HardwareTier`, `detectHardwareTier()`, curated model lists |
| `inference-service.ts` | `generateAI()` - main entry point, provider routing, fallback |
| `ollama-inference.ts` | Ollama `/api/chat` integration, thinking tag stripping |
| `claude-provider.ts` | Anthropic API integration |
| `settings-section.ts` | Full settings UI with status, model pulling, preferences |

## Hardware Tier System

Simplified to 2 tiers based on automatic RAM detection:

| Tier | RAM Threshold | Default Model | Use Case |
|------|---------------|---------------|----------|
| **High** | 32GB+ | qwen3:32b (~20GB) | Powerful reasoning |
| **Standard** | <32GB | llama3.2:3b (~2GB) | Fast, efficient |

Hardware is auto-detected via `os.totalmem()`. Users can override in advanced settings.

## Provider Routing

### Priority Order
1. **Remote-first** (default for private beta): Claude → Ollama fallback
2. **Local-first** (user preference): Ollama → Claude fallback
3. **Offline mode**: Ollama only, no API calls

### Complexity Mapping
| Complexity | Claude Model | Ollama Model |
|------------|--------------|--------------|
| trivial | claude-haiku-4-5 | (tier default) |
| standard | claude-sonnet-4-5 | (tier default) |
| complex | claude-opus-4-5 | (tier default) |

Note: Ollama uses the same model for all complexity levels (per-tier simplification).

## Consumers

All migrated to use `generateAI()` from ai-magic:

| Consumer | File | Complexity | Notes |
|----------|------|------------|-------|
| conversational-copilot | `conversation-summary-service.ts` | standard | Conversation summaries |
| dreamnode-updater | `update-summary-service.ts` | trivial | Git commit summaries |
| feedback | `feedback-service.ts` | trivial | Dedup, issue refinement |
| feedback | `issue-formatter-service.ts` | trivial | Issue formatting |

**NOT migrated** (intentionally):
- `web-link-analyzer` - Uses Python backend with Claude SDK directly. Lower priority.
- `semantic-search` - Uses Ollama for **embeddings**, different API entirely.

## Usage

### Basic Inference
```typescript
import { generateAI } from '../ai-magic';

const response = await generateAI(
  [{ role: 'user', content: 'Summarize this...' }],
  'trivial',  // complexity: 'trivial' | 'standard' | 'complex'
  { maxTokens: 500 }
);

console.log(response.content);  // Clean response (thinking tags stripped)
console.log(response.provider); // 'Claude' or 'Ollama'
```

### Check Provider Availability
```typescript
import { getInferenceService } from '../ai-magic';

const service = getInferenceService();
const available = await service.isAnyProviderAvailable();
const statuses = await service.getProvidersStatus();
```

## Test Commands

Available in Obsidian command palette:

- `AI Magic: Test Claude` - Test remote provider
- `AI Magic: Test Ollama` - Test local provider
- `AI Magic: Test Auto-routing` - Test fallback logic
- `AI Magic: Check Provider Status` - Show all provider statuses

## Debugging

### Console Logs
- `[AI Magic] Detected system RAM: XX.X GB` - Hardware detection
- `[AI Magic] Using provider: Claude/Ollama` - Which provider handles request
- `Provider X failed: ...` - Fallback triggered

### Common Issues

1. **Thinking tags in output** (`<think>...</think>`)
   - Should be auto-stripped by inference service
   - If still appearing, check if response is being processed outside ai-magic

2. **Wrong provider being used**
   - Check "Prefer Local AI" setting
   - Verify Ollama is running (`ollama serve`)
   - Check provider status in settings

3. **Semantic deduplication creating duplicates**
   - AI response may not match expected format
   - Check console for `[FeedbackService] AI returned unexpected response:`

## Configuration

Settings stored in plugin settings:
- `claudeApiKey` - Anthropic API key
- `preferLocal` - Use Ollama first when available
- `offlineMode` - Never make API calls

Ollama config (auto-detected):
- `hardwareTier` - 'standard' or 'high' based on RAM
- `baseUrl` - Default: http://localhost:11434

## Future Work

### Short Term
- [ ] More testing of Ollama + feedback deduplication
- [ ] Consider adding retry logic for transient failures

### Medium Term
- [ ] OpenRouter provider implementation
- [ ] web-link-analyzer migration (if needed)

### Long Term
- [ ] Cost tracking / token budgets
- [ ] Usage statistics dashboard
- [ ] Model performance benchmarking

## Dependencies

- **Ollama** - Local inference (optional but recommended)
- **Anthropic API** - Claude access (requires API key)
- **Obsidian** - `requestUrl` for CORS-free API calls, `Notice` for user feedback
