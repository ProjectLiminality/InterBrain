## Description

Foundation Obsidian plugin structure with Vite build system for dual development workflow (browser + plugin). Includes manifest.json, main.ts entry point, Vite configuration for React/React Three Fiber, and basic plugin architecture following vertical slice principles.

**Technical Components:**
- Vite configuration replacing esbuild for instant hot reload
- Dual build targets: development (browser) + production (Obsidian plugin)
- React + TypeScript integration
- Basic plugin structure (manifest.json, main.ts, index.html)
- Package.json scripts for both workflows

**Development Workflow Enabled:**
- `npm run dev` → Vite development server with hot reload for React 3 Fiber
- `npm run plugin-build` → Obsidian plugin build
- Browser development with state preservation
- Plugin Reloader hotkey testing in Obsidian (unchanged)

## Acceptance Criteria

- [x] Vite configuration working for both browser development and Obsidian plugin builds
- [x] manifest.json properly configured for Obsidian plugin requirements
- [x] main.ts serves as Obsidian plugin entry point with basic structure
- [x] index.html created for browser development workflow
- [x] React + TypeScript integration functional in both environments
- [x] Package.json scripts configured for dual development workflow
- [x] Build outputs work correctly: browser bundle + Obsidian plugin
- [x] Hot reload working for React components in browser development
- [x] Plugin loads successfully in Obsidian development vault

## Dependencies

- Technical Architecture Specification (#264) must be approved
- Current esbuild setup can be replaced/removed
- Development vault symlink structure maintained

## Definition of Done

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
- [x] Code reviewed and merged