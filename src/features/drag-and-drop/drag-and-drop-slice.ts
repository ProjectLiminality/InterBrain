import { StateCreator } from 'zustand';

/**
 * Drag-and-drop slice - owns drag state
 */
export interface DragAndDropSlice {
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
}

/**
 * Creates the drag-and-drop slice
 */
export const createDragAndDropSlice: StateCreator<
  DragAndDropSlice,
  [],
  [],
  DragAndDropSlice
> = (set) => ({
  isDragging: false,
  setIsDragging: (dragging) => set({ isDragging: dragging }),
});
