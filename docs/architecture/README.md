# Architecture Documentation

This section contains the technical architecture documentation for InterBrain.

## Documents

- [**Overview**](overview.md) - Core architectural decisions and design philosophy
- [**Git User Experience**](git-user-experience.md) - Complete specification for making git accessible to non-technical users

## Architecture Philosophy

InterBrain follows a **Pragmatic Hybrid Architecture** designed for optimal AI collaboration:

### Core Principle
**AI Readability >= Human Readability** - Code organization prioritizes context locality for AI assistants over traditional human-centric patterns.

### Architectural Pattern
Combines **Vertical Slice Architecture** (organize by feature) with **Atomic Design Principles** (shared UI components).

## Key Decisions

- **AI-First Development**: Optimized for human-AI collaboration
- **Modular DreamNode System**: Independent, composable components
- **User-Friendly Abstractions**: Complex systems hidden behind intuitive interfaces
- **Command Palette Architecture**: Obsidian-native interaction patterns