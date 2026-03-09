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
        redoStack.push(undoStack.pop()!);
        if (redoStack.length > UNDO_HISTORY_LIMIT) {
            redoStack.shift();
        }
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
