import { initHandTracking, detectHand, handLandmarker } from './core/handTracking';
import { getHandPose, updateVelocity, isHandMovingFast, detectPinch, isPalmStable, isPinching, palmHistory } from './core/gestureDetector';
import { drawStroke, endStroke, handState } from './drawing/drawingCanvas';
import { initDrawingState, saveCanvasState, performUndo, performRedo } from './drawing/drawingState';
import { appState } from './core/appState';
import { initUIComponents, setMode, updateFistProgress, clearCanvasWithFlash, openColorPicker, closeColorPicker, confirmColor, updatePickerHighlight } from './ui/uiComponents';
import { initHandVisualizer, getSmoothedPosition, updateCursor, getSkeletonColor } from './ui/handVisualizer';
// @ts-ignore
import { DrawingUtils, HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs';
import { PALM_HOLD_TIME, FIST_HOLD_TIME, UNDO_REPEAT_DELAY, UNDO_REPEAT_INTERVAL } from './constants';
import { setupDraggablePIP } from './ui/uiComponents';
import { initCameraManager, requestCameraAccess, isCameraActive } from './core/cameraManager';

let video: HTMLVideoElement;
let skeletonCanvas: HTMLCanvasElement;
let drawingCanvas: HTMLCanvasElement;
let skeletonCtx: CanvasRenderingContext2D;
let drawingCtx: CanvasRenderingContext2D;
let statusDot: HTMLElement;
let statusText: HTMLElement;
let loadingOverlay: HTMLElement;
let drawingUtils: DrawingUtils | null = null;

let previousPose = 'NEUTRAL';
let wasPinching = false;
let lastTimestamp = -1;

function resizeCanvases() {

    const w = window.innerWidth;
    const h = window.innerHeight;
    if (drawingCanvas.width !== w || drawingCanvas.height !== h) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = drawingCanvas.width;
        tempCanvas.height = drawingCanvas.height;
        const ctx = tempCanvas.getContext('2d');
        if (ctx) ctx.drawImage(drawingCanvas, 0, 0);

        drawingCanvas.width = w;
        drawingCanvas.height = h;
        drawingCtx.drawImage(tempCanvas, 0, 0);
    }
}

function updateGestureState(pose: string, landmarks: any[], fingerPos: any) {
    const enteredNewPose = (pose !== previousPose);

    // -- Open Palm + stable -> Toggle Mode --
    if (pose === 'OPEN_PALM' && isPalmStable(landmarks)) {
        if (appState.palmHoldStart === 0) appState.palmHoldStart = performance.now();
        if (performance.now() - appState.palmHoldStart >= PALM_HOLD_TIME) {
            setMode(appState.currentMode === 'DRAW' ? 'ERASE' : 'DRAW');
            appState.palmHoldStart = 0;
            palmHistory.length = 0; // Empty
        }
    } else if (pose !== 'OPEN_PALM') {
        appState.palmHoldStart = 0;
        palmHistory.length = 0;
    }

    // -- Fist held -> Clear Canvas --
    if (pose === 'FIST') {
        if (appState.fistHoldStart === 0) appState.fistHoldStart = performance.now();
        updateFistProgress(fingerPos, appState.fistHoldStart);
        if (performance.now() - appState.fistHoldStart >= FIST_HOLD_TIME) {
            clearCanvasWithFlash();
            appState.fistHoldStart = 0;
        }
    } else {
        appState.fistHoldStart = 0;
        updateFistProgress(fingerPos, 0); // Hide
    }

    // -- Pinch -> Confirm Color --
    detectPinch(landmarks);
    if (isPinching && !wasPinching) {
        if (appState.isColorPickerOpen) {
            confirmColor();
            if (appState.currentMode === 'ERASE') {
                setMode('DRAW');
            }
        }
    }
    wasPinching = isPinching;

    // -- Two Fingers -> Open Picker --
    if (pose === 'TWO_FINGERS') {
        if (!appState.isColorPickerOpen) {
            openColorPicker(fingerPos);
        }
    } else if (appState.isColorPickerOpen && !isPinching) {
        closeColorPicker();
    }

    // -- Thumbs Gestures (Undo/Redo) --
    if (pose === 'THUMBS_DOWN') {
        if (enteredNewPose) {
            performUndo();
            appState.undoHoldStart = performance.now();
        } else if (appState.undoHoldStart > 0 && performance.now() - appState.undoHoldStart > UNDO_REPEAT_DELAY) {
            if (performance.now() - appState.lastUndoTime > UNDO_REPEAT_INTERVAL) {
                performUndo();
                appState.lastUndoTime = performance.now();
            }
        }
    } else {
        appState.undoHoldStart = 0;
    }

    if (pose === 'THUMBS_UP') {
        if (enteredNewPose) {
            performRedo();
            appState.redoHoldStart = performance.now();
        } else if (appState.redoHoldStart > 0 && performance.now() - appState.redoHoldStart > UNDO_REPEAT_DELAY) {
            if (performance.now() - appState.lastRedoTime > UNDO_REPEAT_INTERVAL) {
                performRedo();
                appState.lastRedoTime = performance.now();
            }
        }
    } else {
        appState.redoHoldStart = 0;
    }

    // -- Point -> Drawing --
    if (pose === 'POINT') {
        if (!appState.wasPointing) {
            saveCanvasState();
        }
        appState.wasPointing = true;
    } else {
        if (appState.wasPointing) {
            endStroke();
        }
        appState.wasPointing = false;
    }

    previousPose = pose;
}

