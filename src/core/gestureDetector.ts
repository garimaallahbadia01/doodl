import { PoseMode, Point2D } from '../types';
import { PINCH_START_THRESHOLD, PINCH_END_THRESHOLD, PINCH_RELEASE_TIMEOUT, INDEX_EXTENSION_RATIO, OTHERS_EXTENSION_RATIO, FAST_MOVEMENT_THRESHOLD, PALM_HISTORY_SIZE, PALM_STABILITY_THRESHOLD } from '../constants';

let previousPose: PoseMode = 'NEUTRAL';

export let handVelocity = { x: 0, y: 0 };
export let palmHistory: Point2D[] = [];
export let isPinching = false;
let pinchReleaseStartTime = 0;
let lastPalmCenter: Point2D | null = null;
let lastFrameTime = 0;
let poseHistory: PoseMode[] = [];

export function isFingerExtended(landmarks: any[], tipIdx: number, pipIdx: number, ratio: number) {
    const wrist = landmarks[0];
    const mcp = landmarks[pipIdx - 1]; // Node right before PIP is MCP
    const pip = landmarks[pipIdx];
    const tip = landmarks[tipIdx];

    // Check 1: Tip should be significantly further from the wrist than PIP
    const distTipToWrist = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
    const distPipToWrist = Math.hypot(pip.x - wrist.x, pip.y - wrist.y);

    // Check 2: Tip should be further from the MCP (base of finger) than the PIP is.
    // If a finger is curled into a fist, the tip folds inward and sits closer to the MCP.
    const distTipToMcp = Math.hypot(tip.x - mcp.x, tip.y - mcp.y);
    const distPipToMcp = Math.hypot(pip.x - mcp.x, pip.y - mcp.y);

    return (distTipToWrist > distPipToWrist * ratio) && (distTipToMcp > distPipToMcp);
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
    const pointRatio = (previousPose === 'POINT') ? INDEX_EXTENSION_RATIO * 0.9 : INDEX_EXTENSION_RATIO;
    // Use a slightly more lenient ratio for checking "other" fingers during complex poses
    const lowRatio = OTHERS_EXTENSION_RATIO * 0.85;

    const ext = {
        thumb: isThumbExtended(landmarks),
        index: isFingerExtended(landmarks, 8, 6, pointRatio),
        middle: isFingerExtended(landmarks, 12, 10, lowRatio),
        ring: isFingerExtended(landmarks, 16, 14, lowRatio),
        pinky: isFingerExtended(landmarks, 20, 18, lowRatio)
    };

    // Derived counts for leniency
    const fingersExtendedCount = (ext.index ? 1 : 0) + (ext.middle ? 1 : 0) + (ext.ring ? 1 : 0) + (ext.pinky ? 1 : 0);
    const totalHandExtendedCount = fingersExtendedCount + (ext.thumb ? 1 : 0);

    let rawPose: PoseMode = 'NEUTRAL';

    // POINT: Just index extended, nothing else (or maybe thumb)
    if (ext.index && (fingersExtendedCount === 1)) {
        rawPose = 'POINT';
    }
    // TWO_FINGERS: Index + Middle
    else if (ext.index && ext.middle && (fingersExtendedCount === 2)) {
        rawPose = 'TWO_FINGERS';
    }
    // THUMBS: Only thumb extended, at least 3 fingers curled
    else if (ext.thumb && (fingersExtendedCount <= 1)) {
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const wrist = landmarks[0];
        const middleMCP = landmarks[9];

        // Hand size for normalization
        const handSize = Math.hypot(middleMCP.x - wrist.x, middleMCP.y - wrist.y);
        const pinchDist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);

        // A Thumbs gesture requires the thumb to be clear of the index finger (un-pinched)
        // normalizedPinch of > 0.4 ensures thumb is extended away, not reaching for index
        if (handSize > 0 && (pinchDist / handSize) > 0.4) {
            if (thumbTip.y < wrist.y - 0.05) rawPose = 'THUMBS_UP';
            else if (thumbTip.y > wrist.y + 0.05) rawPose = 'THUMBS_DOWN';
        }
    }
    // OPEN_PALM: At least 4 fingers/thumb extended total
    else if (totalHandExtendedCount >= 4) {
        rawPose = 'OPEN_PALM';
    }
    // FIST: All fingers curled (strict check for safety)
    else if (!ext.thumb && !ext.index && !ext.middle && !ext.ring && !ext.pinky) {
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const wrist = landmarks[0];
        const middleMCP = landmarks[9];
        const handSize = Math.hypot(middleMCP.x - wrist.x, middleMCP.y - wrist.y);
        const pinchDist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
        const normalizedPinch = pinchDist / handSize;

        // A real fist usually doesn't have the index and thumb tips touching in an 'O' shape.
        // If they are touching (low pinch distance), it's likely a pinch starting or active.
        // We only allow FIST if the index and thumb are significantly apart.
        if (normalizedPinch > PINCH_START_THRESHOLD * 1.5) {
            rawPose = 'FIST';
        } else {
            rawPose = 'NEUTRAL';
        }
    }

    // Anti-flicker: 3-frame rolling window
    poseHistory.push(rawPose);
    if (poseHistory.length > 3) poseHistory.shift();

    // Consensus: If a pose appears in 2 out of 3 frames, it wins.
    const counts: Record<string, number> = {};
    poseHistory.forEach(p => counts[p] = (counts[p] || 0) + 1);

    for (const p in counts) {
        if (counts[p] >= 2) {
            previousPose = p as PoseMode;
            return p as PoseMode;
        }
    }

    return previousPose;
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

