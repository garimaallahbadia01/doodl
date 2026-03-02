import { appState } from '../core/appState';
import { PICKER_COLORS, COLOR_PICKER_RADIUS, SWATCH_HIT_RADIUS, MODE_BADGE_PULSE_DURATION, FIST_HOLD_TIME, FIST_ARC_COLOR } from '../constants';
import { clearCanvas, downloadCanvas } from '../drawing/drawingState';

let colorPickerEl: HTMLElement;
let modeBadge: HTMLElement;
let badgeIconWrap: HTMLElement;
let badgeLabel: HTMLElement;
let eraserBtn: HTMLElement;
let clearBtn: HTMLElement;
let gridBtn: HTMLElement;
let drawingPanel: HTMLElement;
let actionFlashEl: HTMLElement;
let undoRedoStatus: HTMLElement;
let brushSlider: HTMLInputElement;
let brushPreviewDot: HTMLElement;
let clearFlashEl: HTMLElement;
let fistProgressEl: HTMLCanvasElement;
let fistCtx: CanvasRenderingContext2D;

let showStatusTimeout: ReturnType<typeof setTimeout> | null = null;

export function initUIComponents() {
    colorPickerEl = document.getElementById('colorPicker')!;
    modeBadge = document.getElementById('modeBadge')!;
    badgeIconWrap = document.getElementById('badgeIconWrap')!;
    badgeLabel = document.getElementById('badgeLabel')!;
    eraserBtn = document.getElementById('eraserBtn')!;
    clearBtn = document.getElementById('clearBtn')!;
    gridBtn = document.getElementById('gridBtn')!;
    drawingPanel = document.getElementById('drawingPanel')!;
    actionFlashEl = document.getElementById('actionFlash')!;
    undoRedoStatus = document.getElementById('undoRedoStatus')!;
    brushSlider = document.getElementById('brushSlider') as HTMLInputElement;
    brushPreviewDot = document.getElementById('brushPreviewDot')!;
    clearFlashEl = document.getElementById('clearFlash')!;
    fistProgressEl = document.getElementById('fistProgress') as HTMLCanvasElement;
    fistCtx = fistProgressEl.getContext('2d')!;

    buildPickerSwatches();

    // Brush slider
    updateBrushPreview();
    brushSlider.addEventListener('input', (e: any) => {
        appState.currentStrokeWidth = parseInt(e.target.value, 10);
        updateBrushPreview();
    });

    eraserBtn.addEventListener('click', () => {
        setMode(appState.currentMode === 'ERASE' ? 'DRAW' : 'ERASE');
    });

    clearBtn.addEventListener('click', () => {
        clearCanvasWithFlash();
    });

    const exportBtn = document.getElementById('exportBtn')!;
    exportBtn.addEventListener('click', () => {
        downloadCanvas();
    });

    gridBtn.addEventListener('click', () => {
        drawingPanel.classList.toggle('grid-enabled');
        gridBtn.classList.toggle('active');
    });
}

function updateBrushPreview() {
    if (!brushPreviewDot) return;
    const size = Math.max(3, appState.currentStrokeWidth);
    brushPreviewDot.style.width = size + 'px';
    brushPreviewDot.style.height = size + 'px';
}

export function buildPickerSwatches() {
    if (!colorPickerEl) return;
    colorPickerEl.innerHTML = '';
    const angleStep = (Math.PI * 2) / PICKER_COLORS.length;
    PICKER_COLORS.forEach((color, i) => {
        const angle = i * angleStep - Math.PI / 2;
        const x = COLOR_PICKER_RADIUS * Math.cos(angle);
        const y = COLOR_PICKER_RADIUS * Math.sin(angle);

        const swatch = document.createElement('div');
        swatch.className = 'picker-swatch';
        swatch.style.backgroundColor = color;
        swatch.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
        swatch.dataset.index = i.toString();
        swatch.dataset.x = x.toString();
        swatch.dataset.y = y.toString();

        colorPickerEl.appendChild(swatch);
    });
}

export function openColorPicker(fingerPos: { x: number, y: number }) {
    appState.isColorPickerOpen = true;
    appState.pickerAnchor = { x: fingerPos.x, y: fingerPos.y };
    if (colorPickerEl) {
        colorPickerEl.style.left = `${appState.pickerAnchor.x}px`;
        colorPickerEl.style.top = `${appState.pickerAnchor.y}px`;
        colorPickerEl.classList.add('visible');
        Array.from(colorPickerEl.children).forEach(s => s.classList.remove('highlighted'));
    }
    appState.highlightedSwatchIdx = -1;
}

export function closeColorPicker() {
    appState.isColorPickerOpen = false;
    if (colorPickerEl) colorPickerEl.classList.remove('visible');
    appState.highlightedSwatchIdx = -1;
}

