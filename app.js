/* ============================================
   AIR CANVAS — Application Logic
   ============================================ */

import {
  HandLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs";

// ─── Constants ──────────────────────────────
const PINCH_THRESHOLD = 0.18; // ratio — pinch distance relative to hand size (screen space)
const SMOOTHING_BASE = 6; // base smoothing window size
const SMOOTHING_MAX = 10; // max smoothing when hand is rotating fast
const ROTATION_THRESHOLD = 0.15; // radians — angular change per frame to trigger extra smoothing
const STROKE_WIDTH = 4;
const DEFAULT_COLOR = "#111111";
const MIN_MOVE_DISTANCE = 10; // px — ignore movements smaller than this (tremor filter)
const MAX_CURSOR_JUMP = 40; // px — ignore single-frame jumps larger than this (tracking error)
const ERASER_RADIUS = 24; // px — how close a stroke point must be to erase it
const STABLE_BLEND = 0.7; // weight for raw landmark vs chain-projected tip (0–1, higher = more raw)
const MAX_GAP_FRAMES = 3; // max frames hand can be lost without breaking the stroke
const HOLD_DOT_TIME = 200; // ms — how long to hold pinch without moving to draw a dot

// ─── DOM Elements ───────────────────────────
const video = document.getElementById("webcam");
const canvas = document.getElementById("drawingCanvas");
const ctx = canvas.getContext("2d");
const trackerDot = document.getElementById("trackerDot");
const loadingOverlay = document.getElementById("loadingOverlay");
const loadingStatus = document.getElementById("loadingStatus");
const cameraDenied = document.getElementById("cameraDenied");
const retryBtn = document.getElementById("retryCamera");
const clearBtn = document.getElementById("clearCanvas");
const eraserBtn = document.getElementById("eraserTool");
const cameraToggleBtn = document.getElementById("cameraToggle");
const cameraPip = document.getElementById("cameraPip");
const swatches = document.querySelectorAll(".color-swatch");
const onboardingHint = document.getElementById("onboardingHint");
const canvasArea = document.querySelector(".canvas-area");

// ─── State ──────────────────────────────────
let handLandmarker = null;
let currentColor = DEFAULT_COLOR;
let isDrawing = false;
let lastX = null;
let lastY = null;
let positionBuffer = []; // for rolling average smoothing
let animFrameId = null;
let eraserMode = false;
let prevHandAngle = null; // previous frame's wrist→middle-base angle
let dynamicSmoothingWindow = SMOOTHING_BASE;
let framesWithoutHand = 0; // count frames hand is missing for gap tolerance
let lastSmoothedPos = null; // last known smoothed position for interpolation
let cameraOn = true; // camera visibility toggle
let pinchStartTime = null;
let pinchStartPos = null;
let hasMovedSincePinch = false;
let dotDrawn = false;

// ─── Stroke buffer for redraw on resize ─────
// Each stroke: { color, width, points: [{x, y}] }
let strokes = [];
let currentStroke = null;

// ─── Initialize ─────────────────────────────
async function init() {
  try {
    loadingStatus.textContent = "Loading hand tracking model…";
    await initHandLandmarker();
    loadingStatus.textContent = "Requesting camera access…";
    await startCamera();
  } catch (err) {
    console.warn("Initialization failed:", err);
  }
}

// ─── MediaPipe Hand Landmarker ──────────────
async function initHandLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );

  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 1,
  });
}

// ─── Camera ─────────────────────────────────
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    video.srcObject = stream;

    // Clone video stream into PIP window
    const pipVideo = document.createElement("video");
    pipVideo.id = "webcamPip";
    pipVideo.autoplay = true;
    pipVideo.playsInline = true;
    pipVideo.muted = true;
    pipVideo.srcObject = stream;
    pipVideo.style.width = "100%";
    pipVideo.style.height = "100%";
    pipVideo.style.objectFit = "cover";
    pipVideo.style.transform = "scaleX(-1)";
    cameraPip.insertBefore(pipVideo, cameraPip.firstChild);

    video.addEventListener("loadeddata", onCameraReady);
  } catch (err) {
    console.warn("Camera access denied:", err);
    showCameraDenied();
  }
}

