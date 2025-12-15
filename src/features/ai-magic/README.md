# AI Magic Feature Slice

Unified AI provider management for InterBrain. Handles both local (Ollama) and remote (Claude, OpenRouter) inference with intelligent routing based on task complexity.

## Purpose

Centralize all AI inference logic into a single feature slice with:
- **Provider Registry**: Manage multiple AI providers (local + remote)
- **Unified Interface**: Single `generateCompletion()` call routes to appropriate provider
- **Tier System**: Match task complexity to model capability/cost
- **Settings UI**: One-stop configuration for all AI features

## Directory Structure

```
ai-magic/
├── store/
│   └── slice.ts              # Provider config, active providers, tier preferences
├── services/
│   ├── provider-registry.ts  # Central registry of all providers
│   ├── inference-service.ts  # Unified LLM inference interface
│   ├── ollama-inference.ts   # Ollama chat/generate API
│   ├── claude-provider.ts    # Anthropic API provider
│   └── openrouter-provider.ts # OpenRouter for model variety (future)
├── types.ts                  # Shared types and interfaces
├── settings-section.ts       # AI settings UI in InterBrain settings
├── index.ts                  # Barrel export
└── README.md
```

## AI Usage in InterBrain

Current consumers of AI inference:

| Consumer | Feature | Use Case | Complexity |
|----------|---------|----------|------------|
| `conversational-copilot` | Conversation summaries | Summarize conversation with invoked nodes | Trivial |
| `dreamnode-updater` | Update summaries | Translate git commits to user-friendly text | Trivial |
| `web-link-analyzer` | URL enrichment | Analyze web pages, generate DreamNode titles | Standard |
| `feedback` | Issue refinement | Improve bug report titles, detect duplicates | Standard |

Note: `semantic-search` uses Ollama for **embeddings** (different API), not inference. That stays separate.

## Tier System

### Task Complexity Tiers

| Tier | Use Case | Examples |
|------|----------|----------|
| **Trivial** | Simple text transformation | Summaries, formatting, extraction |
| **Standard** | Moderate reasoning | Analysis, classification, generation |
| **Complex** | Deep reasoning (future) | Multi-step planning, complex synthesis |

### Provider Mapping

**Remote (API) Providers:**
| Tier | Claude | OpenRouter |
|------|--------|------------|
| Trivial | claude-haiku-4-5 | TBD |
| Standard | claude-sonnet-4-5 | TBD |
| Complex | claude-opus-4-5 | TBD |

**Local (Ollama) Providers:**

Based on system RAM, users select a tier they can run:

| Tier | RAM Requirement | Recommended Models |
|------|-----------------|-------------------|
| **High** | 64GB+ | llama3.1:70b, qwen2.5:72b |
| **Medium** | 16GB+ | llama3.1:8b, mistral:7b, qwen2.5:14b |
| **Low** | 8GB+ | llama3.2:3b, phi3:mini, gemma2:2b |

The system maps task complexity to available local tier:
- User with High tier: Trivial→Low, Standard→Medium, Complex→High
- User with Medium tier: Trivial→Low, Standard→Medium, Complex→Medium (best effort)
- User with Low tier: All tasks use Low tier models

## Configuration

### Settings UI Design

```
🤖 AI Magic
├── Provider Status (at-a-glance health of all providers)
│   ├── ✅ Claude API: Ready
│   ├── 🟡 Ollama: Model needed
│   └── ⚫ OpenRouter: Not configured
│
├── Remote Providers
│   ├── Claude API Key: [sk-ant-***]
│   │   └── Get API key: console.anthropic.com
│   └── OpenRouter API Key: [optional]
│
├── Local AI (Ollama)
│   ├── Status: ✅ Running / 🔴 Not running
│   ├── Hardware Tier: [High ▼] (based on your 64GB RAM)
│   │   └── "High tier enables the most capable local models"
│   ├── Models
│   │   ├── Complex Tasks: [llama3.1:70b ▼] [Pull]
│   │   ├── Standard Tasks: [llama3.1:8b ▼] [Pull]
│   │   └── Trivial Tasks: [llama3.2:3b ▼] [Pull]
│   └── One-Click Setup: [Setup Ollama + Models]
│
├── Provider Preferences
│   ├── Prefer Local AI when available: [✓]
│   │   └── "Uses Ollama when running, falls back to Claude"
│   └── Offline Mode: [✓]
│       └── "Only use local AI, never make API calls"
│
└── Privacy Note
    "Local AI runs entirely on your machine. Your data never
    leaves your computer when using Ollama."
```

## Key Interfaces

```typescript
// Task complexity hint for routing
type TaskComplexity = 'trivial' | 'standard' | 'complex';

// Provider capabilities
interface AIProvider {
  name: string;
  type: 'local' | 'remote';
  isAvailable(): Promise<boolean>;
  generateCompletion(
    messages: Message[],
    options?: CompletionOptions
  ): Promise<CompletionResponse>;
}

// Unified inference call
interface InferenceService {
  // Main entry point - routes based on complexity and availability
  generate(
    messages: Message[],
    complexity: TaskComplexity,
    options?: InferenceOptions
  ): Promise<CompletionResponse>;

  // Direct provider access if needed
  getProvider(name: string): AIProvider | undefined;

  // Status
  getAvailableProviders(): Promise<ProviderStatus[]>;
}
```

## Migration Plan

1. **Extract**: Move `llm-provider.ts` from `conversational-copilot` to `ai-magic`
2. **Enhance**: Add Ollama inference support (chat API, not embeddings)
3. **Registry**: Create provider registry with availability checking
4. **Routing**: Implement complexity-based routing
5. **Settings**: Create unified settings section
6. **Update Consumers**: Point all AI consumers to `ai-magic` service

## Open Questions

### For David to decide:

1. **Tier naming**: "High/Medium/Low" vs "Powerful/Balanced/Efficient" vs "Large/Medium/Small"?

2. **Default behavior**: When both local and remote are available, default to:
   - Local first (privacy-focused)
   - Remote first (quality-focused)
   - User must choose

3. **Model curation**: Should we hard-code our recommended models, or let users pick any Ollama model?
   - Curated list = simpler UX, tested combinations
   - Open choice = flexibility, power users

4. **Fallback behavior**: If local model fails mid-request, should we:
   - Fail and notify user
   - Silently fall back to remote (if available)
   - Ask user

5. **Cost awareness**: Should we show estimated API costs in settings?

## Dependencies

- Ollama (for local inference)
- Anthropic API (for Claude)
- OpenRouter API (future, for model variety)

## Notes

- Embeddings remain in `semantic-search` - different use case, different API
- Python-based web-link-analyzer will need updating to use this service (or keep using Claude directly via Python anthropic package)
