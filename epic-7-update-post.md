# Conversational Copilot System Complete 🎙️🔥

**Published on 5 October 2025 by David Rug**

Since the last update, Epic 7 has been completed, bringing conversational intelligence to the heart of InterBrain. This release transforms how we share knowledge during conversations - making real-time transcription, semantic search, and AI-powered summaries first-class citizens in your spatial knowledge network.

## Digital Campfire Mode

**[VIDEO 1: Copilot Mode Demo]**

When you start a video call with someone in your vault, InterBrain enters "Digital Campfire" mode - your conversation partner moves to the center while real-time transcription captures every word. Press and hold the Option key to reveal a semantic search honeycomb showing relevant DreamNodes based on the last 500 characters of conversation context.

The system runs entirely locally using whisper_streaming for sub-5-second latency transcription. When something relevant comes up, simply click a DreamNode to "invoke" it - marking it for automatic sharing after the call ends.

## Songline: Perspectives Across Time

**[VIDEO 2: Songline Feature Demo]**

Every conversation becomes a living artifact. The Songline feature automatically generates audio clips from your conversation using LLM-powered segmentation, creating a timeline of perspectives around invoked DreamNodes.

When you later open a DreamNode that was discussed across multiple conversations, you'll see all the perspectives - different moments in time when you and others explored that idea together. Each audio clip is a window into how your understanding evolved through dialogue.

## One-Click Knowledge Sharing

**[VIDEO 3: Post-Call Summary & URI Cloning]**

After ending a Digital Campfire session, InterBrain generates an AI-powered conversation summary with all invoked DreamNodes embedded as Obsidian URI deep links. Click "Export to Email" and Apple Mail opens with a pre-filled message ready to send.

Your conversation partner receives clickable links that instantly clone the referenced DreamNodes into their vault - either via the Radicle network or GitHub fallback. No manual exports, no file attachments, just seamless peer-to-peer knowledge transfer.

## Technical Implementation

Key technical achievements include:

**Real-Time Transcription Infrastructure**
- whisper_streaming integration with LocalAgreement-2 for duplicate prevention
- Python virtual environment isolation with cross-platform dependency management
- Sub-5-second latency speech-to-text with automatic file updates
- Robust process lifecycle management with graceful cleanup

**Semantic Search Integration**
- 500-character rolling context window for focused search relevance
- Option key press-and-hold to show/hide search results honeycomb
- Real-time node discovery driving conversational flow
- Invocation tracking decoupled from selection for clean UX

**AI-Powered Summarization**
- Claude API integration via Obsidian's requestUrl (CORS workaround)
- Provider abstraction layer supporting multiple LLM backends
- Conversation summarization with invocation context awareness
- Graceful fallback when AI API unavailable

**macOS System Integration**
- FaceTime automation with AppleScript execution
- Apple Mail draft generation with pre-filled content
- Contact metadata system (email/phone) for person DreamNodes
- Automatic copilot mode activation on call start

## What's Next

With Epic 7 complete, we now have a foundation for conversational AI-powered knowledge work. Epic 8 will focus on the Coherence Beacon System - automatic relationship discovery, bidirectional tracking, and distributed publishing infrastructure that makes the knowledge network truly alive.

The journey continues toward DreamOS - a decentralized operating system for collective sensemaking.

## Getting Started

Complete setup instructions are available in the [project README](https://github.com/ProjectLiminality/InterBrain). Installation is straightforward - download the latest release, drag the folder to your Obsidian plugins directory, and enable the plugin.

**Note:** InterBrain is work-in-progress software built transparently in public. The conversational features require Python 3.10+ for transcription and an optional Claude API key for AI summaries.

---

🙏 **Thank You**

Your ongoing support makes this journey possible. Every contribution helps me dedicate more time and energy toward bringing this vision into the world.

Stay tuned for the Epic 8 update coming soon!