function onCameraReady() {
  resizeCanvas();
  // Hide loading overlay
  loadingOverlay.classList.add("hidden");
  setTimeout(() => {
    loadingOverlay.style.display = "none";
  }, 500);
  // Start detection loop
  detectLoop();
}

function showCameraDenied() {
  loadingOverlay.style.display = "none";
  cameraDenied.style.display = "flex";
}

retryBtn.addEventListener("click", () => {
  cameraDenied.style.display = "none";
  loadingOverlay.style.display = "flex";
  loadingOverlay.classList.remove("hidden");
  startCamera();
});

// ─── Canvas Resize ──────────────────────────
function resizeCanvas() {
  const rect = canvasArea.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  redrawStrokes();
}

function redrawStrokes() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const stroke of strokes) {
    if (stroke.points.length < 2) continue;
    ctx.beginPath();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const pts = stroke.points;
    const toX = (p) => p.x * canvas.width;
    const toY = (p) => p.y * canvas.height;

    ctx.moveTo(toX(pts[0]), toY(pts[0]));

    if (pts.length === 2) {
      ctx.lineTo(toX(pts[1]), toY(pts[1]));
    } else {
      // Quadratic bezier through midpoints for smooth curves
      for (let i = 1; i < pts.length - 1; i++) {
        const midX = (toX(pts[i]) + toX(pts[i + 1])) / 2;
        const midY = (toY(pts[i]) + toY(pts[i + 1])) / 2;
        ctx.quadraticCurveTo(toX(pts[i]), toY(pts[i]), midX, midY);
      }
      // Draw to the last point
      ctx.lineTo(toX(pts[pts.length - 1]), toY(pts[pts.length - 1]));
    }
    ctx.stroke();
  }
}

window.addEventListener("resize", resizeCanvas);

// ─── Detection Loop ─────────────────────────
function detectLoop() {
  if (!handLandmarker || !video.videoWidth) {
    animFrameId = requestAnimationFrame(detectLoop);
    return;
  }

  // Force detection on every animation frame (max speed)
  const now = performance.now();
  const results = handLandmarker.detectForVideo(video, now);
  processResults(results);

  animFrameId = requestAnimationFrame(detectLoop);
}

// ─── Stabilized Fingertip Position ──────────
function getStableFingertip(landmarks) {
  const dip = landmarks[7];
  const tip = landmarks[8];

  const dirX = tip.x - dip.x;
  const dirY = tip.y - dip.y;

  const projX = dip.x + dirX;
  const projY = dip.y + dirY;

  return {
    x: tip.x * STABLE_BLEND + projX * (1 - STABLE_BLEND),
    y: tip.y * STABLE_BLEND + projY * (1 - STABLE_BLEND),
  };
}

// ─── Hand Rotation Detection ────────────────
function getHandAngle(landmarks) {
  const wrist = landmarks[0];
  const middleBase = landmarks[9];
  return Math.atan2(middleBase.y - wrist.y, middleBase.x - wrist.x);
}

// ─── Coordinate Mapping ─────────────────────
// Maps normalized MediaPipe landmark coordinates (0-1) to the canvas element's
// exact pixel coordinates using getBoundingClientRect().
// The canvas is NOT the full window — it's a bounded area within the layout.
function mapToCanvas(normX, normY) {
  // Mirror X for selfie view, then scale to canvas dimensions
  return {
    x: (1 - normX) * canvas.width,
    y: normY * canvas.height,
  };
}

