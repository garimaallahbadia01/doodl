import { appState } from '../core/appState';
import { CURSOR_SMOOTHING_BUFFER_SIZE, CURSOR_DEAD_ZONE, FIST_ARC_COLOR, FIST_HOLD_TIME, SMOOTHING_BUFFER_SIZE } from '../constants';
import { Point2D } from '../types';

let cursorBuffer: Point2D[] = [];
let displayedCursorX = 0;
let displayedCursorY = 0;
let fingerCursor: HTMLElement;

export function initHandVisualizer() {
    fingerCursor = document.getElementById('fingerCursor')!;
}

function calculateWeightedAverage(buffer: Point2D[]): Point2D {
    let totalWeight = 0, smoothX = 0, smoothY = 0;
    buffer.forEach((pos, i) => {
        const weight = i + 1;
        smoothX += pos.x * weight;
        smoothY += pos.y * weight;
        totalWeight += weight;
    });
    return { x: smoothX / totalWeight, y: smoothY / totalWeight };
}

export function getSmoothedPosition(buffer: Point2D[], rawX: number, rawY: number): Point2D {
    buffer.push({ x: rawX, y: rawY });
    if (buffer.length > SMOOTHING_BUFFER_SIZE) buffer.shift();
    return calculateWeightedAverage(buffer);
}

export function updateCursor(fingerPos: Point2D, pose: string, fistHoldStart: number) {
    if (!fingerCursor) return;

    if (pose === 'POINT') {
        displayedCursorX = fingerPos.x;
        displayedCursorY = fingerPos.y;
        cursorBuffer = [];
        fingerCursor.style.transition = 'none';
    } else {
        fingerCursor.style.transition = '';
        cursorBuffer.push({ x: fingerPos.x, y: fingerPos.y });
        if (cursorBuffer.length > CURSOR_SMOOTHING_BUFFER_SIZE) cursorBuffer.shift();

        const smoothed = calculateWeightedAverage(cursorBuffer);
        const smoothX = smoothed.x;
        const smoothY = smoothed.y;

        if (Math.hypot(smoothX - displayedCursorX, smoothY - displayedCursorY) > CURSOR_DEAD_ZONE) {
            displayedCursorX = smoothX;
            displayedCursorY = smoothY;
        }
    }

    fingerCursor.style.left = `${displayedCursorX}px`;
    fingerCursor.style.top = `${displayedCursorY}px`;

    fingerCursor.classList.remove('drawing', 'erasing', 'picking', 'fist-hold', 'pinching');
    fingerCursor.style.width = '';
    fingerCursor.style.height = '';

    if (pose === 'POINT' && appState.currentMode === 'DRAW') {
        fingerCursor.classList.add('drawing');
    } else if (pose === 'POINT' && appState.currentMode === 'ERASE') {
        fingerCursor.classList.add('erasing');
    } else if (appState.isColorPickerOpen) {
        fingerCursor.classList.add('picking');
    } else if (pose === 'FIST') {
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
    if (pose === 'FIST') return FIST_ARC_COLOR;
    return '#1e3a5f';
}
