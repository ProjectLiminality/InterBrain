// Tutorial feature - Onboarding system with Manim-style animations

// Types
export type {
  TutorialStep,
  TutorialSegment,
  TutorialAction,
  TutorialState,
  DemoVaultConfig,
  DemoNodeConfig,
} from './types';

// Store slice
export {
  TutorialSlice,
  createTutorialSlice,
  extractTutorialPersistenceData,
  restoreTutorialPersistenceData,
} from './store/slice';

// Services
export { tutorialService, TutorialService } from './TutorialService';
export type { GoldenDotAnimation, TextAnimation } from './TutorialService';
export { demoVaultService, DemoVaultService, DEMO_VAULT_CONFIG } from './services/demo-vault-service';
export { musicService, MusicService } from './services/music-service';

// Step definitions
export { MVP_TUTORIAL_STEPS, getStepsBySegment, getStepById } from './steps/mvp-steps';

// Utilities
export {
  projectToZPlane,
  projectToZPlaneWithOffset,
  projectMidpointToZPlane,
  calculateEdgePositions,
  calculateProjectedEdgePositions,
  calculateTextPositionNextToNode,
} from './utils/projection';
export { checkHitSphereIntersection, createHitDetectionTracker } from './utils/hit-detection';

// Commands
export { registerTutorialCommands } from './TutorialCommands';

// Settings
export { createTutorialSettingsSection } from './settings-section';

// Components
export { TutorialOverlay } from './TutorialOverlay';
export { TutorialModal } from './TutorialModal';
export { ManimText } from './ManimText';
export { GoldenDot } from './GoldenDot';
export { TutorialRunner } from './TutorialRunner';
export { TutorialPortalOverlay } from './TutorialPortalOverlay';
export { ProjectLiminalityLogo, LOGO_DIMENSIONS, LOGO_BLUE, LOGO_RED } from './components/ProjectLiminalityLogo';