function processResults(results: any) {
    skeletonCtx.clearRect(0, 0, skeletonCanvas.width, skeletonCanvas.height);

    if (!drawingUtils) {
        console.warn('drawingUtils not ready yet');
        return;
    }

    skeletonCtx.save();

    if (!results.landmarks || results.landmarks.length === 0) {
        statusDot.classList.remove('detected', 'poor-light');
        statusText.textContent = 'Hand out of frame';
        if (appState.wasPointing) { endStroke(); appState.wasPointing = false; }
        document.getElementById('fingerCursor')!.style.display = 'none';
        updateFistProgress({ x: 0, y: 0 }, 0);
        skeletonCtx.restore();
        return;
    }

    const converted = results.landmarks.map((hand: any) =>
        hand.map((lm: { x: number, y: number }) => ({
            x: (1 - lm.x) * window.innerWidth,
            y: lm.y * window.innerHeight
        }))
    );

    document.getElementById('fingerCursor')!.style.display = '';
    statusDot.classList.remove('poor-light');
    statusDot.classList.add('detected');

    const isOutOfBounds = results.landmarks[0].some((lm: any) =>
        lm.x < 0.05 || lm.x > 0.95 || lm.y < 0.05 || lm.y > 0.95
    );

    if (results.handednesses && results.handednesses.length > 0) {
        const conf = results.handednesses[0][0].score;
        if (conf < 0.85) {
            statusDot.classList.add('poor-light');
            statusText.textContent = 'Poor lighting or dirty lens';
        } else if (isOutOfBounds) {
            statusDot.classList.add('poor-light');
            statusText.textContent = 'Hand moving out of frame';
        } else {
            statusText.textContent = converted.length === 1 ? '1 hand detected' : `${converted.length} hands detected`;
        }
    } else {
        if (isOutOfBounds) {
            statusDot.classList.add('poor-light');
            statusText.textContent = 'Hand moving out of frame';
        } else {
            statusText.textContent = converted.length === 1 ? '1 hand detected' : `${converted.length} hands detected`;
        }
    }

    const landmarks = converted[0];

    updateVelocity(landmarks);

    const pose = isHandMovingFast() ? 'NEUTRAL' : getHandPose(landmarks);

    const indexTip = landmarks[8];
    const smoothedPos = getSmoothedPosition(handState.posBuffer, indexTip.x, indexTip.y);

    updateGestureState(pose, landmarks, smoothedPos);

    if (appState.isColorPickerOpen) {
        updatePickerHighlight(smoothedPos);
    }

    if (pose === 'POINT') {
        drawStroke(smoothedPos.x, smoothedPos.y);
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
            drawingUtils.drawLandmarks(mirrored, { color: '#0f1419', radius: 1.5 });
        }
    }

    updateCursor(smoothedPos, pose, appState.fistHoldStart);
    skeletonCtx.restore();
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

async function init() {
    try {
        video = document.getElementById('webcam') as HTMLVideoElement;
        skeletonCanvas = document.getElementById('skeletonCanvas') as HTMLCanvasElement;
        drawingCanvas = document.getElementById('drawingCanvas') as HTMLCanvasElement;
        statusDot = document.getElementById('statusDot')!;
        statusText = document.getElementById('statusText')!;
        loadingOverlay = document.getElementById('loadingOverlay')!;

        skeletonCtx = skeletonCanvas.getContext('2d')!;
        drawingCtx = drawingCanvas.getContext('2d')!;

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

        initCameraManager(video, statusDot, statusText, skeletonCanvas, skeletonCtx);
        await requestCameraAccess();

        resizeCanvases();

        statusText.textContent = 'Loading hand tracking model...';
        await initHandTracking();

        drawingUtils = new DrawingUtils(skeletonCtx);

        statusText.textContent = 'Hand Tracking Active';

        console.log('Doodle modular initialized successfully.');
        requestAnimationFrame(detectLoop);

    } catch (err: any) {
        console.error('Initialization failed:', err);
        statusText.textContent = 'Error: ' + err.message;
        statusDot.classList.remove('loading');
        loadingOverlay.querySelector('span')!.textContent = 'Failed: ' + err.message;
    } finally {
        loadingOverlay.style.opacity = '0';
        setTimeout(() => loadingOverlay.style.display = 'none', 500);
    }
}

document.addEventListener('DOMContentLoaded', init);
