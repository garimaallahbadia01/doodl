import { appState } from '../core/appState';
import { CURSOR_SMOOTHING_BUFFER_SIZE, CURSOR_DEAD_ZONE, FIST_ARC_COLOR, FIST_HOLD_TIME, SMOOTHING_BUFFER_SIZE } from '../constants';
import { Point2D } from '../types';
import { calculateWeightedAverage } from '../utils/math';
import { isPinching } from '../core/gestureDetector';

let cursorBuffer: Point2D[] = [];
export let displayedCursorX = 0;
export let displayedCursorY = 0;
let fingerCursor: HTMLElement;

export function initHandVisualizer() {
    fingerCursor = document.getElementById('fingerCursor')!;
}

export function getSmoothedPosition(buffer: Point2D[], rawX: number, rawY: number): Point2D {
    buffer.push({ x: rawX, y: rawY });
    if (buffer.length > SMOOTHING_BUFFER_SIZE) buffer.shift();
    return calculateWeightedAverage(buffer);
}

export function updateCursor(fingerPos: Point2D, pose: string, fistHoldStart: number) {
    if (!fingerCursor) return;

    // Unified cursor smoothing: always use a buffer to prevent jitter and jumps
    cursorBuffer.push({ x: fingerPos.x, y: fingerPos.y });
    if (cursorBuffer.length > CURSOR_SMOOTHING_BUFFER_SIZE) cursorBuffer.shift();

    const smoothed = calculateWeightedAverage(cursorBuffer);
    const smoothX = smoothed.x;
    const smoothY = smoothed.y;

    // Only update displayed position if it moves beyond a tiny dead zone to prevent tiny vibrations
    if (Math.hypot(smoothX - displayedCursorX, smoothY - displayedCursorY) > CURSOR_DEAD_ZONE) {
        displayedCursorX = smoothX;
        displayedCursorY = smoothY;
    }

    // Center the cursor dot on the fingertip (offset by half cursor size)
    fingerCursor.style.transform = `translate(${displayedCursorX - 7}px, ${displayedCursorY - 7}px)`;

    fingerCursor.classList.remove('drawing', 'erasing', 'picking', 'fist-hold', 'pinching');
    fingerCursor.style.width = '';
    fingerCursor.style.height = '';

    if (pose === 'POINT' && appState.currentMode === 'DRAW') {
        fingerCursor.classList.add('drawing');
    } else if (pose === 'POINT' && appState.currentMode === 'ERASE') {
        fingerCursor.classList.add('erasing');
    } else if (appState.isColorPickerOpen) {
        fingerCursor.classList.add('picking');
    } else if (pose === 'FIST' && !isPinching) {
        fingerCursor.classList.add('fist-hold');
        if (fistHoldStart > 0) {
            const progress = Math.min((performance.now() - fistHoldStart) / FIST_HOLD_TIME, 1);
            const size = 12 + progress * 20;
            fingerCursor.style.width = `${size}px`;
            fingerCursor.style.height = `${size}px`;
        }
    }
}

export function getSkeletonColor(pose: string): string {
    if (appState.currentMode === 'ERASE') return '#FF8C00';
    if (pose === 'FIST' && !isPinching) return FIST_ARC_COLOR;
    return '#1e3a5f';
}
