import { HandState } from '../types';
import { MIN_MOVE_THRESHOLD, DOT_HOLD_TIME, ERASER_WIDTH_SCALE } from '../constants';
import { drawingCtx } from './drawingState';
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

    if (dist < MIN_MOVE_THRESHOLD) {
        if (!handState.dotDrawn && handState.holdStart !== null) {
            if (performance.now() - handState.holdStart > DOT_HOLD_TIME) {
                drawingCtx.save();
                if (appState.currentMode === 'ERASE') {
                    drawingCtx.globalCompositeOperation = 'destination-out';
                }
                const width = appState.currentMode === 'ERASE'
                    ? appState.currentStrokeWidth * ERASER_WIDTH_SCALE
                    : appState.currentStrokeWidth;

                drawingCtx.beginPath();
                drawingCtx.arc(currX, currY, width / 2, 0, Math.PI * 2);
                drawingCtx.fillStyle = appState.currentMode === 'ERASE' ? '#000' : appState.currentColor;
                drawingCtx.fill();
                drawingCtx.restore();
                drawingCtx.globalCompositeOperation = 'source-over';
                handState.dotDrawn = true;
            }
        }
        return;
    }

    drawingCtx.save();
    if (appState.currentMode === 'ERASE') {
        drawingCtx.globalCompositeOperation = 'destination-out';
        drawingCtx.strokeStyle = '#000';
        drawingCtx.lineWidth = appState.currentStrokeWidth * ERASER_WIDTH_SCALE;
    } else {
        drawingCtx.globalCompositeOperation = 'source-over';
        drawingCtx.strokeStyle = appState.currentColor;
        drawingCtx.lineWidth = appState.currentStrokeWidth;
    }
    drawingCtx.lineCap = 'round';
    drawingCtx.lineJoin = 'round';

    const midX = (handState.prevX + currX) / 2;
    const midY = (handState.prevY + currY) / 2;

    drawingCtx.beginPath();
    drawingCtx.moveTo(handState.lastMidX || handState.prevX, handState.lastMidY || handState.prevY);
    drawingCtx.quadraticCurveTo(handState.prevX, handState.prevY, midX, midY);
    drawingCtx.stroke();
    drawingCtx.restore();
    drawingCtx.globalCompositeOperation = 'source-over';

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
}
