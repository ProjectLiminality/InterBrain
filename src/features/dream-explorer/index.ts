/**
 * Dream Explorer Feature
 *
 * Full-screen holarchy file navigator for exploring DreamNode contents.
 */

export { DreamExplorerView, DREAM_EXPLORER_VIEW_TYPE } from './components/DreamExplorerView';
export { DreamExplorer } from './components/DreamExplorer';
export { DreamExplorerSlice, createDreamExplorerSlice } from './store/slice';
export type { ExplorerItem, ExplorerItemType, PositionedItem } from './types/explorer';
