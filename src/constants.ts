// ----------------------------------------------------
// Core Gesture Recognition Thresholds
// ----------------------------------------------------
export const PINCH_START_THRESHOLD = 0.16;
export const PINCH_END_THRESHOLD = 0.28;
export const PINCH_RELEASE_TIMEOUT = 120;
export const MIN_MOVE_THRESHOLD = 2.0;
export const SMOOTHING_BUFFER_SIZE = 20;
export const DOT_HOLD_TIME = 200;

// ----------------------------------------------------
// UI Rendering & Smoothing Bounds
// ----------------------------------------------------
export const STROKE_WIDTH_DEFAULT = 3;
export const STROKE_WIDTH_MIN = 1;
export const STROKE_WIDTH_MAX = 20;
export const ERASER_WIDTH_SCALE = 10;

// ----------------------------------------------------
// Advanced Kinematic and Timing Settings
// ----------------------------------------------------
export const INDEX_EXTENSION_RATIO = 1.30;
export const OTHERS_EXTENSION_RATIO = 1.30;
export const FAST_MOVEMENT_THRESHOLD = 5000;
export const PALM_HISTORY_SIZE = 8;
export const PALM_STABILITY_THRESHOLD = 32;
export const PALM_HOLD_TIME = 500;
export const FIST_HOLD_TIME = 1000;
export const FIST_ARC_COLOR = '#FF3333';
export const PALM_ARC_COLOR = '#34C759';
export const UNDO_HOLD_TIME = 800;
export const UNDO_ARC_COLOR = '#999999';
export const REDO_HOLD_TIME = 800;
export const REDO_ARC_COLOR = '#4488FF';
export const MODE_BADGE_PULSE_DURATION = 200;
export const PICKER_COLORS = [
    '#000000', '#FFFFFF', '#FF3B30', '#FF9500',
    '#34C759', '#007AFF', '#AF52DE'
];

// ----------------------------------------------------
// Undo/Redo Timing Limits
// ----------------------------------------------------
export const UNDO_REPEAT_DELAY = 500;
export const UNDO_REPEAT_INTERVAL = 300;
export const UNDO_HISTORY_LIMIT = 10;
export const SWATCH_HIT_RADIUS = 28;
export const CURSOR_SMOOTHING_BUFFER_SIZE = 12;
export const CURSOR_DEAD_ZONE = 3;
export const COLOR_PICKER_RADIUS = 60;