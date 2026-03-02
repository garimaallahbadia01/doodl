import { PoseMode, Point2D } from '../types';
import { PINCH_START_THRESHOLD, PINCH_END_THRESHOLD, EXTENSION_RATIO, FAST_MOVEMENT_THRESHOLD, PALM_HISTORY_SIZE, PALM_STABILITY_THRESHOLD } from '../constants';

export let handVelocity = { x: 0, y: 0 };
export let palmHistory: Point2D[] = [];
export let isPinching = false;
let lastPalmCenter: Point2D | null = null;
let lastFrameTime = 0;

export function isFingerExtended(landmarks: any[], tipIdx: number, pipIdx: number) {
    const wrist = landmarks[0];
    const tip = landmarks[tipIdx];
    const pip = landmarks[pipIdx];
    const distTip = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
    const distPip = Math.hypot(pip.x - wrist.x, pip.y - wrist.y);
    return distTip > distPip * EXTENSION_RATIO;
}

export function isThumbExtended(landmarks: any[]) {
    const thumbTip = landmarks[4];
    const thumbIp = landmarks[3];
    const indexMcp = landmarks[5];
    const distFromIndex = Math.hypot(thumbTip.x - indexMcp.x, thumbTip.y - indexMcp.y);
    const thumbLength = Math.hypot(thumbTip.x - thumbIp.x, thumbTip.y - thumbIp.y);
    return distFromIndex > thumbLength * 1.5;
}

export function getHandPose(landmarks: any[]): PoseMode {
    const ext = {
        thumb: isThumbExtended(landmarks),
        index: isFingerExtended(landmarks, 8, 6),
        middle: isFingerExtended(landmarks, 12, 10),
        ring: isFingerExtended(landmarks, 16, 14),
        pinky: isFingerExtended(landmarks, 20, 18)
    };
    const allCurled = !ext.index && !ext.middle && !ext.ring && !ext.pinky;

    if (ext.index && !ext.middle && !ext.ring && !ext.pinky) return 'POINT';
    if (ext.index && ext.middle && !ext.ring && !ext.pinky) return 'TWO_FINGERS';

    if (ext.thumb && allCurled) {
        const thumbTip = landmarks[4];
        const wrist = landmarks[0];
        if (thumbTip.y < wrist.y - 0.05) return 'THUMBS_UP';
        if (thumbTip.y > wrist.y + 0.05) return 'THUMBS_DOWN';
    }

    if (ext.thumb && ext.index && ext.middle && ext.ring && ext.pinky) return 'OPEN_PALM';
    if (!ext.thumb && allCurled) return 'FIST';

    return 'NEUTRAL';
}

export function getPalmCenter(landmarks: any[]): Point2D {
    const w = landmarks[0], i = landmarks[5], p = landmarks[17];
    return { x: (w.x + i.x + p.x) / 3, y: (w.y + i.y + p.y) / 3 };
}

export function updateVelocity(landmarks: any[]) {
    const now = performance.now();
    const dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    const center = getPalmCenter(landmarks);
    if (lastPalmCenter && dt > 0) {
        handVelocity = {
            x: (center.x - lastPalmCenter.x) / dt,
            y: (center.y - lastPalmCenter.y) / dt
        };
    }
    lastPalmCenter = center;
}

export function isHandMovingFast() {
    return Math.hypot(handVelocity.x, handVelocity.y) > FAST_MOVEMENT_THRESHOLD;
}

export function isPalmStable(landmarks: any[]) {
    const center = getPalmCenter(landmarks);
    palmHistory.push(center);
    if (palmHistory.length > PALM_HISTORY_SIZE) palmHistory.shift();
    if (palmHistory.length < 3) return false;

    const first = palmHistory[0];
    return palmHistory.every(p =>
        Math.hypot(p.x - first.x, p.y - first.y) < PALM_STABILITY_THRESHOLD
    );
}

export function detectPinch(landmarks: any[]) {
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const wrist = landmarks[0];
    const middleMCP = landmarks[9];

    const handSize = Math.hypot(middleMCP.x - wrist.x, middleMCP.y - wrist.y);
    if (handSize === 0) return;

    const pinchDist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
    const normalizedPinch = pinchDist / handSize;

    if (!isPinching && normalizedPinch < PINCH_START_THRESHOLD) {
        isPinching = true;
    } else if (isPinching && normalizedPinch > PINCH_END_THRESHOLD) {
        isPinching = false;
    }
}

export function resetPinchState() {
    isPinching = false;
}

export function emptyPalmHistory() {
    palmHistory = [];
}

export function resetVelocityTracking() {
    lastPalmCenter = null;
    lastFrameTime = performance.now();
}
