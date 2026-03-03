import { PoseMode, Point2D } from '../types';
import { PINCH_START_THRESHOLD, PINCH_END_THRESHOLD, PINCH_RELEASE_TIMEOUT, INDEX_EXTENSION_RATIO, OTHERS_EXTENSION_RATIO, FAST_MOVEMENT_THRESHOLD, PALM_HISTORY_SIZE, PALM_STABILITY_THRESHOLD } from '../constants';

export let handVelocity = { x: 0, y: 0 };
export let palmHistory: Point2D[] = [];
export let isPinching = false;
let pinchReleaseStartTime = 0;
let lastPalmCenter: Point2D | null = null;
let lastFrameTime = 0;
let poseHistory: PoseMode[] = [];

export function isFingerExtended(landmarks: any[], tipIdx: number, pipIdx: number, ratio: number) {
    const wrist = landmarks[0];
    const tip = landmarks[tipIdx];
    const pip = landmarks[pipIdx];
    const distTip = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
    const distPip = Math.hypot(pip.x - wrist.x, pip.y - wrist.y);
    return distTip > distPip * ratio;
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
        index: isFingerExtended(landmarks, 8, 6, INDEX_EXTENSION_RATIO),
        middle: isFingerExtended(landmarks, 12, 10, OTHERS_EXTENSION_RATIO),
        ring: isFingerExtended(landmarks, 16, 14, OTHERS_EXTENSION_RATIO),
        pinky: isFingerExtended(landmarks, 20, 18, OTHERS_EXTENSION_RATIO)
    };
    const allCurled = !ext.index && !ext.middle && !ext.ring && !ext.pinky;

    let rawPose: PoseMode = 'NEUTRAL';

    if (ext.index && !ext.middle && !ext.ring && !ext.pinky) rawPose = 'POINT';
    else if (ext.index && ext.middle && !ext.ring && !ext.pinky) rawPose = 'TWO_FINGERS';
    else if (ext.thumb && allCurled) {
        const thumbTip = landmarks[4];
        const wrist = landmarks[0];
        if (thumbTip.y < wrist.y - 0.05) rawPose = 'THUMBS_UP';
        else if (thumbTip.y > wrist.y + 0.05) rawPose = 'THUMBS_DOWN';
    }
    else if (ext.thumb && ext.index && ext.middle && ext.ring && ext.pinky) rawPose = 'OPEN_PALM';
    else if (!ext.thumb && allCurled) rawPose = 'FIST';

    // Anti-flicker: 3-frame rolling window
    poseHistory.push(rawPose);
    if (poseHistory.length > 3) poseHistory.shift();

    // If POINT was detected twice in the last 3 frames, force POINT to bridge 1-frame drops
    if (poseHistory.filter(p => p === 'POINT').length >= 2) {
        return 'POINT';
    }

    return rawPose;
}

export function updatePalmCenter(landmarks: any[], outPoint: Point2D) {
    const w = landmarks[0], i = landmarks[5], p = landmarks[17];
    outPoint.x = (w.x + i.x + p.x) / 3;
    outPoint.y = (w.y + i.y + p.y) / 3;
}

const tempCenter = { x: 0, y: 0 };

export function updateVelocity(landmarks: any[]) {
    const now = performance.now();
    const dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    updatePalmCenter(landmarks, tempCenter);
    if (lastPalmCenter && dt > 0) {
        handVelocity.x = (tempCenter.x - lastPalmCenter.x) / dt;
        handVelocity.y = (tempCenter.y - lastPalmCenter.y) / dt;
    } else if (!lastPalmCenter) {
        lastPalmCenter = { x: 0, y: 0 };
    }
    lastPalmCenter.x = tempCenter.x;
    lastPalmCenter.y = tempCenter.y;
}

export function isHandMovingFast() {
    return Math.hypot(handVelocity.x, handVelocity.y) > FAST_MOVEMENT_THRESHOLD;
}

const tempCenterStable = { x: 0, y: 0 };

export function isPalmStable(landmarks: any[]) {
    updatePalmCenter(landmarks, tempCenterStable);
    if (palmHistory.length >= PALM_HISTORY_SIZE) {
        const oldest = palmHistory.shift()!;
        oldest.x = tempCenterStable.x;
        oldest.y = tempCenterStable.y;
        palmHistory.push(oldest);
    } else {
        palmHistory.push({ x: tempCenterStable.x, y: tempCenterStable.y });
    }
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
        pinchReleaseStartTime = 0;
    } else if (isPinching && normalizedPinch > PINCH_END_THRESHOLD) {
        if (pinchReleaseStartTime === 0) {
            pinchReleaseStartTime = performance.now();
        } else if (performance.now() - pinchReleaseStartTime > PINCH_RELEASE_TIMEOUT) {
            isPinching = false;
            pinchReleaseStartTime = 0;
        }
    } else if (isPinching && normalizedPinch <= PINCH_END_THRESHOLD) {
        pinchReleaseStartTime = 0;
    }
}

export function resetPinchState() {
    isPinching = false;
    pinchReleaseStartTime = 0;
}

export function emptyPalmHistory() {
    palmHistory = [];
}

export function resetVelocityTracking() {
    lastPalmCenter = null;
    lastFrameTime = performance.now();
}
