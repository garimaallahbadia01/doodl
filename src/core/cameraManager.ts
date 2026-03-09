import { appState } from './appState';
import { endStroke } from '../drawing/drawingCanvas';
import { updateFistProgress, showToast, showCameraDeniedOverlay } from '../ui/uiComponents';

export let isCameraActive = true;
export let videoEl: HTMLVideoElement | null = null;
let skeletonCanvas: HTMLCanvasElement;
let skeletonCtx: CanvasRenderingContext2D;
let cameraBtn: HTMLElement | null = null;
let pipCameraOff: HTMLElement | null = null;

function updateCameraUI() {
    if (!cameraBtn || !pipCameraOff) return;
    if (isCameraActive) {
        cameraBtn.classList.add('active');
        pipCameraOff.classList.remove('visible');
    } else {
        cameraBtn.classList.remove('active');
        pipCameraOff.classList.add('visible');
    }
}

export function initCameraManager(
    video: HTMLVideoElement,
    skelCanvas: HTMLCanvasElement,
    skelCtx: CanvasRenderingContext2D
) {
    videoEl = video;
    skeletonCanvas = skelCanvas;
    skeletonCtx = skelCtx;

    cameraBtn = document.getElementById('cameraBtn');
    pipCameraOff = document.getElementById('pipCameraOff');

    if (cameraBtn) {
        cameraBtn.addEventListener('click', async () => {
            if (isCameraActive) {
                await stopCamera();
            } else {
                await requestCameraAccess();
            }
        });
    }
}

export async function stopCamera() {
    isCameraActive = false;
    updateCameraUI();
    const stream = videoEl!.srcObject as MediaStream;
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    videoEl!.srcObject = null;
    skeletonCtx.clearRect(0, 0, skeletonCanvas.width, skeletonCanvas.height);
    document.getElementById('fingerCursor')!.style.display = 'none';
    if (appState.wasPointing) { endStroke(); appState.wasPointing = false; }
    updateFistProgress({ x: 0, y: 0 }, 0);
}

export async function requestCameraAccess() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        videoEl!.srcObject = stream;
        await videoEl!.play();

        isCameraActive = true;
        updateCameraUI();

        // Hide overlay if it was shown
        const overlay = document.getElementById('cameraDeniedOverlay');
        if (overlay) overlay.classList.add('hidden');

        window.dispatchEvent(new CustomEvent('camera-access-granted'));
        return true;
    } catch (e: any) {
        if (e.name === 'NotAllowedError') {
            // Hide loading overlay if it's blocking the view
            const loading = document.getElementById('loadingOverlay');
            if (loading) {
                loading.style.display = 'none';
            }

            showCameraDeniedOverlay();
            isCameraActive = false;
            updateCameraUI();

            // Special hint if they keep trying and keep getting denied
            if (document.body.dataset.deniedCount === '1') {
                showToast('Still denied. Click the lock icon in your URL bar to allow camera.', true, 8000);
            }
            document.body.dataset.deniedCount = (parseInt(document.body.dataset.deniedCount || '0') + 1).toString();

            return false;
        } else {
            showToast('Camera error: ' + e.message, true, 5000);
            throw e; // Rethrow hardware errors
        }
    }
}
