import { Plugin } from 'obsidian';
import { useInterBrainStore } from '../store/interbrain-store';

/**
 * Radial Button Commands - Debug commands for testing radial button UI
 */
export class RadialButtonCommands {
  constructor(_plugin: Plugin) {
    // No services needed for simple store updates
  }

  /**
   * Register all radial button debug commands
   */
  registerCommands(plugin: Plugin): void {
    // Cycle through different button counts
    plugin.addCommand({
      id: 'cycle-radial-button-count',
      name: 'Debug: Cycle Radial Button Count',
      callback: () => this.cycleButtonCount()
    });
  }

  /**
   * Cycle through preset button counts: 1, 3, 6, 18, 24, 32
   */
  private cycleButtonCount(): void {
    const store = useInterBrainStore.getState();
    const currentCount = store.radialButtonUI.buttonCount;

    const counts = [1, 3, 6, 18, 24, 32];
    const currentIndex = counts.indexOf(currentCount);
    const nextIndex = (currentIndex + 1) % counts.length;
    const nextCount = counts[nextIndex];

    store.setRadialButtonCount(nextCount);
    console.log(`🎯 [RadialButtonUI] Button count: ${currentCount} → ${nextCount}`);
  }
}
