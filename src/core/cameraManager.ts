import { appState } from './appState';
import { endStroke } from '../drawing/drawingCanvas';
import { updateFistProgress } from '../ui/uiComponents';

export let isCameraActive = true;
export let videoEl: HTMLVideoElement | null = null;
let statusDot: HTMLElement;
let statusText: HTMLElement;
let skeletonCanvas: HTMLCanvasElement;
let skeletonCtx: CanvasRenderingContext2D;

export function initCameraManager(
    video: HTMLVideoElement,
    dot: HTMLElement,
    text: HTMLElement,
    skelCanvas: HTMLCanvasElement,
    skelCtx: CanvasRenderingContext2D
) {
    videoEl = video;
    statusDot = dot;
    statusText = text;
    skeletonCanvas = skelCanvas;
    skeletonCtx = skelCtx;

    const cameraBtn = document.getElementById('cameraBtn')!;
    cameraBtn.addEventListener('click', async () => {
        isCameraActive = !isCameraActive;
        if (isCameraActive) {
            cameraBtn.textContent = 'Cam On';
            cameraBtn.classList.add('active');
            statusText.textContent = 'Requesting camera...';
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
                });
                videoEl!.srcObject = stream;
                await videoEl!.play();
                statusText.textContent = 'Hand Tracking Active';
                statusDot.classList.add('detected');
            } catch (e: any) {
                statusText.textContent = 'Error: ' + e.message;
            }
        } else {
            cameraBtn.textContent = 'Cam Off';
            cameraBtn.classList.remove('active');
            const stream = videoEl!.srcObject as MediaStream;
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
            videoEl!.srcObject = null;
            statusText.textContent = 'Camera Off';
            statusDot.classList.remove('detected');
            skeletonCtx.clearRect(0, 0, skeletonCanvas.width, skeletonCanvas.height);
            document.getElementById('fingerCursor')!.style.display = 'none';
            if (appState.wasPointing) { endStroke(); appState.wasPointing = false; }
            updateFistProgress({ x: 0, y: 0 }, 0);
        }
    });
}

export async function requestCameraAccess() {
    statusText.textContent = 'Requesting camera...';
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    videoEl!.srcObject = stream;
    await videoEl!.play();
}
