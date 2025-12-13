import { StateCreator } from 'zustand';

/**
 * Radial button UI state
 */
export interface RadialButtonUIState {
  isActive: boolean;
  buttonCount: number;
  optionKeyPressed: boolean; // Track actual hardware key state
}

/**
 * Initial radial button UI state
 */
export const INITIAL_RADIAL_BUTTON_STATE: RadialButtonUIState = {
  isActive: false,
  buttonCount: 6,
  optionKeyPressed: false
};

/**
 * Radial buttons slice - owns radial button UI state
 */
export interface RadialButtonsSlice {
  radialButtonUI: RadialButtonUIState;
  setRadialButtonUIActive: (active: boolean) => void;
  setRadialButtonCount: (count: number) => void;
  setOptionKeyPressed: (pressed: boolean) => void;
}

/**
 * Creates the radial buttons slice
 */
export const createRadialButtonsSlice: StateCreator<
  RadialButtonsSlice,
  [],
  [],
  RadialButtonsSlice
> = (set) => ({
  radialButtonUI: INITIAL_RADIAL_BUTTON_STATE,

  setRadialButtonUIActive: (active) => set((state) => ({
    radialButtonUI: {
      ...state.radialButtonUI,
      isActive: active
    }
  })),

  setRadialButtonCount: (count) => set((state) => ({
    radialButtonUI: {
      ...state.radialButtonUI,
      buttonCount: count
    }
  })),

  setOptionKeyPressed: (pressed) => set((state) => ({
    radialButtonUI: {
      ...state.radialButtonUI,
      optionKeyPressed: pressed
    }
  })),
});
