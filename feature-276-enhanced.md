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

- [ ] Vite configuration working for both browser development and Obsidian plugin builds
- [ ] manifest.json properly configured for Obsidian plugin requirements
- [ ] main.ts serves as Obsidian plugin entry point with basic structure
- [ ] index.html created for browser development workflow
- [ ] React + TypeScript integration functional in both environments
- [ ] Package.json scripts configured for dual development workflow
- [ ] Build outputs work correctly: browser bundle + Obsidian plugin
- [ ] Hot reload working for React components in browser development
- [ ] Plugin loads successfully in Obsidian development vault

## Dependencies

- Technical Architecture Specification (#264) must be approved
- Current esbuild setup can be replaced/removed
- Development vault symlink structure maintained

## Definition of Done

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
- [ ] Code reviewed and merged