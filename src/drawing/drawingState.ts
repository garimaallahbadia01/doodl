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
    try {
        undoStack.push(drawingCtx.getImageData(0, 0, drawingCanvas.width, drawingCanvas.height));
        if (undoStack.length > UNDO_HISTORY_LIMIT) {
            undoStack.shift();
        }
        redoStack = [];
    } catch (e) {
        console.warn('Undo snapshot failed (memory):', e);
    }
}

export function performUndo() {
    if (undoStack.length > 0) {
        try {
            redoStack.push(drawingCtx.getImageData(0, 0, drawingCanvas.width, drawingCanvas.height));
            const previous = undoStack.pop();
            if (previous) drawingCtx.putImageData(previous, 0, 0);
        } catch (e) {
            console.warn('Undo snapshot failed (memory):', e);
        }
        flashAction('undo');
    } else {
        showUndoRedoStatus('Nothing to undo');
    }
}

export function performRedo() {
    if (redoStack.length > 0) {
        try {
            undoStack.push(drawingCtx.getImageData(0, 0, drawingCanvas.width, drawingCanvas.height));
            const next = redoStack.pop();
            if (next) drawingCtx.putImageData(next, 0, 0);
        } catch (e) {
            console.warn('Undo snapshot failed (memory):', e);
        }
        flashAction('redo');
    } else {
        showUndoRedoStatus('Nothing to redo');
    }
}

export function clearCanvas() {
    saveCanvasState();
    drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
}

export function downloadCanvas() {
    if (!drawingCanvas) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = drawingCanvas.width;
    tempCanvas.height = drawingCanvas.height;
    const tempCtx = tempCanvas.getContext('2d')!;

    // Black background
    tempCtx.fillStyle = '#0a0a0f';
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
