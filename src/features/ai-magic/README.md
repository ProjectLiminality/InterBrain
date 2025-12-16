# AI Magic Feature Slice

Unified AI provider management for InterBrain. Handles both local (Ollama) and remote (Claude, OpenAI, Groq, xAI) inference with intelligent routing and automatic fallback.

## Current Status (2024-12-16)

**Core Feature: COMPLETE** - Ready for private beta testing.

### What's Working
- **Claude provider** (remote) - Highest quality, recommended
- **Groq provider** (remote) - Blazing fast inference (sub-second)
- **OpenAI provider** (remote) - GPT-4o models
- **xAI Grok provider** (remote) - grok-3-mini, grok-4 models
- **Ollama provider** (local) - Automatic hardware detection, privacy-first
- Unified inference service with provider routing
- **Default provider selection** - Radio buttons to choose your preferred provider
- Automatic fallback with user notification
- Settings panel with one-click model installation
- All consumers migrated to ai-magic service
- Thinking tag stripping for qwen3 model output
- Offline mode (local-only) toggle

### Known Issues Being Investigated
- **Semantic deduplication in feedback service**: When using Ollama for AI-refined feedback, the deduplication may fail due to model response format. The safety net for thinking tags was added, but needs more testing. Check console for `[AI Magic] Using provider:` to verify which provider is active.

### Not Yet Implemented
- Google Gemini provider (different API format, needs custom adapter)
- web-link-analyzer migration (uses Python + Claude SDK directly, lower priority)
- Cost tracking / usage statistics

## Architecture

### Directory Structure

```
ai-magic/
├── store/
│   └── slice.ts                    # Zustand state for AI config
├── services/
│   ├── inference-service.ts        # Unified routing + fallback logic
│   ├── ollama-inference.ts         # Ollama chat API + thinking tag stripping
│   ├── claude-provider.ts          # Anthropic API provider
│   └── openai-compatible-provider.ts  # OpenAI, Groq, xAI (shared implementation)
├── types.ts                        # Core types, hardware detection, model configs
├── settings-section.ts             # Settings panel UI
├── commands.ts                     # Test commands for debugging
├── index.ts                        # Barrel export
└── README.md
```

### Key Files

| File | Purpose |
|------|---------|
| `types.ts` | `TaskComplexity`, `HardwareTier`, `detectHardwareTier()`, curated model lists |
| `inference-service.ts` | `generateAI()` - main entry point, provider routing, fallback |
| `ollama-inference.ts` | Ollama `/api/chat` integration, thinking tag stripping |
| `claude-provider.ts` | Anthropic API integration |
| `openai-compatible-provider.ts` | OpenAI, Groq, xAI - one implementation, different configs |
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
1. **Remote-first** (default for private beta): Claude → Groq → OpenAI → xAI → Ollama
2. **Local-first** (user preference): Ollama → Claude → Groq → OpenAI → xAI
3. **Offline mode**: Ollama only, no API calls

### Remote Providers

| Provider | Speed | Quality | Models |
|----------|-------|---------|--------|
| **Claude** | ⚡⚡ | ⭐⭐⭐ | claude-haiku/sonnet/opus |
| **Groq** | ⚡⚡⚡ | ⭐⭐ | llama-3.1-8b/70b |
| **OpenAI** | ⚡⚡ | ⭐⭐⭐ | gpt-4o-mini/gpt-4o |
| **xAI** | ⚡⚡ | ⭐⭐ | grok-beta |

All remote providers use the OpenAI-compatible API format (except Claude which has its own API).

### Complexity Mapping

| Complexity | Claude Model | Groq Model | OpenAI Model | xAI Model |
|------------|--------------|------------|--------------|-----------|
| trivial | claude-haiku-4-5 | llama-3.1-8b-instant | gpt-4o-mini | grok-beta |
| standard | claude-sonnet-4-5 | llama-3.1-70b-versatile | gpt-4o | grok-beta |
| complex | claude-opus-4-5 | llama-3.1-70b-versatile | gpt-4o | grok-beta |

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
console.log(response.provider); // 'Claude', 'Ollama', 'OpenAI', 'Groq', or 'xAI Grok'
```

### Check Provider Availability
```typescript
import { getInferenceService } from '../ai-magic';

const service = getInferenceService();
const available = await service.isAnyProviderAvailable();
const statuses = await service.getProvidersStatus();
```

## Test Commands

Available in Obsidian command palette (one test command per provider):

- `AI Magic: Test Claude Provider` - Test Anthropic Claude
- `AI Magic: Test Groq Provider` - Test Groq (blazing fast)
- `AI Magic: Test OpenAI Provider` - Test OpenAI GPT
- `AI Magic: Test xAI Grok Provider` - Test xAI Grok
- `AI Magic: Test Ollama Provider` - Test local Ollama
- `AI Magic: Test Auto-routing` - Test fallback logic
- `AI Magic: Check All Providers Status` - Show all provider statuses

## Debugging

### Console Logs
- `[AI Magic] Detected system RAM: XX.X GB` - Hardware detection
- `[AI Magic] Using provider: Claude/Ollama/OpenAI/Groq/xAI Grok` - Which provider handles request
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
- `openaiApiKey` - OpenAI API key
- `groqApiKey` - Groq API key
- `xaiApiKey` - xAI API key
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
- [ ] Google Gemini provider (needs custom adapter - different API format)
- [ ] web-link-analyzer migration (if needed)

### Long Term
- [ ] Cost tracking / token budgets
- [ ] Usage statistics dashboard
- [ ] Model performance benchmarking

## Dependencies

- **Ollama** - Local inference (optional but recommended)
- **Anthropic API** - Claude access (requires API key)
- **OpenAI API** - GPT access (requires API key)
- **Groq API** - Fast inference (requires API key)
- **xAI API** - Grok access (requires API key)
- **Obsidian** - `requestUrl` for CORS-free API calls, `Notice` for user feedback
