import { StateCreator } from 'zustand';
import type { UrlMetadata } from '../../core/utils/url-utils';

/**
 * Proto-node for node creation
 */
export interface ProtoNode {
  title: string;
  type: 'dream' | 'dreamer';
  dreamTalkFile?: globalThis.File;
  additionalFiles?: globalThis.File[];
  position: [number, number, number];
  urlMetadata?: UrlMetadata;
}

/**
 * Validation errors for creation
 */
export interface ValidationErrors {
  title?: string;
  dreamTalk?: string;
}

/**
 * Creation state types
 */
export interface CreationState {
  isCreating: boolean;
  protoNode: ProtoNode | null;
  validationErrors: ValidationErrors;
}

/**
 * Initial state for creation mode
 */
export const INITIAL_CREATION_STATE: CreationState = {
  isCreating: false,
  protoNode: null,
  validationErrors: {}
};

/**
 * Creation state slice interface
 */
export interface CreationSlice {
  creationState: CreationState;
  startCreation: (position: [number, number, number]) => void;
  startCreationWithData: (position: [number, number, number], initialData?: Partial<ProtoNode>) => void;
  updateProtoNode: (updates: Partial<ProtoNode>) => void;
  setValidationErrors: (errors: ValidationErrors) => void;
  completeCreation: () => void;
  cancelCreation: () => void;
}

/**
 * Creates the creation state slice
 */
export const createCreationSlice: StateCreator<
  CreationSlice,
  [],
  [],
  CreationSlice
> = (set) => ({
  creationState: INITIAL_CREATION_STATE,

  startCreation: (position) => set(() => ({
    creationState: {
      isCreating: true,
      protoNode: {
        title: '',
        type: 'dream', // Default to dream type
        position,
        dreamTalkFile: undefined
      },
      validationErrors: {}
    }
  })),

  startCreationWithData: (position, initialData) => set(() => ({
    creationState: {
      isCreating: true,
      protoNode: {
        title: initialData?.title || '',
        type: initialData?.type || 'dream',
        position,
        dreamTalkFile: initialData?.dreamTalkFile || undefined,
        additionalFiles: initialData?.additionalFiles || undefined
      },
      validationErrors: {}
    }
  })),

  updateProtoNode: (updates) => set((state) => ({
    creationState: {
      ...state.creationState,
      protoNode: state.creationState.protoNode
        ? { ...state.creationState.protoNode, ...updates }
        : null
    }
  })),

  setValidationErrors: (errors) => set((state) => ({
    creationState: {
      ...state.creationState,
      validationErrors: errors
    }
  })),

  completeCreation: () => set(() => ({
    creationState: INITIAL_CREATION_STATE
  })),

  cancelCreation: () => set(() => ({
    creationState: INITIAL_CREATION_STATE
  })),
});

/**
 * Re-export types for convenience
 */
export type { UrlMetadata };
