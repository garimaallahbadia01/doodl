import { UNDO_HISTORY_LIMIT } from '../constants';
import { flashAction, showUndoRedoStatus } from '../ui/uiComponents';
import { distToSegmentSquared } from '../utils/math';
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
    // Note: Do NOT clear redoStack here. Wait until commitStroke() verifies 
    // that actual drawing happened, to prevent accidental gesture transitions
    // from wiping the redo history.
}

export function commitStroke() {
    if (currentStroke && (currentStroke.segments.length > 0 || currentStroke.dot || currentStroke.type === 'clear')) {
        undoStack.push(currentStroke);
        redoStack = []; // Clear redo stack only when a real stroke is committed
        if (undoStack.length > UNDO_HISTORY_LIMIT) {
            undoStack.shift();
        }
    }
    currentStroke = null;
}

export function redrawAll() {
    drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    for (const stroke of undoStack) {
        if (stroke.type === 'clear') {
            drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
            continue;
        }
        if (stroke.type === 'erase_strokes') continue;

        drawingCtx.save();
        drawingCtx.lineCap = 'round';
        drawingCtx.lineJoin = 'round';

        if (stroke.dot) {
            drawingCtx.globalCompositeOperation = stroke.mode === 'ERASE' ? 'destination-out' : 'source-over';
            drawingCtx.fillStyle = stroke.mode === 'ERASE' ? '#000' : stroke.color;
            drawingCtx.beginPath();
            drawingCtx.arc(stroke.dot.x, stroke.dot.y, stroke.width / 2, 0, Math.PI * 2);
            drawingCtx.fill();
        } else if (stroke.segments.length > 0) {
            // Render stroke segment by segment to respect dynamic metadata (color/width/mode)
            for (let i = 0; i < stroke.segments.length; i++) {
                const seg = stroke.segments[i];

                // Set styles dynamically for this specific segment
                drawingCtx.globalCompositeOperation = seg.mode === 'ERASE' ? 'destination-out' : 'source-over';
                drawingCtx.strokeStyle = seg.mode === 'ERASE' ? '#000' : seg.color;
                drawingCtx.lineWidth = seg.width;

                drawingCtx.beginPath();
                drawingCtx.moveTo(seg.lastMidX, seg.lastMidY);
                drawingCtx.quadraticCurveTo(seg.prevX, seg.prevY, seg.midX, seg.midY);
                drawingCtx.stroke();
            }
        }
        drawingCtx.restore();
    }
}

export function performUndo() {
    if (undoStack.length > 0) {
        const action = undoStack.pop()!;
        redoStack.push(action);
        if (redoStack.length > UNDO_HISTORY_LIMIT) {
            redoStack.shift();
        }

        if (action.type === 'erase_strokes' && action.erasedStrokes) {
            // Restore erased strokes in ascending order of original index
            [...action.erasedStrokes].sort((a, b) => a.index - b.index).forEach(({ index, stroke }) => {
                undoStack.splice(index, 0, stroke);
            });
        }

        redrawAll();
        flashAction('undo');
    } else {
        showUndoRedoStatus('Nothing to undo');
    }
}

