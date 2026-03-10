import { HandState } from '../types';
import { MIN_MOVE_THRESHOLD } from '../constants';
import { drawingCtx, currentStroke, commitStroke } from './drawingState';
import { appState } from '../core/appState';

export const handState: HandState = {
    posBuffer: [],
    prevX: null,
    prevY: null,
    lastMidX: null,
    lastMidY: null,
    holdStart: null,
    dotDrawn: false
};

export function resetHandState() {
    handState.posBuffer = [];
    handState.prevX = null;
    handState.prevY = null;
    handState.lastMidX = null;
    handState.lastMidY = null;
    handState.holdStart = null;
    handState.dotDrawn = false;
}

export function drawStroke(currX: number, currY: number) {
    if (handState.prevX === null || handState.prevY === null) {
        handState.prevX = currX;
        handState.prevY = currY;
        handState.lastMidX = currX;
        handState.lastMidY = currY;
        handState.holdStart = performance.now();
        return;
    }

    const dx = currX - handState.prevX;
    const dy = currY - handState.prevY;
    const dist = Math.hypot(dx, dy);

    // Jump Protection: If the hand moves > 80px in one frame, it's a tracking glitch.
    if (dist > 80) {
        handState.prevX = currX;
        handState.prevY = currY;
        handState.lastMidX = currX;
        handState.lastMidY = currY;
        return;
    }

    if (dist < MIN_MOVE_THRESHOLD) {
        // No dot logic needed for now, just keep tracking
        return;
    }

    drawingCtx.save();
    drawingCtx.globalCompositeOperation = appState.currentMode === 'ERASE' ? 'destination-out' : 'source-over';
    drawingCtx.strokeStyle = appState.currentMode === 'ERASE' ? '#000' : appState.currentColor;
    drawingCtx.lineWidth = appState.currentMode === 'ERASE' ? appState.currentStrokeWidth * 2.5 : appState.currentStrokeWidth;
    drawingCtx.lineCap = 'round';
    drawingCtx.lineJoin = 'round';

    const midX = (handState.prevX + currX) / 2;
    const midY = (handState.prevY + currY) / 2;

    const startX = handState.lastMidX ?? handState.prevX;
    const startY = handState.lastMidY ?? handState.prevY;

    drawingCtx.beginPath();
    drawingCtx.moveTo(startX, startY);
    drawingCtx.quadraticCurveTo(handState.prevX, handState.prevY, midX, midY);
    drawingCtx.stroke();
    drawingCtx.restore();

    if (currentStroke) {
        currentStroke.segments.push({
            prevX: handState.prevX, prevY: handState.prevY,
            midX, midY,
            lastMidX: startX,
            lastMidY: startY,
            color: appState.currentColor,
            width: appState.currentMode === 'ERASE' ? appState.currentStrokeWidth * 2.5 : appState.currentStrokeWidth,
            mode: appState.currentMode
        });
    }

    handState.prevX = currX;
    handState.prevY = currY;
    handState.lastMidX = midX;
    handState.lastMidY = midY;
    handState.holdStart = performance.now();
    handState.dotDrawn = false;
}

export function endStroke() {
    handState.prevX = null;
    handState.prevY = null;
    handState.lastMidX = null;
    handState.lastMidY = null;
    handState.holdStart = null;
    handState.dotDrawn = false;
    commitStroke();
}
