import { Plugin } from 'obsidian';
import { UIService } from '../../core/services/ui-service';
import { tutorialService } from './TutorialService';
import { TutorialModal } from './TutorialModal';

/**
 * Register tutorial commands for onboarding system
 */
export function registerTutorialCommands(plugin: Plugin, uiService: UIService): void {

  // Start Tutorial in 3D space
  plugin.addCommand({
    id: 'start-tutorial',
    name: 'Start Tutorial',
    callback: () => {
      console.log('🎓 Starting tutorial in 3D space');
      tutorialService.start();
      uiService.showInfo('Tutorial started - watch DreamSpace');
    }
  });

  // Start Tutorial in modal
  plugin.addCommand({
    id: 'start-tutorial-modal',
    name: 'Start Tutorial (Modal)',
    callback: () => {
      console.log('🎓 Starting tutorial in modal');
      tutorialService.start();
      const modal = new TutorialModal(plugin.app);
      modal.open();
    }
  });

  // Reset Tutorial (Debug)
  plugin.addCommand({
    id: 'reset-tutorial',
    name: 'Reset Tutorial (Debug)',
    callback: () => {
      console.log('🔄 Resetting tutorial state');
      tutorialService.reset();
      uiService.showInfo('Tutorial state reset. Run Start Tutorial to begin again.');
    }
  });

  // Skip Tutorial
  plugin.addCommand({
    id: 'skip-tutorial',
    name: 'Skip Tutorial',
    callback: () => {
      console.log('⏭️ Skipping tutorial');
      tutorialService.skip();
      uiService.showInfo('Tutorial skipped');
    }
  });
}
