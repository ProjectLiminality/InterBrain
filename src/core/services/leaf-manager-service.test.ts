import { describe, it, expect, beforeEach, vi } from 'vitest';
import { App, TFile, TFolder } from 'obsidian';

// The service imports Obsidian view components whose render deps (react-pdf/
// pdfjs) can't load under jsdom. The resolver under test never touches them.
vi.mock('../../features/dreamweaving/components/DreamSongFullScreenView', () => ({
  DreamSongFullScreenView: class {},
  DREAMSONG_FULLSCREEN_VIEW_TYPE: 'dreamsong-fullscreen',
}));
vi.mock('../../features/dreamweaving/components/CustomUIFullScreenView', () => ({
  CustomUIFullScreenView: class {},
  CUSTOM_UI_FULLSCREEN_VIEW_TYPE: 'custom-ui-fullscreen',
}));
vi.mock('../../features/dream-explorer/components/DreamExplorerView', () => ({
  DreamExplorerView: class {},
  DREAM_EXPLORER_VIEW_TYPE: 'dream-explorer',
}));

import { LeafManagerService } from './leaf-manager-service';

/**
 * resolveVaultFile — the vault-index lookup underneath every file opener
 * (.md opener bug #403). Obsidian's getAbstractFileByPath is case-sensitive
 * while macOS/Windows filesystems are not, so a stale-cased repoPath opens
 * fine via fs but silently misses the index. The resolver must rescue that.
 */
describe('LeafManagerService.resolveVaultFile', () => {
  let app: App;
  let service: LeafManagerService;
  // private method — tested directly; it is the shared core of 4 open paths
  let resolve: (p: string) => TFile | null;

  beforeEach(() => {
    app = new App();
    service = new LeafManagerService(app);
    resolve = (p) => (service as unknown as { resolveVaultFile(p: string): TFile | null }).resolveVaultFile(p);
  });

  it('returns the file on an exact-path match', () => {
    const file = new TFile('MyNode/README.md');
    app.vault.getAbstractFileByPath.mockReturnValue(file);
    expect(resolve('MyNode/README.md')).toBe(file);
  });

  it('normalizes backslashes and leading slashes before lookup', () => {
    const file = new TFile('MyNode/README.md');
    app.vault.getAbstractFileByPath.mockImplementation((p: string) =>
      p === 'MyNode/README.md' ? file : null
    );
    expect(resolve('\\MyNode\\README.md')).toBe(file);
  });

  it('rescues a case-mismatched path via the vault index', () => {
    const file = new TFile('MyNode/README.md');
    app.vault.getAbstractFileByPath.mockReturnValue(null);
    app.vault.getFiles.mockReturnValue([new TFile('Other/Note.md'), file]);
    // stale-cased repoPath: fs resolves it, the index lookup does not
    expect(resolve('mynode/readme.md')).toBe(file);
  });

  it('returns null when the file exists nowhere in the index', () => {
    app.vault.getAbstractFileByPath.mockReturnValue(null);
    app.vault.getFiles.mockReturnValue([new TFile('Other/Note.md')]);
    expect(resolve('MyNode/README.md')).toBeNull();
  });

  it('returns null when the path resolves to a folder', () => {
    app.vault.getAbstractFileByPath.mockReturnValue(new TFolder('MyNode'));
    app.vault.getFiles.mockReturnValue([]);
    expect(resolve('MyNode')).toBeNull();
  });
});