// ─── Process Hand Landmarks ─────────────────
function processResults(results) {
  if (!results || !results.landmarks || results.landmarks.length === 0) {
    framesWithoutHand++;
    if (framesWithoutHand > MAX_GAP_FRAMES) {
      trackerDot.classList.remove("visible", "drawing");
      if (isDrawing) {
        stopDrawing();
      }
      positionBuffer = [];
      prevHandAngle = null;
      lastSmoothedPos = null;
      pinchStartTime = null;
    }
    return;
  }

  const landmarks = results.landmarks[0];

  // ── Stabilized fingertip ──
  const stableTip = getStableFingertip(landmarks);

  // Map to canvas coordinates (not window coordinates)
  const mapped = mapToCanvas(stableTip.x, stableTip.y);
  const rawX = mapped.x;
  const rawY = mapped.y;

  // ── Jump Filter ──
  if (positionBuffer.length > 0) {
    const lastRaw = positionBuffer[positionBuffer.length - 1];
    const jumpDist = Math.hypot(rawX - lastRaw.x, rawY - lastRaw.y);

    if (jumpDist > MAX_CURSOR_JUMP) {
      framesWithoutHand++;
      if (framesWithoutHand > MAX_GAP_FRAMES) {
        trackerDot.classList.remove("visible", "drawing");
        if (isDrawing) stopDrawing();
        positionBuffer = [];
        prevHandAngle = null;
        lastSmoothedPos = null;
        pinchStartTime = null;
      }
      return;
    }
  }

  framesWithoutHand = 0;

  // ── Adaptive smoothing based on hand rotation ──
  const currentAngle = getHandAngle(landmarks);
  if (prevHandAngle !== null) {
    let angleDelta = Math.abs(currentAngle - prevHandAngle);
    if (angleDelta > Math.PI) angleDelta = 2 * Math.PI - angleDelta;

    if (angleDelta > ROTATION_THRESHOLD) {
      dynamicSmoothingWindow = Math.min(dynamicSmoothingWindow + 2, SMOOTHING_MAX);
    } else {
      dynamicSmoothingWindow = Math.max(dynamicSmoothingWindow - 1, SMOOTHING_BASE);
    }
  }
  prevHandAngle = currentAngle;

  // Smooth position with rolling average (dynamic window)
  positionBuffer.push({ x: rawX, y: rawY });
  while (positionBuffer.length > dynamicSmoothingWindow) {
    positionBuffer.shift();
  }

  const smoothed = getSmoothedPosition();

  // ── Interpolate if hand was briefly lost during drawing ──
  if (framesWithoutHand > 0 && framesWithoutHand <= MAX_GAP_FRAMES && isDrawing && lastSmoothedPos) {
    const steps = framesWithoutHand;
    for (let i = 1; i <= steps; i++) {
      const t = i / (steps + 1);
      const interpX = lastSmoothedPos.x + (smoothed.x - lastSmoothedPos.x) * t;
      const interpY = lastSmoothedPos.y + (smoothed.y - lastSmoothedPos.y) * t;
      drawTo(interpX, interpY);
    }
  }
  lastSmoothedPos = { x: smoothed.x, y: smoothed.y };

  // Update tracker dot (positioned relative to the canvas area)
  trackerDot.style.left = smoothed.x + "px";
  trackerDot.style.top = smoothed.y + "px";
  trackerDot.classList.add("visible");

  // Pinch detection — normalized by hand size
  const thumbTip = landmarks[4];
  const mappedThumb = mapToCanvas(thumbTip.x, thumbTip.y);

  const mappedWrist = mapToCanvas(landmarks[0].x, landmarks[0].y);
  const mappedMiddleMCP = mapToCanvas(landmarks[9].x, landmarks[9].y);

  const handSize = Math.hypot(
    mappedMiddleMCP.x - mappedWrist.x,
    mappedMiddleMCP.y - mappedWrist.y
  );

  const pinchDist = Math.hypot(smoothed.x - mappedThumb.x, smoothed.y - mappedThumb.y);
  const pinchRatio = pinchDist / (handSize || 1);

  console.log("Pinch Ratio:", pinchRatio.toFixed(3), "| Dist:", Math.round(pinchDist), "Size:", Math.round(handSize));

  if (pinchRatio < PINCH_THRESHOLD) {
    trackerDot.classList.add("drawing");
    if (eraserMode) {
      eraseAt(smoothed.x, smoothed.y);
    } else {
      if (!isDrawing) {
        startDrawing(smoothed.x, smoothed.y);
        pinchStartTime = performance.now();
        pinchStartPos = { x: smoothed.x, y: smoothed.y };
        hasMovedSincePinch = false;
        dotDrawn = false;
      } else {
        if (!hasMovedSincePinch) {
          const distFromStart = Math.hypot(smoothed.x - pinchStartPos.x, smoothed.y - pinchStartPos.y);
          if (distFromStart >= MIN_MOVE_DISTANCE) {
            hasMovedSincePinch = true;
          } else if (!dotDrawn && (performance.now() - pinchStartTime > HOLD_DOT_TIME)) {
            ctx.beginPath();
            ctx.moveTo(pinchStartPos.x, pinchStartPos.y);
            ctx.lineTo(pinchStartPos.x, pinchStartPos.y);
            ctx.strokeStyle = currentColor;
            ctx.lineWidth = STROKE_WIDTH;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.stroke();
            if (currentStroke) {
              currentStroke.points.push({ x: pinchStartPos.x / canvas.width, y: pinchStartPos.y / canvas.height });
            }
            dotDrawn = true;
          }
        }
        drawTo(smoothed.x, smoothed.y);
      }
    }
  } else {
    trackerDot.classList.remove("drawing");
    if (isDrawing) {
      stopDrawing();
    }
    pinchStartTime = null;
  }
}

