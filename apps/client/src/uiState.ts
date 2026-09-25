import type { SkillSlot, TowerKind } from '@tdt/protocol';

/** What a left-click currently means. */
export type InputMode =
  | { type: 'none' }
  | { type: 'attackMove' }
  | { type: 'target'; slot: SkillSlot }
  /** B pressed, waiting for a tower hotkey. */
  | { type: 'buildMenu' }
  | { type: 'build'; tower: TowerKind };

export interface ClickMarker {
  x: number;
  y: number;
  color: number;
  born: number;
}

/** Client-only UI state shared by input, renderer and HUD. Never game state. */
export interface UiState {
  mode: InputMode;
  /** Pointer position in tile units, or null when off the canvas. */
  hover: { x: number; y: number } | null;
  selectedTowerId: number | null;
  selectedPadId: number | null;
  markers: ClickMarker[];
}

export function createUiState(): UiState {
  return { mode: { type: 'none' }, hover: null, selectedTowerId: null, selectedPadId: null, markers: [] };
}
