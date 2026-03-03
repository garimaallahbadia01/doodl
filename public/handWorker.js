importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.js');

let handLandmarker = null;
let isInitializing = false;

self.onmessage = async (e) => {
    const data = e.data;

    if (data.type === 'INIT') {
        self.postMessage({ type: 'LOG', msg: 'Worker triggered INIT...' });
        if (isInitializing || handLandmarker) return;
        isInitializing = true;

        try {
            self.postMessage({ type: 'LOG', msg: 'Fetching Wasm...' });

            const vision = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
            );
            self.postMessage({ type: 'LOG', msg: 'Wasm loaded, creating landmarker...' });

            handLandmarker = await HandLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
                    delegate: 'CPU'
                },
                runningMode: 'VIDEO',
                numHands: 2,
                minHandDetectionConfidence: 0.5,
                minHandPresenceConfidence: 0.5,
                minTrackingConfidence: 0.5
            });
            self.postMessage({ type: 'LOG', msg: 'Landmarker initialized successfully' });
            self.postMessage({ type: 'INIT_DONE' });
        } catch (error) {
            self.postMessage({ type: 'INIT_ERROR', error: error.message });
        }
    } else if (data.type === 'PROCESS' && handLandmarker) {
        if (!data.frame) return;
        const results = handLandmarker.detectForVideo(data.frame, data.timestamp);
        data.frame.close();
        self.postMessage({ type: 'RESULTS', results });
    }
};
