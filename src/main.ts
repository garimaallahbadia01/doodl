import { initHandTracking, detectHand, handLandmarker } from './core/handTracking';
import { getHandPose, updateVelocity, detectPinch, isPinching, palmHistory, updatePinchPalette, isIdleGesture, isHandMovingFast } from './core/gestureDetector';
import { drawStroke, endStroke, handState } from './drawing/drawingCanvas';
import { initDrawingState, saveCanvasState, performUndo, performRedo, redrawAll } from './drawing/drawingState';
import { appState } from './core/appState';
import { initUIComponents, setMode, updateGestureProgress, clearCanvasWithFlash, openColorPicker, closeColorPicker, confirmColor, updatePickerHighlight, showToast } from './ui/uiComponents';
import { initHandVisualizer, updateCursor, getSkeletonColor, getSmoothedPosition } from './ui/handVisualizer';
import { showTutorialIfNeeded } from './ui/tutorialModal';
// @ts-ignore
import { DrawingUtils, HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs';
import { PALM_HOLD_TIME, PALM_ARC_COLOR, FIST_HOLD_TIME, FIST_ARC_COLOR, UNDO_HOLD_TIME, UNDO_ARC_COLOR, REDO_HOLD_TIME, REDO_ARC_COLOR } from './constants';
import { setupDraggablePIP } from './ui/uiComponents';
import { initCameraManager, requestCameraAccess, isCameraActive } from './core/cameraManager';

let video: HTMLVideoElement;
let skeletonCanvas: HTMLCanvasElement;
let drawingCanvas: HTMLCanvasElement;
let skeletonCtx: CanvasRenderingContext2D;
let loadingOverlay: HTMLElement;
let drawingUtils: DrawingUtils | null = null;

let lastTimestamp = -1;

let trackingLostWhileDrawing = false;
let disruptedSince = 0;
const DISRUPTION_THRESHOLD = 2000;
let lastToastTime = 0;
const TOAST_COOLDOWN = 5000; // Don't spam toasts

// Grace period for tracking loss to prevent broken lines
let trackingLossFrames = 0;
const MAX_GRACE_FRAMES = 15; // ~250ms of "Sticky" ink
let lastSmoothedPosition: { x: number, y: number } | null = null;

function resetGestureTimers() {
    appState.palmHoldStart = 0;
    appState.fistHoldStart = 0;
    appState.undoHoldStart = 0;
    appState.redoHoldStart = 0;
}

function resizeCanvases() {
    const panel = document.getElementById('drawingPanel')!;
    const w = panel.clientWidth;
    const h = panel.clientHeight;
    if (drawingCanvas.width !== w || drawingCanvas.height !== h) {
        drawingCanvas.width = w;
        drawingCanvas.height = h;

        // Re-sync the context reference in drawingState.ts
        initDrawingState(drawingCanvas);

        // Redraw all strokes cleanly as vectors to prevent bitmap distortion
        redrawAll();
    }
}

function updateGestureState(pose: string, landmarks: any[], fingerPos: any) {

    // -- Pinch Color Palette State Machine (processed first as modal) --
    detectPinch(landmarks, pose);
    const palette = updatePinchPalette(landmarks, isPinching);

    if (palette.state === 'BROWSING' || palette.state === 'CANCELLING') {
        // Palette is open: show it and follow hand
        if (!appState.isColorPickerOpen) {
            openColorPicker(palette.position);
        }
        updatePickerHighlight(palette.position);
    }

    if (palette.confirmed) {
        confirmColor();
        if (appState.currentMode === 'ERASE') {
            setMode('DRAW');
        }
        closeColorPicker();
    }

    if (palette.cancelled) {
        closeColorPicker();
    }

    // MODAL GUARD: while palette is active, skip all other gestures
    if (palette.state !== 'CLOSED') return;

    // -- Open Palm + stable -> Toggle Draw/Erase Mode --
    if (pose === 'OPEN_PALM' && !isHandMovingFast()) {
        const palmCenter = landmarks[9]; // Middle finger MCP
        if (appState.palmHoldStart === -1) {
            updateGestureProgress(palmCenter, 1, 1, PALM_ARC_COLOR);
        } else {
            if (appState.palmHoldStart === 0) appState.palmHoldStart = performance.now();
            updateGestureProgress(palmCenter, appState.palmHoldStart, PALM_HOLD_TIME, PALM_ARC_COLOR);
            if (performance.now() - appState.palmHoldStart >= PALM_HOLD_TIME) {
                setMode(appState.currentMode === 'DRAW' ? 'ERASE' : 'DRAW');
                appState.palmHoldStart = -1;
                palmHistory.length = 0;
            }
        }
    } else {
        appState.palmHoldStart = 0;
        palmHistory.length = 0;
    }

    // -- Thumbs Up/Down -> Redo / Undo --
    // These already check for !isHandMovingFast()

    // -- Thumbs Down -> Undo with Timer --
    if (pose === 'THUMBS_DOWN' && !isHandMovingFast()) {
        const thumbTip = landmarks[4];
        if (appState.undoHoldStart === -1) {
            updateGestureProgress(thumbTip, 1, 1, UNDO_ARC_COLOR);
        } else {
            if (appState.undoHoldStart === 0) appState.undoHoldStart = performance.now();
            updateGestureProgress(thumbTip, appState.undoHoldStart, UNDO_HOLD_TIME, UNDO_ARC_COLOR);
            if (performance.now() - appState.undoHoldStart >= UNDO_HOLD_TIME) {
                performUndo();
                appState.undoHoldStart = -1;
            }
        }
    } else {
        appState.undoHoldStart = 0;
    }

    // -- Thumbs Up -> Redo with Timer --
    if (pose === 'THUMBS_UP' && !isHandMovingFast()) {
        const thumbTip = landmarks[4];
        if (appState.redoHoldStart === -1) {
            updateGestureProgress(thumbTip, 1, 1, REDO_ARC_COLOR);
        } else {
            if (appState.redoHoldStart === 0) appState.redoHoldStart = performance.now();
            updateGestureProgress(thumbTip, appState.redoHoldStart, REDO_HOLD_TIME, REDO_ARC_COLOR);
            if (performance.now() - appState.redoHoldStart >= REDO_HOLD_TIME) {
                performRedo();
                appState.redoHoldStart = -1;
            }
        }
    } else {
        appState.redoHoldStart = 0;
    }

    // -- Fist held -> Clear Canvas --
    if (pose === 'FIST') {
        if (appState.fistHoldStart === -1) {
            updateGestureProgress(fingerPos, 1, 1, FIST_ARC_COLOR);
        } else {
            if (appState.fistHoldStart === 0) appState.fistHoldStart = performance.now();
            updateGestureProgress(fingerPos, appState.fistHoldStart, FIST_HOLD_TIME, FIST_ARC_COLOR);
            if (performance.now() - appState.fistHoldStart >= FIST_HOLD_TIME) {
                clearCanvasWithFlash();
                appState.fistHoldStart = -1;
            }
        }
    } else {
        appState.fistHoldStart = 0;
    }

    // Global reset if no timed gesture is active
    if (pose !== 'FIST' && pose !== 'THUMBS_UP' && pose !== 'THUMBS_DOWN' && pose !== 'OPEN_PALM') {
        updateGestureProgress(fingerPos, 0, 1, '#000');
    }

    // -- Point -> Drawing --
    if (pose === 'POINT') {
        if (!appState.wasPointing) {
            saveCanvasState();
            handState.posBuffer = [];
        }
        appState.wasPointing = true;
        trackingLossFrames = 0;
    } else {
        if (appState.wasPointing) {
            // Peace sign (idle) -> instant stroke end, no grace period
            if (isIdleGesture(pose as any)) {
                endStroke();
                appState.wasPointing = false;
                trackingLossFrames = 0;
            } else {
                trackingLossFrames++;
                if (trackingLossFrames > MAX_GRACE_FRAMES) {
                    endStroke();
                    appState.wasPointing = false;
                    trackingLossFrames = 0;
                }
            }
        }
    }
}

function processResults(results: any) {
    skeletonCtx.clearRect(0, 0, skeletonCanvas.width, skeletonCanvas.height);

    if (!drawingUtils) {
        console.warn('drawingUtils not ready yet');
        return;
    }

    skeletonCtx.save();

    if (!results.landmarks || results.landmarks.length === 0) {
        trackingLossFrames++;

        // Only end stroke if tracking is lost for a sustained period (grace period)
        if (trackingLossFrames > MAX_GRACE_FRAMES) {
            if (appState.wasPointing) {
                trackingLostWhileDrawing = true;
                endStroke();
                appState.wasPointing = false;
            }

            document.getElementById('fingerCursor')!.style.display = 'none';
            resetGestureTimers();
            updateGestureProgress({ x: 0, y: 0 }, 0, 1, '#000');

            if (trackingLostWhileDrawing) {
                if (performance.now() - lastToastTime > TOAST_COOLDOWN) {
                    showToast('Hand out of frame. Move your hand into the camera view', true);
                    lastToastTime = performance.now();
                }
            }
        }

        skeletonCtx.restore();
        return;
    }

    // Hand detected: reset grace period and disruption tracker
    const recoveredLossFrames = trackingLossFrames;
    trackingLossFrames = 0;
    trackingLostWhileDrawing = false;

    const converted = results.landmarks.map((hand: any) =>
        hand.map((lm: { x: number, y: number }) => ({
            x: (1 - lm.x) * drawingCanvas.width,
            y: lm.y * drawingCanvas.height
        }))
    );

    document.getElementById('fingerCursor')!.style.display = '';

    const centerLm = results.landmarks[0][9]; // Middle finger MCP (hand center)
    const isOutOfBounds = centerLm.x < 0.01 || centerLm.x > 0.99 || centerLm.y < 0.01 || centerLm.y > 0.99;

    // Check for poor conditions that disrupt functionality
    let isDisrupted = false;
    if (results.handednesses && results.handednesses.length > 0) {
        const conf = results.handednesses[0][0].score;
        if (conf < 0.75) {
            isDisrupted = true;
            if (disruptedSince === 0) {
                disruptedSince = performance.now();
            } else if (performance.now() - disruptedSince > DISRUPTION_THRESHOLD) {
                if (performance.now() - lastToastTime > TOAST_COOLDOWN) {
                    showToast('Poor lighting. Try moving to a brighter area', true);
                    lastToastTime = performance.now();
                }
            }
        } else if (isOutOfBounds) {
            isDisrupted = true;
            if (disruptedSince === 0) {
                disruptedSince = performance.now();
            } else if (performance.now() - disruptedSince > DISRUPTION_THRESHOLD) {
                if (performance.now() - lastToastTime > TOAST_COOLDOWN) {
                    showToast('Hand at edge of frame. Center your hand', true);
                    lastToastTime = performance.now();
                }
            }
        }
    }

    if (!isDisrupted) {
        disruptedSince = 0;
    }

    const landmarks = converted[0];

    updateVelocity(landmarks);

    // Get raw pose and refine based on movement
    let pose = getHandPose(landmarks);

    const indexTip = landmarks[8];

    // -- ADAPTIVE FLOW: Always allow smoothing, but handle disruption gracefully --
    const smoothedPos = getSmoothedPosition(handState.posBuffer, indexTip.x, indexTip.y);

    updateGestureState(pose, landmarks, smoothedPos);

    // Picker highlight is now handled inside updateGestureState via pinch palette

    // DRAWING: Only draw if we are in POINT pose OR within the sticky grace period, AND palette is closed
    if (!appState.isColorPickerOpen && (pose === 'POINT' || (appState.wasPointing && recoveredLossFrames > 0))) {
        if (appState.wasPointing && recoveredLossFrames > 0 && lastSmoothedPosition) {
            if (recoveredLossFrames <= 3) {
                // Interpolate missing frames seamlessly
                const steps = recoveredLossFrames;
                for (let i = 1; i <= steps; i++) {
                    const t = i / (steps + 1);
                    const ix = lastSmoothedPosition.x + (smoothedPos.x - lastSmoothedPosition.x) * t;
                    const iy = lastSmoothedPosition.y + (smoothedPos.y - lastSmoothedPosition.y) * t;
                    updateCursor({ x: ix, y: iy }, pose, appState.fistHoldStart);
                    drawStroke(ix, iy);
                }
            } else {
                // Gap too large, break the stroke
                endStroke();
            }
        }
        drawStroke(smoothedPos.x, smoothedPos.y);
    } else if (appState.isColorPickerOpen && appState.wasPointing) {
        // Force-cancel any active stroke if the palette pops up while drawing
        endStroke();
        appState.wasPointing = false;
        trackingLossFrames = 0;
    }

    const skelColor = getSkeletonColor(pose);
    for (let i = 0; i < results.landmarks.length; i++) {
        const rawLandmarks = results.landmarks[i];
        const mirrored = rawLandmarks.map((lm: any) => ({
            x: 1 - lm.x,
            y: lm.y,
            z: lm.z
        }));
        if (drawingUtils) {
            drawingUtils.drawConnectors(mirrored, HandLandmarker.HAND_CONNECTIONS, { color: skelColor, lineWidth: 2 });
            drawingUtils.drawLandmarks(mirrored, { color: appState.isDarkMode ? '#F7F6F2' : '#0f1419', radius: 1.5 });
        }
    }

    updateCursor(smoothedPos, pose, appState.fistHoldStart);
    skeletonCtx.restore();

    lastSmoothedPosition = smoothedPos;
}

function detectLoop() {
    if (!isCameraActive || !handLandmarker || video.readyState < 2) {
        requestAnimationFrame(detectLoop);
        return;
    }

    const nowMs = performance.now();
    if (nowMs <= lastTimestamp) {
        requestAnimationFrame(detectLoop);
        return;
    }
    lastTimestamp = nowMs;

    const results = detectHand(video, nowMs);
    if (results) {
        processResults(results);
    }
    requestAnimationFrame(detectLoop);
}

export async function startHandTrackingSystem() {
    if (handLandmarker) return; // Already initialized

    try {
        await initHandTracking();
        drawingUtils = new DrawingUtils(skeletonCtx);
        console.log('Hand tracking system started successfully.');

        // Final resize check
        resizeCanvases();

        showTutorialIfNeeded();
        requestAnimationFrame(detectLoop);
    } catch (err) {
        console.error('Hand tracking start failed:', err);
        showToast('Tracking initialization failed. Please refresh.', true);
    }
}

async function init() {
    const startTime = Date.now();
    try {
        video = document.getElementById('webcam') as HTMLVideoElement;
        skeletonCanvas = document.getElementById('skeletonCanvas') as HTMLCanvasElement;
        drawingCanvas = document.getElementById('drawingCanvas') as HTMLCanvasElement;
        loadingOverlay = document.getElementById('loadingOverlay')!;

        skeletonCtx = skeletonCanvas.getContext('2d')!;

        initDrawingState(drawingCanvas);
        initUIComponents();
        initHandVisualizer();
        const pipPanel = document.getElementById('pipPanel')!;
        setupDraggablePIP(pipPanel);
        new ResizeObserver(() => {
            if (!skeletonCanvas || !pipPanel) return;
            skeletonCanvas.width = pipPanel.clientWidth;
            skeletonCanvas.height = pipPanel.clientHeight;
        }).observe(pipPanel);

        window.addEventListener('resize', resizeCanvases);

        // Init camera manager without old status elements
        initCameraManager(video, skeletonCanvas, skeletonCtx);
        const cameraSuccess = await requestCameraAccess();

        resizeCanvases();

        if (cameraSuccess) {
            await startHandTrackingSystem();
        } else {
            console.warn('Camera access denied. Hand tracking pending permission.');
        }

    } catch (err: any) {
        console.error('Initialization failed:', err);
        showToast('Error: ' + err.message, true, 8000);
        document.getElementById('loadingText')!.textContent = 'Failed: ' + err.message;
    } finally {
        const elapsed = Date.now() - startTime;
        const minLoadingTime = 3000;
        const remaining = Math.max(0, minLoadingTime - elapsed);

        setTimeout(() => {
            loadingOverlay.style.opacity = '0';
            setTimeout(() => loadingOverlay.style.display = 'none', 500);
        }, remaining);
    }
}

document.addEventListener('DOMContentLoaded', init);

window.addEventListener('camera-access-granted', () => {
    startHandTrackingSystem();
});

