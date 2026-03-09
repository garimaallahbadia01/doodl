import { appState } from './appState';
import { endStroke } from '../drawing/drawingCanvas';
import { updateFistProgress, showToast, showCameraDeniedOverlay } from '../ui/uiComponents';

export let isCameraActive = true;
export let videoEl: HTMLVideoElement | null = null;
let skeletonCanvas: HTMLCanvasElement;
let skeletonCtx: CanvasRenderingContext2D;

export function initCameraManager(
    video: HTMLVideoElement,
    skelCanvas: HTMLCanvasElement,
    skelCtx: CanvasRenderingContext2D
) {
    videoEl = video;
    skeletonCanvas = skelCanvas;
    skeletonCtx = skelCtx;

    const cameraBtn = document.getElementById('cameraBtn')!;
    const pipCameraOff = document.getElementById('pipCameraOff')!;
    cameraBtn.addEventListener('click', async () => {
        isCameraActive = !isCameraActive;
        if (isCameraActive) {
            cameraBtn.classList.add('active');
            pipCameraOff.classList.remove('visible');
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
                });
                videoEl!.srcObject = stream;
                await videoEl!.play();
            } catch (e: any) {
                if (e.name === 'NotAllowedError') {
                    showCameraDeniedOverlay();
                } else {
                    showToast('Camera error: ' + e.message, true, 5000);
                }
            }
        } else {
            cameraBtn.classList.remove('active');
            pipCameraOff.classList.add('visible');
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
    });

}

export async function requestCameraAccess() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        videoEl!.srcObject = stream;
        await videoEl!.play();

        // Hide overlay if it was shown
        const overlay = document.getElementById('cameraDeniedOverlay');
        if (overlay) overlay.classList.add('hidden');

    } catch (e: any) {
        if (e.name === 'NotAllowedError') {
            // Hide loading overlay if it's blocking the view
            const loading = document.getElementById('loadingOverlay');
            if (loading) loading.classList.add('hidden');

            showCameraDeniedOverlay();
        } else {
            showToast('Camera error: ' + e.message, true, 5000);
        }
    }
}
