/* ============================================
   AIR CANVAS — Application Logic
   ============================================ */

import {
  HandLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs";

// ─── Constants ──────────────────────────────
const PINCH_THRESHOLD = 40; // px — distance between thumb tip & index tip to trigger draw
const SMOOTHING_BASE = 10; // base smoothing window size
const SMOOTHING_MAX = 16; // max smoothing when hand is rotating fast
const ROTATION_THRESHOLD = 0.15; // radians — angular change per frame to trigger extra smoothing
const STROKE_WIDTH = 4;
const DEFAULT_COLOR = "#111111";
const MIN_MOVE_DISTANCE = 3; // px — ignore movements smaller than this
const ERASER_RADIUS = 24; // px — how close a stroke point must be to erase it
const STABLE_BLEND = 0.7; // weight for raw landmark vs chain-projected tip (0–1, higher = more raw)
const MAX_GAP_FRAMES = 3; // max frames hand can be lost without breaking the stroke

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
const swatches = document.querySelectorAll(".color-swatch");
const onboardingHint = document.getElementById("onboardingHint");

// ─── State ──────────────────────────────────
let handLandmarker = null;
let currentColor = DEFAULT_COLOR;
let isDrawing = false;
let lastX = null;
let lastY = null;
let positionBuffer = []; // for rolling average smoothing
let animFrameId = null;
let lastVideoTime = -1;
let eraserMode = false;
let prevHandAngle = null; // previous frame's wrist→middle-base angle
let dynamicSmoothingWindow = SMOOTHING_BASE;
let framesWithoutHand = 0; // count frames hand is missing for gap tolerance
let lastSmoothedPos = null; // last known smoothed position for interpolation
let cameraOn = true; // camera visibility toggle

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
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
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

  const now = performance.now();
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const results = handLandmarker.detectForVideo(video, now);
    processResults(results);
  }

  animFrameId = requestAnimationFrame(detectLoop);
}

// ─── Stabilized Fingertip Position ──────────
// Blends the raw landmark #8 with a position projected along the
// index finger kinematic chain (#5 MCP → #6 PIP → #7 DIP → #8 TIP).
// This produces a more stable tip position when the hand rotates,
// because the chain direction is less noisy than the raw tip alone.
function getStableFingertip(landmarks) {
  const mcp = landmarks[5];  // Index MCP (base)
  const pip = landmarks[6];  // Index PIP
  const dip = landmarks[7];  // Index DIP
  const tip = landmarks[8];  // Index TIP (raw)

  // Direction along the last two joints (DIP → TIP)
  const dirX = tip.x - dip.x;
  const dirY = tip.y - dip.y;

  // Length from DIP to TIP
  const segLen = Math.hypot(dirX, dirY) || 0.001;

  // Project from DIP along that direction by the same length
  const projX = dip.x + dirX;
  const projY = dip.y + dirY;

  // Blend: STABLE_BLEND of raw tip + (1 - STABLE_BLEND) of chain-projected
  return {
    x: tip.x * STABLE_BLEND + projX * (1 - STABLE_BLEND),
    y: tip.y * STABLE_BLEND + projY * (1 - STABLE_BLEND),
  };
}

// ─── Hand Rotation Detection ────────────────
// Returns the angle (radians) from wrist (#0) to middle finger base (#9).
// Changes in this angle between frames indicate hand rotation.
function getHandAngle(landmarks) {
  const wrist = landmarks[0];
  const middleBase = landmarks[9];
  return Math.atan2(middleBase.y - wrist.y, middleBase.x - wrist.x);
}

