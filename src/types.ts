export interface Point2D {
    x: number;
    y: number;
}

export interface HandState {
    posBuffer: Point2D[];
    prevX: number | null;
    prevY: number | null;
    lastMidX: number | null;
    lastMidY: number | null;
    holdStart: number | null;
    dotDrawn: boolean;
}

export type Mode = 'DRAW' | 'ERASE';

export type PoseMode =
    | 'POINT'
    | 'TWO_FINGERS'
    | 'THUMBS_UP'
    | 'THUMBS_DOWN'
    | 'OPEN_PALM'
    | 'FIST'
    | 'NEUTRAL';

export interface AppState {
    currentColor: string;
    currentColorIndex: number;
    currentMode: Mode;
    currentStrokeWidth: number;
    isColorPickerOpen: boolean;
    highlightedSwatchIdx: number;
    pickerAnchor: Point2D;
    wasPinching: boolean;
    wasPointing: boolean;
    palmHoldStart: number;
    fistHoldStart: number;
    undoHoldStart: number;
    lastUndoTime: number;
    redoHoldStart: number;
    lastRedoTime: number;
}
