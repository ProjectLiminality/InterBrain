export { registerCollaborationCommands } from './commands';
export { GitSyncService, type CommitInfo, type FetchResult } from './services/git-sync-service';
export { getSovereigntyService } from './services/sovereignty-service';
export { listPeerRemotes, isPeerRemote, ownerFromRemoteUrl } from './services/peer-remotes';
export {
  type SubmoduleUpdate,
  parseGitmodules,
  checkSubmoduleUpdatesFromNetwork,
  updateSubmodulesFromStandalone
} from './utils/submodule-sync';
