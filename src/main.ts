import { Plugin } from 'obsidian';

export default class InterBrainPlugin extends Plugin {
  async onload() {
    console.log('InterBrain plugin loaded!');
    
    // Add ribbon icon
    this.addRibbonIcon('brain-circuit', 'Open DreamSpace', () => {
      console.log('DreamSpace clicked!');
      // TODO: Open DreamSpace view
    });

    // Add command palette command
    this.addCommand({
      id: 'open-dreamspace',
      name: 'Open DreamSpace',
      callback: () => {
        console.log('Open DreamSpace command executed');
        // TODO: Open DreamSpace view
      }
    });
  }

  onunload() {
    console.log('InterBrain plugin unloaded');
  }
}