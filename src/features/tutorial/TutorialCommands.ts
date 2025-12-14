import { Plugin } from 'obsidian';
import { UIService } from '../../core/services/ui-service';
import { tutorialService } from './TutorialService';
import { TutorialModal } from './TutorialModal';
import { useInterBrainStore } from '../../core/store/interbrain-store';

/**
 * Register tutorial commands for onboarding system
 */
export function registerTutorialCommands(plugin: Plugin, uiService: UIService): void {

  // Start MVP Tutorial (new system)
  plugin.addCommand({
    id: 'start-mvp-tutorial',
    name: 'Start MVP Tutorial',
    callback: () => {
      console.log('🎓 Starting MVP tutorial');
      const store = useInterBrainStore.getState();
      store.startTutorial();
      uiService.showInfo('Tutorial started - watch DreamSpace');
    }
  });

  // Stop MVP Tutorial
  plugin.addCommand({
    id: 'stop-mvp-tutorial',
    name: 'Stop MVP Tutorial',
    callback: () => {
      console.log('⏹️ Stopping MVP tutorial');
      const store = useInterBrainStore.getState();
      store.endTutorial();
      uiService.showInfo('Tutorial stopped');
    }
  });

  // Start Tutorial in 3D space (legacy)
  plugin.addCommand({
    id: 'start-tutorial',
    name: 'Start Tutorial (Legacy)',
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

  // Test Golden Dot - Arc (Debug)
  plugin.addCommand({
    id: 'test-golden-dot',
    name: 'Test Golden Dot - Arc (Debug)',
    callback: () => {
      console.log('✨ Testing golden dot animation (arc)');

      // Animate from left to right with default arc
      tutorialService.animateGoldenDot({
        from: [-15, 0, -30],
        to: [15, 0, -30],
        duration: 3,
        size: 100,
        easing: 'easeInOut'
      });

      uiService.showInfo('Golden dot test (arc) - watch DreamSpace');
    }
  });

  // Test Golden Dot - Linear (Debug)
  plugin.addCommand({
    id: 'test-golden-dot-linear',
    name: 'Test Golden Dot - Linear (Debug)',
    callback: () => {
      console.log('✨ Testing golden dot animation (linear)');

      const from: [number, number, number] = [-15, 0, -30];
      const to: [number, number, number] = [15, 0, -30];

      // Linear path: control points on the line between from and to
      const cp1: [number, number, number] = [
        from[0] + (to[0] - from[0]) * 0.33,
        from[1] + (to[1] - from[1]) * 0.33,
        from[2] + (to[2] - from[2]) * 0.33,
      ];
      const cp2: [number, number, number] = [
        from[0] + (to[0] - from[0]) * 0.66,
        from[1] + (to[1] - from[1]) * 0.66,
        from[2] + (to[2] - from[2]) * 0.66,
      ];

      tutorialService.animateGoldenDot({
        from,
        to,
        controlPoints: [cp1, cp2],
        duration: 3,
        size: 100,
        easing: 'easeInOut'
      });

      uiService.showInfo('Golden dot test (linear) - watch DreamSpace');
    }
  });
}