export function detectPinch(landmarks: any[], pose: string) {
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const wrist = landmarks[0];
    const middleMCP = landmarks[9];

    const handSize = Math.hypot(middleMCP.x - wrist.x, middleMCP.y - wrist.y);
    if (handSize === 0) return;

    const pinchDist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
    const normalizedPinch = pinchDist / handSize;

    // Prevent pinch detection if the hand is in an explicit conflicting gesture.
    // Note: We EXCLUDE 'FIST' here because a pinch can often be misidentified as a fist.
    // We want the pinch logic (which is distance-based) to take precedence.
    const isConflictingGesture = pose === 'THUMBS_UP' || pose === 'THUMBS_DOWN' || pose === 'TWO_FINGERS' || pose === 'OPEN_PALM';

    if (isConflictingGesture) {
        isPinching = false;
        pinchReleaseStartTime = 0;
        return;
    }

    // We don't strictly require index/thumb to be 'curled' according to the other algorithms
    // because when index and thumb touch, they are actually mostly extended towards each other.
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


// ======================================================
// Pinch Color Palette State Machine
// ======================================================
export type PinchPaletteState = 'CLOSED' | 'DWELLING' | 'BROWSING' | 'CANCELLING';
export let pinchPaletteState: PinchPaletteState = 'CLOSED';

let pinchStillStart = 0;
let lastPinchPos: Point2D | null = null;
let pinchStartPos: Point2D | null = null;  // Fixed origin, never updated during gesture
let hasBrowsed = false;
let pinchDwellStart = 0;                   // When pinch first started
let paletteOpenTime = 0;                   // When BROWSING started (for min confirm time)

const PINCH_CANCEL_HOLD = 2000;            // 2s hold-still to cancel
const PINCH_STILL_THRESHOLD = 8;           // px, considered "still" per frame
const PINCH_BROWSE_MIN_DISTANCE = 60;      // px, total distance from origin to count as "browsed"
const PINCH_DWELL_TIME = 400;              // ms pinch must be held before palette opens
const PINCH_MIN_OPEN_TIME = 500;           // ms palette must be open before release confirms

/**
 * Call every frame while hand is tracked.
 * Returns current state, midpoint position, and whether a confirm/cancel just fired.
 */
export function updatePinchPalette(landmarks: any[], currentlyPinching: boolean): {
    state: PinchPaletteState;
    position: Point2D;
    cancelled: boolean;
    confirmed: boolean;
} {
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const pos: Point2D = {
        x: (thumbTip.x + indexTip.x) / 2,
        y: (thumbTip.y + indexTip.y) / 2
    };

    let cancelled = false;
    let confirmed = false;

    if (pinchPaletteState === 'CLOSED') {
        if (currentlyPinching) {
            pinchPaletteState = 'DWELLING';
            pinchDwellStart = performance.now();
            lastPinchPos = { x: pos.x, y: pos.y };
        }
    } else if (pinchPaletteState === 'DWELLING') {
        if (!currentlyPinching) {
            // Released before dwell completed: silently reset
            pinchPaletteState = 'CLOSED';
            pinchDwellStart = 0;
            lastPinchPos = null;
        } else if (performance.now() - pinchDwellStart >= PINCH_DWELL_TIME) {
            // Dwell complete: open the palette
            pinchPaletteState = 'BROWSING';
            paletteOpenTime = performance.now();  // Track when palette actually opened
            pinchStillStart = 0;
            hasBrowsed = false;
            pinchStartPos = { x: pos.x, y: pos.y };  // Fixed origin starts NOW
            lastPinchPos = { x: pos.x, y: pos.y };
        }
    } else {
        if (!currentlyPinching) {
            // Released pinch: confirm only if browsed AND open long enough
            if (hasBrowsed && performance.now() - paletteOpenTime >= PINCH_MIN_OPEN_TIME) {
                confirmed = true;
            } else {
                cancelled = true;  // Too quick or didn't browse, cancel
            }
            pinchPaletteState = 'CLOSED';
            pinchStillStart = 0;
            lastPinchPos = null;
            pinchStartPos = null;
            hasBrowsed = false;
            pinchDwellStart = 0;
            paletteOpenTime = 0;
        } else {
            // Still pinching: check if user has browsed far enough from origin
            if (!hasBrowsed && pinchStartPos) {
                const totalDist = Math.hypot(pos.x - pinchStartPos.x, pos.y - pinchStartPos.y);
                if (totalDist > PINCH_BROWSE_MIN_DISTANCE) {
                    hasBrowsed = true;
                }
            }

            // Check per-frame movement for cancel hold detection
            const frameDist = lastPinchPos
                ? Math.hypot(pos.x - lastPinchPos.x, pos.y - lastPinchPos.y)
                : 0;

            if (frameDist < PINCH_STILL_THRESHOLD) {
                if (pinchStillStart === 0) {
                    pinchStillStart = performance.now();
                } else if (performance.now() - pinchStillStart > PINCH_CANCEL_HOLD) {
                    cancelled = true;
                    pinchPaletteState = 'CLOSED';
                    pinchStillStart = 0;
                    lastPinchPos = null;
                    pinchStartPos = null;
                    hasBrowsed = false;
                    pinchDwellStart = 0;
                    paletteOpenTime = 0;
                } else {
                    pinchPaletteState = 'CANCELLING';
                }
            } else {
                pinchPaletteState = 'BROWSING';
                pinchStillStart = 0;
            }
            lastPinchPos = { x: pos.x, y: pos.y };
        }
    }

    return { state: pinchPaletteState, position: pos, cancelled, confirmed };
}

export function resetPinchPalette() {
    pinchPaletteState = 'CLOSED';
    pinchStillStart = 0;
    lastPinchPos = null;
    pinchStartPos = null;
    hasBrowsed = false;
    pinchDwellStart = 0;
    paletteOpenTime = 0;
}

// ======================================================
// Idle Gesture Detection
// ======================================================
// Excludes POINT (drawing) and NEUTRAL (which can occur briefly due to tracking noise).
// Any other explicit gesture immediately ends any active stroke, bypassing the sticky grace period.
export function isIdleGesture(pose: PoseMode): boolean {
    return pose !== 'POINT' && pose !== 'NEUTRAL';
}
