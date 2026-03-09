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
    lastUndoTime: number;
    lastRedoTime: number;
    wasHoldingUndo?: boolean;
    wasHoldingRedo?: boolean;
    isDarkMode: boolean;
}

export interface StrokeSegment {
    prevX: number; prevY: number;
    midX: number; midY: number;
    lastMidX: number; lastMidY: number;
    color: string;
    width: number;
    mode: Mode;
}

export interface Stroke {
    type?: 'clear' | 'erase_strokes';
    mode: Mode;
    color: string;
    width: number;
    segments: StrokeSegment[];
    dot?: Point2D;
    erasedStrokes?: { index: number; stroke: Stroke }[];
}