// ─── Process Hand Landmarks ─────────────────
function processResults(results) {
  if (!results || !results.landmarks || results.landmarks.length === 0) {
    framesWithoutHand++;
    if (framesWithoutHand > MAX_GAP_FRAMES) {
      // Too many frames without hand — stop drawing and reset
      trackerDot.classList.remove("visible", "drawing");
      if (isDrawing) {
        stopDrawing();
      }
      positionBuffer = [];
      prevHandAngle = null;
      lastSmoothedPos = null;
    }
    // If within gap tolerance during drawing, keep state alive
    return;
  }

  const landmarks = results.landmarks[0]; // First hand
  const thumbTip = landmarks[4]; // Thumb tip

  // ── Stabilized fingertip ──
  const stableTip = getStableFingertip(landmarks);

  // Mirror X and convert to screen coordinates
  const rawX = (1 - stableTip.x) * canvas.width;
  const rawY = stableTip.y * canvas.height;

  // ── Adaptive smoothing based on hand rotation ──
  const currentAngle = getHandAngle(landmarks);
  if (prevHandAngle !== null) {
    let angleDelta = Math.abs(currentAngle - prevHandAngle);
    // Handle wrap-around at ±π
    if (angleDelta > Math.PI) angleDelta = 2 * Math.PI - angleDelta;

    if (angleDelta > ROTATION_THRESHOLD) {
      // Hand is rotating fast — increase smoothing to dampen jitter
      dynamicSmoothingWindow = Math.min(dynamicSmoothingWindow + 2, SMOOTHING_MAX);
    } else {
      // Hand is stable — ease back towards base smoothing
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
  framesWithoutHand = 0;
  lastSmoothedPos = { x: smoothed.x, y: smoothed.y };

  // Update tracker dot
  trackerDot.style.left = smoothed.x + "px";
  trackerDot.style.top = smoothed.y + "px";
  trackerDot.classList.add("visible");

  // Pinch detection — distance between thumb tip and index tip in screen space
  const thumbX = (1 - thumbTip.x) * canvas.width;
  const thumbY = thumbTip.y * canvas.height;
  const pinchDist = Math.hypot(smoothed.x - thumbX, smoothed.y - thumbY);

  if (pinchDist < PINCH_THRESHOLD) {
    trackerDot.classList.add("drawing");
    if (eraserMode) {
      // Eraser mode — remove strokes near cursor
      eraseAt(smoothed.x, smoothed.y);
    } else {
      // Drawing mode
      if (!isDrawing) {
        startDrawing(smoothed.x, smoothed.y);
      } else {
        drawTo(smoothed.x, smoothed.y);
      }
    }
  } else {
    // Not pinching — stop drawing
    trackerDot.classList.remove("drawing");
    if (isDrawing) {
      stopDrawing();
    }
  }
}

// ─── Smoothing ──────────────────────────────
function getSmoothedPosition() {
  if (positionBuffer.length === 0) return { x: 0, y: 0 };
  const sum = positionBuffer.reduce(
    (acc, pos) => ({ x: acc.x + pos.x, y: acc.y + pos.y }),
    { x: 0, y: 0 }
  );
  return {
    x: sum.x / positionBuffer.length,
    y: sum.y / positionBuffer.length,
  };
}

// ─── Drawing ────────────────────────────────
function startDrawing(x, y) {
  isDrawing = true;
  lastX = x;
  lastY = y;
  // Start a new stroke in buffer (store normalized coords for resize redraw)
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

  // Skip if finger hasn't moved enough — reduces micro-jitter
  const dist = Math.hypot(x - lastX, y - lastY);
  if (dist < MIN_MOVE_DISTANCE) return;

  // Draw continuous line from last position to current position.
  // Positions are already heavily smoothed (10–16 frame rolling average),
  // so lineTo between smoothed points produces smooth curves.
  // Stored strokes use bezier curves for even smoother redraw on resize.
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(x, y);
  ctx.strokeStyle = currentColor;
  ctx.lineWidth = STROKE_WIDTH;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  // Store normalized point
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
  // Commit current stroke to history
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
  // Deselect color swatches when eraser is active
  if (eraserMode) {
    swatches.forEach((s) => s.classList.remove("active"));
  } else {
    // Re-select the current color swatch
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
    // Deactivate eraser when a color is picked
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
  video.style.opacity = cameraOn ? "1" : "0";
  cameraToggleBtn.classList.toggle("active", !cameraOn);
});

// ─── Remove onboarding hint after animation ─
onboardingHint.addEventListener("animationend", () => {
  onboardingHint.style.display = "none";
});

// ─── Start ──────────────────────────────────
init();