export function updatePickerHighlight(fingerPos: { x: number, y: number }) {
    if (!appState.isColorPickerOpen || !colorPickerEl) return;
    const dx = fingerPos.x - appState.pickerAnchor.x;
    const dy = fingerPos.y - appState.pickerAnchor.y;

    appState.highlightedSwatchIdx = -1;
    const swatches = Array.from(colorPickerEl.children) as HTMLElement[];
    swatches.forEach(s => s.classList.remove('highlighted'));

    if (Math.hypot(dx, dy) > COLOR_PICKER_RADIUS / 2) {
        let closestIdx = -1;
        let minDist = Infinity;
        swatches.forEach((swatch, i) => {
            const sx = parseFloat(swatch.dataset.x!);
            const sy = parseFloat(swatch.dataset.y!);
            const dist = Math.hypot(dx - sx, dy - sy);
            if (dist < minDist && dist < SWATCH_HIT_RADIUS * 3) {
                minDist = dist;
                closestIdx = i;
            }
        });

        if (closestIdx !== -1) {
            appState.highlightedSwatchIdx = closestIdx;
            swatches[closestIdx].classList.add('highlighted');
        }
    }
}

export function confirmColor() {
    if (appState.highlightedSwatchIdx !== -1) {
        appState.currentColorIndex = appState.highlightedSwatchIdx;
        appState.currentColor = PICKER_COLORS[appState.currentColorIndex];
        syncToolbarSwatches();
    }
    closeColorPicker();
}

export function syncToolbarSwatches() {
    document.querySelectorAll('.swatch').forEach(s => {
        const el = s as HTMLElement;
        el.classList.toggle('active', el.dataset.color === appState.currentColor);
    });
    if (eraserBtn) eraserBtn.classList.remove('active');
}

export function setMode(mode: 'DRAW' | 'ERASE') {
    if (appState.currentMode === mode) return;
    appState.currentMode = mode;
    if (eraserBtn) eraserBtn.classList.toggle('active', mode === 'ERASE');
    if (mode === 'DRAW') {
        syncToolbarSwatches();
    } else {
        document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
    }
    updateModeBadge();
    pulseBadge();
}

export function updateModeBadge() {
    if (!modeBadge) return;
    if (appState.currentMode === 'ERASE') {
        badgeIconWrap.innerHTML = '<img src="/assets/icons/Group_10.svg" alt="Eraser" class="badge-icon">';
        badgeLabel.textContent = 'Erase';
        modeBadge.classList.add('erase-mode');
    } else {
        badgeIconWrap.textContent = '✏️';
        badgeLabel.textContent = 'Draw';
        modeBadge.classList.remove('erase-mode');
    }
}

export function pulseBadge() {
    if (!modeBadge) return;
    modeBadge.classList.remove('pulse');
    void modeBadge.offsetWidth;
    modeBadge.classList.add('pulse');
    setTimeout(() => modeBadge.classList.remove('pulse'), MODE_BADGE_PULSE_DURATION);
}

export function clearCanvasWithFlash() {
    clearCanvas();
    if (clearFlashEl) {
        clearFlashEl.classList.add('flash');
        setTimeout(() => clearFlashEl.classList.remove('flash'), 300);
    }
}

export function flashAction(type: string) {
    if (!actionFlashEl) return;
    actionFlashEl.className = 'action-flash ' + type;
    void actionFlashEl.offsetWidth;
    actionFlashEl.classList.add('flash');
    setTimeout(() => actionFlashEl.classList.remove('flash'), 150);
}

export function showUndoRedoStatus(msg: string) {
    if (!undoRedoStatus) return;
    undoRedoStatus.textContent = msg;
    undoRedoStatus.classList.add('visible');
    if (showStatusTimeout !== null) {
        clearTimeout(showStatusTimeout);
    }
    showStatusTimeout = setTimeout(() => undoRedoStatus.classList.remove('visible'), 1000);
}

export function updateFistProgress(fingerPos: { x: number, y: number }, fistHoldStart: number) {
    if (!fistProgressEl || !fistCtx) return;
    if (fistHoldStart <= 0) {
        fistProgressEl.classList.remove('visible');
        return;
    }
    const progress = Math.min((performance.now() - fistHoldStart) / FIST_HOLD_TIME, 1);
    fistProgressEl.classList.add('visible');
    fistProgressEl.style.left = `${fingerPos.x - 24}px`;
    fistProgressEl.style.top = `${fingerPos.y - 24}px`;

    fistCtx.clearRect(0, 0, 48, 48);
    fistCtx.strokeStyle = FIST_ARC_COLOR;
    fistCtx.globalAlpha = 0.9;
    fistCtx.lineWidth = 3;
    fistCtx.lineCap = 'round';
    fistCtx.beginPath();
    fistCtx.arc(24, 24, 20, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    fistCtx.stroke();
    fistCtx.globalAlpha = 1;
}

export function setupDraggablePIP(el: HTMLElement) {
    let isDragging = false;
    let dragStartX: number, dragStartY: number, pipStartLeft: number, pipStartTop: number;

    el.addEventListener('mousedown', (e) => {
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        const rect = el.getBoundingClientRect();
        pipStartLeft = rect.left;
        pipStartTop = rect.top;
        el.classList.add('dragging');
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        let newLeft = pipStartLeft + (e.clientX - dragStartX);
        let newTop = pipStartTop + (e.clientY - dragStartY);

        const padding = 20;
        newLeft = Math.max(padding, Math.min(newLeft, window.innerWidth - el.offsetWidth - padding));
        newTop = Math.max(padding, Math.min(newTop, window.innerHeight - el.offsetHeight - padding));

        el.style.left = `${newLeft}px`;
        el.style.top = `${newTop}px`;
        el.style.bottom = 'auto';
        el.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        el.classList.remove('dragging');
    });
}
