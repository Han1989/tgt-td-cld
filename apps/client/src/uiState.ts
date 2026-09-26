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

/** A skill being aimed by dragging its touch button (tile units). */
export interface AimState {
  slot: SkillSlot;
  x: number;
  y: number;
  /** The finger is back on the button: releasing cancels. */
  cancel: boolean;
}

/** Client-only UI state shared by input, renderer and HUD. Never game state. */
export interface UiState {
  mode: InputMode;
  /** Pointer position in tile units, or null when off the canvas. */
  hover: { x: number; y: number } | null;
  selectedTowerId: number | null;
  selectedPadId: number | null;
  markers: ClickMarker[];
  /** Radial build menu: the tower previewed on a pad (first tap), before the second tap builds it. */
  preview: { padId: number; tower: TowerKind } | null;
  aim: AimState | null;
}

export function createUiState(): UiState {
  return { mode: { type: 'none' }, hover: null, selectedTowerId: null, selectedPadId: null, markers: [], preview: null, aim: null };
}
