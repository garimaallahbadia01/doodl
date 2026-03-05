import { Mode, AppState } from '../types';
import { STROKE_WIDTH_DEFAULT } from '../constants';

export const appState: AppState = {
    currentColor: '#000000',
    currentColorIndex: 0,
    currentMode: 'DRAW' as Mode,
    currentStrokeWidth: STROKE_WIDTH_DEFAULT,
    isColorPickerOpen: false,
    highlightedSwatchIdx: -1,
    pickerAnchor: { x: 0, y: 0 },
    wasPinching: false,
    wasPointing: false,
    palmHoldStart: 0,
    fistHoldStart: 0,
    undoHoldStart: 0,
    lastUndoTime: 0,
    redoHoldStart: 0,
    lastRedoTime: 0,
    isDarkMode: localStorage.getItem('doodle_theme') === 'dark'
};