export function performRedo() {
    if (redoStack.length > 0) {
        const action = redoStack.pop()!;
        undoStack.push(action);

        if (action.type === 'erase_strokes' && action.erasedStrokes) {
            // Re-remove strokes in descending order of original index
            [...action.erasedStrokes].sort((a, b) => b.index - a.index).forEach(({ index }) => {
                undoStack.splice(index, 1);
            });
        }

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

export function eraseStrokesAt(x: number, y: number, radius: number) {
    const r2 = radius * radius;
    const toRemove: { index: number, stroke: Stroke }[] = [];
    const p = { x, y };

    for (let i = undoStack.length - 1; i >= 0; i--) {
        const stroke = undoStack[i];
        if (stroke.type === 'clear' || stroke.type === 'erase_strokes') continue;

        let hit = false;
        if (stroke.dot) {
            const dx = stroke.dot.x - x;
            const dy = stroke.dot.y - y;
            hit = (dx * dx + dy * dy) <= r2;
        } else {
            // Add a small buffer to the stroke's visual width to make erasing easier
            const strokeR2 = Math.pow(radius + (stroke.width / 2) + 2, 2);
            for (const seg of stroke.segments) {
                // Approx segment to check
                const v = { x: seg.prevX, y: seg.prevY };
                const w = { x: seg.midX, y: seg.midY };
                if (distToSegmentSquared(p, v, w) <= strokeR2) {
                    hit = true;
                    break;
                }
            }
        }

        if (hit) {
            toRemove.push({ index: i, stroke });
            // Erase from array
            undoStack.splice(i, 1);
        }
    }

    if (toRemove.length > 0) {
        undoStack.push({ type: 'erase_strokes', mode: 'DRAW', color: '', width: 0, segments: [], erasedStrokes: toRemove });
        redoStack = [];
        if (undoStack.length > UNDO_HISTORY_LIMIT) {
            undoStack.shift();
        }
        redrawAll();
    }
}

export function openExportModal() {
    if (!drawingCanvas) return;

    const modal = document.getElementById('exportModal')!;
    const previewCanvas = document.getElementById('exportPreviewCanvas') as HTMLCanvasElement;
    const previewCtx = previewCanvas.getContext('2d')!;

    // Size preview canvas to match drawing canvas aspect ratio
    previewCanvas.width = drawingCanvas.width;
    previewCanvas.height = drawingCanvas.height;

    // Draw white background + drawing
    previewCtx.fillStyle = '#F7F6F2'; // Match our surface color
    previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
    previewCtx.drawImage(drawingCanvas, 0, 0);

    // Show modal
    modal.classList.add('visible');
    modal.setAttribute('aria-hidden', 'false');

    // Wire up buttons (only once)
    const closeBtn = document.getElementById('exportCloseBtn')!;
    const downloadBtn = document.getElementById('exportDownloadBtn')!;

    const handleClose = () => {
        modal.classList.remove('visible');
        modal.setAttribute('aria-hidden', 'true');
        closeBtn.removeEventListener('click', handleClose);
        downloadBtn.removeEventListener('click', handleDownload);
        modal.removeEventListener('click', handleBackdropClick);
    };

    const handleDownload = () => {
        finalizeDownload();
        handleClose();
    };

    const handleBackdropClick = (e: Event) => {
        if (e.target === modal) handleClose();
    };

    closeBtn.addEventListener('click', handleClose);
    downloadBtn.addEventListener('click', handleDownload);
    modal.addEventListener('click', handleBackdropClick);
}

function finalizeDownload() {
    if (!drawingCanvas) return;

    const titleInput = document.getElementById('exportTitle') as HTMLInputElement;
    const title = titleInput.value.trim();

    // Build final export canvas with metadata burned in
    const padding = 60;
    const footerHeight = title ? 48 : 0;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = drawingCanvas.width + padding * 2;
    exportCanvas.height = drawingCanvas.height + padding * 2 + footerHeight;
    const ctx = exportCanvas.getContext('2d')!;

    // Background
    ctx.fillStyle = '#F7F6F2';
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    // Drawing
    ctx.drawImage(drawingCanvas, padding, padding);

    // Footer text
    if (title) {
        const footerY = padding + drawingCanvas.height + 20;
        ctx.font = '14px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#928C86';
        ctx.textAlign = 'left';
        ctx.fillText(title, padding, footerY);
    }

    // Branding watermark
    ctx.font = '600 14px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(67, 64, 61, 0.3)';
    ctx.textAlign = 'right';
    ctx.fillText('doodle', exportCanvas.width - padding, exportCanvas.height - 16);

    // Download
    const dataUrl = exportCanvas.toDataURL('image/png', 1.0);
    const link = document.createElement('a');
    const date = new Date();
    const iso = date.toISOString().split('T')[0];
    const time = `${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}`;
    const slug = title ? `-${title.toLowerCase().replace(/\s+/g, '-').slice(0, 20)}` : '';
    link.download = `doodle-${iso}-${time}${slug}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    flashAction('redo');
}
