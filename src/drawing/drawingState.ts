import { UNDO_HISTORY_LIMIT } from '../constants';
import { flashAction, showUndoRedoStatus } from '../ui/uiComponents';
import { Stroke } from '../types';
import { appState } from '../core/appState';

export let drawingCanvas: HTMLCanvasElement;
export let drawingCtx: CanvasRenderingContext2D;

export let undoStack: Stroke[] = [];
export let redoStack: Stroke[] = [];
export let currentStroke: Stroke | null = null;

export function initDrawingState(canvas: HTMLCanvasElement) {
    drawingCanvas = canvas;
    drawingCtx = canvas.getContext('2d') as CanvasRenderingContext2D;
}

export function saveCanvasState() {
    if (!drawingCtx || !drawingCanvas) return;
    currentStroke = {
        mode: appState.currentMode,
        color: appState.currentColor,
        width: appState.currentStrokeWidth,
        segments: []
    };
    redoStack = [];
}

export function commitStroke() {
    if (currentStroke && (currentStroke.segments.length > 0 || currentStroke.dot || currentStroke.type === 'clear')) {
        undoStack.push(currentStroke);
        if (undoStack.length > UNDO_HISTORY_LIMIT) {
            undoStack.shift();
        }
    }
    currentStroke = null;
}

function redrawAll() {
    drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    for (const stroke of undoStack) {
        if (stroke.type === 'clear') {
            drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
            continue;
        }

        drawingCtx.save();
        drawingCtx.globalCompositeOperation = stroke.mode === 'ERASE' ? 'destination-out' : 'source-over';
        drawingCtx.strokeStyle = stroke.mode === 'ERASE' ? '#000' : stroke.color;
        drawingCtx.lineWidth = stroke.width;
        drawingCtx.lineCap = 'round';
        drawingCtx.lineJoin = 'round';

        if (stroke.dot) {
            drawingCtx.beginPath();
            drawingCtx.arc(stroke.dot.x, stroke.dot.y, stroke.width / 2, 0, Math.PI * 2);
            drawingCtx.fillStyle = drawingCtx.strokeStyle;
            drawingCtx.fill();
        } else if (stroke.segments.length > 0) {
            drawingCtx.beginPath();
            for (let i = 0; i < stroke.segments.length; i++) {
                const seg = stroke.segments[i];
                if (i === 0) drawingCtx.moveTo(seg.lastMidX, seg.lastMidY);
                drawingCtx.quadraticCurveTo(seg.prevX, seg.prevY, seg.midX, seg.midY);
            }
            drawingCtx.stroke();
        }
        drawingCtx.restore();
    }
}

export function performUndo() {
    if (undoStack.length > 0) {
        redoStack.push(undoStack.pop()!);
        redrawAll();
        flashAction('undo');
    } else {
        showUndoRedoStatus('Nothing to undo');
    }
}

export function performRedo() {
    if (redoStack.length > 0) {
        undoStack.push(redoStack.pop()!);
        redrawAll();
        flashAction('redo');
    } else {
        showUndoRedoStatus('Nothing to redo');
    }
}

export function clearCanvas() {
    undoStack.push({ type: 'clear', mode: 'DRAW', color: '', width: 0, segments: [] });
    drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
}

export function downloadCanvas() {
    if (!drawingCanvas) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = drawingCanvas.width;
    tempCanvas.height = drawingCanvas.height;
    const tempCtx = tempCanvas.getContext('2d')!;

    // White background
    tempCtx.fillStyle = '#FFFFFF';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    tempCtx.drawImage(drawingCanvas, 0, 0);

    const dataUrl = tempCanvas.toDataURL('image/png', 1.0);
    const link = document.createElement('a');

    // YYYY-MM-DD format
    const date = new Date();
    const iso = date.toISOString().split('T')[0];
    const time = `${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}`;
    link.download = `doodle-${iso}-${time}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    flashAction('redo'); // Reuse flash anim temporarily
}
