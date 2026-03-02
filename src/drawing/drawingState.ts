import { UNDO_HISTORY_LIMIT } from '../constants';
import { flashAction, showUndoRedoStatus } from '../ui/uiComponents';

export let drawingCanvas: HTMLCanvasElement;
export let drawingCtx: CanvasRenderingContext2D;

export let undoStack: ImageData[] = [];
export let redoStack: ImageData[] = [];

export function initDrawingState(canvas: HTMLCanvasElement) {
    drawingCanvas = canvas;
    drawingCtx = canvas.getContext('2d') as CanvasRenderingContext2D;
}

export function saveCanvasState() {
    if (!drawingCtx || !drawingCanvas) return;
    undoStack.push(drawingCtx.getImageData(0, 0, drawingCanvas.width, drawingCanvas.height));
    if (undoStack.length > UNDO_HISTORY_LIMIT) {
        undoStack.shift();
    }
    redoStack = [];
}

export function performUndo() {
    if (undoStack.length > 0) {
        redoStack.push(drawingCtx.getImageData(0, 0, drawingCanvas.width, drawingCanvas.height));
        const previous = undoStack.pop();
        if (previous) drawingCtx.putImageData(previous, 0, 0);
        flashAction('undo');
    } else {
        showUndoRedoStatus('Nothing to undo');
    }
}

export function performRedo() {
    if (redoStack.length > 0) {
        undoStack.push(drawingCtx.getImageData(0, 0, drawingCanvas.width, drawingCanvas.height));
        const next = redoStack.pop();
        if (next) drawingCtx.putImageData(next, 0, 0);
        flashAction('redo');
    } else {
        showUndoRedoStatus('Nothing to redo');
    }
}

export function clearCanvas() {
    saveCanvasState();
    drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
}
