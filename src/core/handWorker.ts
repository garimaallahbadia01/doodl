// @ts-ignore
import { FilesetResolver, HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs';

let handLandmarker: HandLandmarker | null = null;
let isInitializing = false;

self.onmessage = async (e) => {
    const data = e.data;

    if (data.type === 'INIT') {
        if (isInitializing || handLandmarker) return;
        isInitializing = true;

        try {
            const vision = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
            );

            handLandmarker = await HandLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
                    delegate: 'GPU'
                },
                runningMode: 'VIDEO',
                numHands: 2,
                minHandDetectionConfidence: 0.5,
                minHandPresenceConfidence: 0.5,
                minTrackingConfidence: 0.5
            });
            self.postMessage({ type: 'INIT_DONE' });
        } catch (error) {
            self.postMessage({ type: 'INIT_ERROR', error });
        }
    } else if (data.type === 'PROCESS' && handLandmarker) {
        if (!data.frame) return;
        const results = handLandmarker.detectForVideo(data.frame, data.timestamp);
        data.frame.close();
        self.postMessage({ type: 'RESULTS', results });
    }
};
