import { appState } from './appState';
import { endStroke } from '../drawing/drawingCanvas';
import { updateFistProgress, showToast } from '../ui/uiComponents';

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
                showToast('Camera error: ' + e.message, true, 5000);
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
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    videoEl!.srcObject = stream;
    await videoEl!.play();
}