// ─── Smoothing ──────────────────────────────
function getSmoothedPosition() {
  if (positionBuffer.length === 0) return { x: 0, y: 0 };

  let sumX = 0, sumY = 0, weightSum = 0;
  for (let i = 0; i < positionBuffer.length; i++) {
    const weight = i + 1;
    sumX += positionBuffer[i].x * weight;
    sumY += positionBuffer[i].y * weight;
    weightSum += weight;
  }
  return {
    x: sumX / weightSum,
    y: sumY / weightSum,
  };
}

// ─── Drawing ────────────────────────────────
function startDrawing(x, y) {
  isDrawing = true;
  lastX = x;
  lastY = y;
  currentStroke = {
    color: currentColor,
    width: STROKE_WIDTH,
    points: [{ x: x / canvas.width, y: y / canvas.height }],
  };
}

function drawTo(x, y) {
  if (lastX === null || lastY === null) {
    lastX = x;
    lastY = y;
    return;
  }

  const dist = Math.hypot(x - lastX, y - lastY);
  if (dist < MIN_MOVE_DISTANCE) return;

  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(x, y);
  ctx.strokeStyle = currentColor;
  ctx.lineWidth = STROKE_WIDTH;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  if (currentStroke) {
    currentStroke.points.push({ x: x / canvas.width, y: y / canvas.height });
  }

  lastX = x;
  lastY = y;
}

function stopDrawing() {
  isDrawing = false;
  lastX = null;
  lastY = null;
  if (currentStroke && currentStroke.points.length > 1) {
    strokes.push(currentStroke);
  }
  currentStroke = null;
}

// ─── Eraser ─────────────────────────────────
function eraseAt(x, y) {
  const nx = x / canvas.width;
  const ny = y / canvas.height;
  const radiusNX = ERASER_RADIUS / canvas.width;
  const radiusNY = ERASER_RADIUS / canvas.height;

  strokes = strokes.filter((stroke) => {
    return !stroke.points.some((p) => {
      const dx = p.x - nx;
      const dy = p.y - ny;
      return Math.hypot(dx / radiusNX, dy / radiusNY) < 1;
    });
  });
  redrawStrokes();
}

eraserBtn.addEventListener("click", () => {
  eraserMode = !eraserMode;
  eraserBtn.classList.toggle("active", eraserMode);
  trackerDot.classList.toggle("erasing", eraserMode);
  if (eraserMode) {
    swatches.forEach((s) => s.classList.remove("active"));
  } else {
    swatches.forEach((s) => {
      if (s.dataset.color === currentColor) s.classList.add("active");
    });
  }
});

// ─── Color Selection ────────────────────────
swatches.forEach((swatch) => {
  swatch.addEventListener("click", () => {
    swatches.forEach((s) => s.classList.remove("active"));
    swatch.classList.add("active");
    currentColor = swatch.dataset.color;
    eraserMode = false;
    eraserBtn.classList.remove("active");
    trackerDot.classList.remove("erasing");
  });
});

// ─── Clear Canvas ───────────────────────────
clearBtn.addEventListener("click", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  strokes = [];
  currentStroke = null;
});

// ─── Camera Toggle ──────────────────────────
cameraToggleBtn.addEventListener("click", () => {
  cameraOn = !cameraOn;
  cameraPip.classList.toggle("hidden", !cameraOn);
  cameraToggleBtn.classList.toggle("active", !cameraOn);
});

// ─── Remove onboarding hint after animation ─
onboardingHint.addEventListener("animationend", () => {
  onboardingHint.style.display = "none";
});

// ─── Start ──────────────────────────────────
init();
