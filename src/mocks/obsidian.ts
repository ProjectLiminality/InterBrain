// Mock Obsidian API for browser development
export class Plugin {
  app: any;
  manifest: any;
  
  constructor() {
    this.app = {
      vault: {
        adapter: {
          path: '/mock/vault/path'
        }
      },
      commands: {
        executeCommandById: (id: string) => {
          console.log(`[Mock] Executing command: ${id}`);
        }
      }
    };
  }
  
  onload() {
    console.log('[Mock] Plugin loaded in browser');
  }
  
  onunload() {
    console.log('[Mock] Plugin unloaded');
  }
  
  addRibbonIcon(icon: string, title: string, callback: () => void) {
    console.log(`[Mock] Added ribbon icon: ${title}`);
    return { remove: () => {} };
  }
  
  addCommand(command: any) {
    console.log(`[Mock] Added command: ${command.name}`);
  }
}

export default {
  Plugin
};