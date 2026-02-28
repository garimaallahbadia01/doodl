/* ============================================
   AIR CANVAS — Application Logic
   Modern @mediapipe/tasks-vision API (CDN)
   ============================================ */

// ─── Constants ──────────────────────────────
const PINCH_THRESHOLD = 0.05;       // meters — world coords
const MIN_MOVE_THRESHOLD = 8;       // px
const SMOOTHING_BUFFER_SIZE = 8;    // frames
const DOT_HOLD_TIME = 200;          // ms
const STROKE_WIDTH = 3;             // px
const DEFAULT_COLOR = "#111111";
const ERASER_RADIUS = 24;           // px
const MAX_GAP_FRAMES = 3;           // frames

// ─── DOM Elements ───────────────────────────
const video = document.getElementById("webcam");
const drawCanvas = document.getElementById("drawingCanvas");
const drawCtx = drawCanvas.getContext("2d");
const skelCanvas = document.getElementById("skeletonCanvas");
const skelCtx = skelCanvas.getContext("2d");
const canvasPanel = document.getElementById("canvasPanel");
const pipPanel = document.getElementById("pipPanel");
const trackerDot = document.getElementById("trackerDot");
const loadingOv = document.getElementById("loadingOverlay");
const loadingTxt = document.getElementById("loadingStatus");
const cameraDenied = document.getElementById("cameraDenied");
const retryBtn = document.getElementById("retryCamera");
const clearBtn = document.getElementById("clearCanvas");
const eraserBtn = document.getElementById("eraserTool");
const camToggleBtn = document.getElementById("cameraToggle");
const swatches = document.querySelectorAll(".color-swatch");
const onboardHint = document.getElementById("onboardingHint");

// ─── State ──────────────────────────────────
let handLandmarker = null;
let drawingUtils = null;
let color = DEFAULT_COLOR;
let drawing = false;
let lastX = null, lastY = null;   // last raw point
let drawX = null, drawY = null;   // where last bezier ended
let posBuffer = [];
let lastVidTime = -1;
let eraserMode = false;
let gapFrames = 0;
let lastSmoothed = null;
let camOn = true;
let pinchT0 = null;
let pinchP0 = null;
let moved = false;
let dotDone = false;
let strokes = [];
let curStroke = null;

// ─── Initialize ─────────────────────────────
async function init() {
  try {
    loadingTxt.textContent = "Loading hand tracking model…";
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
      minHandDetectionConfidence: 0.7,
      minHandPresenceConfidence: 0.7,
      minTrackingConfidence: 0.7,
    });
    drawingUtils = new DrawingUtils(skelCtx);
    loadingTxt.textContent = "Requesting camera access…";
    await startCamera();
  } catch (err) {
    console.warn("Init failed:", err);
  }
}

// ─── Camera ─────────────────────────────────
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    video.srcObject = stream;
    video.addEventListener("loadeddata", () => {
      resizeAll();
      loadingOv.classList.add("hidden");
      setTimeout(() => { loadingOv.style.display = "none"; }, 500);
      detectLoop();
    });
  } catch (err) {
    console.warn("Camera denied:", err);
    loadingOv.style.display = "none";
    cameraDenied.style.display = "flex";
  }
}

retryBtn.addEventListener("click", () => {
  cameraDenied.style.display = "none";
  loadingOv.style.display = "flex";
  loadingOv.classList.remove("hidden");
  startCamera();
});

// ─── Canvas Sizing ──────────────────────────
function resizeAll() {
  const pr = canvasPanel.getBoundingClientRect();
  drawCanvas.width = pr.width;
  drawCanvas.height = pr.height;
  const pip = pipPanel.getBoundingClientRect();
  skelCanvas.width = pip.width;
  skelCanvas.height = pip.height;
  redrawStrokes();
}

function redrawStrokes() {
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  for (const s of strokes) {
    if (s.points.length < 2) continue;
    drawCtx.beginPath();
    drawCtx.strokeStyle = s.color;
    drawCtx.lineWidth = s.width;
    drawCtx.lineCap = "round";
    drawCtx.lineJoin = "round";
    const p = s.points;
    const tx = (pt) => pt.x * drawCanvas.width;
    const ty = (pt) => pt.y * drawCanvas.height;
    drawCtx.moveTo(tx(p[0]), ty(p[0]));
    if (p.length === 2) {
      drawCtx.lineTo(tx(p[1]), ty(p[1]));
    } else {
      for (let i = 1; i < p.length - 1; i++) {
        const mx = (tx(p[i]) + tx(p[i + 1])) / 2;
        const my = (ty(p[i]) + ty(p[i + 1])) / 2;
        drawCtx.quadraticCurveTo(tx(p[i]), ty(p[i]), mx, my);
      }
      drawCtx.lineTo(tx(p[p.length - 1]), ty(p[p.length - 1]));
    }
    drawCtx.stroke();
  }
}

window.addEventListener("resize", resizeAll);

// ─── Detection Loop ─────────────────────────
function detectLoop() {
  if (!handLandmarker || !video.videoWidth) {
    requestAnimationFrame(detectLoop);
    return;
  }
  const nowMs = performance.now();
  if (video.currentTime !== lastVidTime) {
    lastVidTime = video.currentTime;
    const results = handLandmarker.detectForVideo(video, nowMs);
    processResults(results);
  }
  requestAnimationFrame(detectLoop);
}

// ─── Smoothing ──────────────────────────────
function smooth(rx, ry) {
  posBuffer.push({ x: rx, y: ry });
  if (posBuffer.length > SMOOTHING_BUFFER_SIZE) posBuffer.shift();
  let tw = 0, sx = 0, sy = 0;
  posBuffer.forEach((p, i) => {
    const w = i + 1;
    sx += p.x * w;
    sy += p.y * w;
    tw += w;
  });
  return { x: sx / tw, y: sy / tw };
}

// ─── Process Results ────────────────────────
function processResults(results) {
  // Clear skeleton overlay every frame
  skelCtx.clearRect(0, 0, skelCanvas.width, skelCanvas.height);

  if (!results || !results.landmarks || results.landmarks.length === 0) {
    gapFrames++;
    if (gapFrames > MAX_GAP_FRAMES) {
      trackerDot.classList.remove("visible", "drawing");
      if (drawing) stopDraw();
      posBuffer = [];
      lastSmoothed = null;
      pinchT0 = null;
    }
    return;
  }

  const lm = results.landmarks[0];

  // ── Skeleton on PIP ──
  drawingUtils.drawConnectors(lm, HandLandmarker.HAND_CONNECTIONS, {
    color: "#00FF00", lineWidth: 2,
  });
  drawingUtils.drawLandmarks(lm, {
    color: "#FF0000", radius: 4,
  });

  // ── Coordinate mapping to drawing canvas panel ──
  const rect = drawCanvas.getBoundingClientRect();
  const idx = lm[8]; // index fingertip
  const canvasX = (1 - idx.x) * rect.width;
  const canvasY = idx.y * rect.height;

  const sm = smooth(canvasX, canvasY);

  // ── Gap interpolation ──
  if (gapFrames > 0 && gapFrames <= MAX_GAP_FRAMES && drawing && lastSmoothed) {
    for (let i = 1; i <= gapFrames; i++) {
      const t = i / (gapFrames + 1);
      drawTo(
        lastSmoothed.x + (sm.x - lastSmoothed.x) * t,
        lastSmoothed.y + (sm.y - lastSmoothed.y) * t
      );
    }
  }
  gapFrames = 0;
  lastSmoothed = { x: sm.x, y: sm.y };

  // ── Tracker dot (screen coords) ──
  trackerDot.style.left = (sm.x + rect.left) + "px";
  trackerDot.style.top = (sm.y + rect.top) + "px";
  trackerDot.classList.add("visible");

  // ── Pinch detection via worldLandmarks ──
  const wl = results.worldLandmarks[0];
  const t4 = wl[4], t8 = wl[8];
  const pd = Math.sqrt(
    (t4.x - t8.x) ** 2 + (t4.y - t8.y) ** 2 + (t4.z - t8.z) ** 2
  );
  const pinch = pd < PINCH_THRESHOLD;

  if (pinch) {
    trackerDot.classList.add("drawing");
    if (eraserMode) {
      eraseAt(sm.x, sm.y);
    } else if (!drawing) {
      startDraw(sm.x, sm.y);
      pinchT0 = performance.now();
      pinchP0 = { x: sm.x, y: sm.y };
      moved = false;
      dotDone = false;
    } else {
      // Hold-to-dot detection
      if (!moved) {
        const d = Math.hypot(sm.x - pinchP0.x, sm.y - pinchP0.y);
        if (d >= MIN_MOVE_THRESHOLD) {
          moved = true;
        } else if (!dotDone && performance.now() - pinchT0 > DOT_HOLD_TIME) {
          drawCtx.beginPath();
          drawCtx.moveTo(pinchP0.x, pinchP0.y);
          drawCtx.lineTo(pinchP0.x + 0.1, pinchP0.y);
          drawCtx.strokeStyle = color;
          drawCtx.lineWidth = STROKE_WIDTH;
          drawCtx.lineCap = "round";
          drawCtx.stroke();
          if (curStroke) {
            curStroke.points.push({
              x: pinchP0.x / drawCanvas.width,
              y: pinchP0.y / drawCanvas.height,
            });
          }
          dotDone = true;
        }
      }
      drawTo(sm.x, sm.y);
    }
  } else {
    trackerDot.classList.remove("drawing");
    if (drawing) stopDraw();
    pinchT0 = null;
  }
}

// ─── Drawing ────────────────────────────────
function startDraw(x, y) {
  drawing = true;
  lastX = x; lastY = y;
  drawX = x; drawY = y;
  curStroke = {
    color: color,
    width: STROKE_WIDTH,
    points: [{ x: x / drawCanvas.width, y: y / drawCanvas.height }],
  };
}

function drawTo(x, y) {
  if (lastX === null) { lastX = x; lastY = y; drawX = x; drawY = y; return; }
  const d = Math.hypot(x - lastX, y - lastY);
  if (d < MIN_MOVE_THRESHOLD) return;

  const mx = (lastX + x) / 2;
  const my = (lastY + y) / 2;
  drawCtx.beginPath();
  drawCtx.moveTo(drawX, drawY);
  drawCtx.quadraticCurveTo(lastX, lastY, mx, my);
  drawCtx.strokeStyle = color;
  drawCtx.lineWidth = STROKE_WIDTH;
  drawCtx.lineCap = "round";
  drawCtx.lineJoin = "round";
  drawCtx.stroke();

  if (curStroke) {
    curStroke.points.push({ x: x / drawCanvas.width, y: y / drawCanvas.height });
  }
  drawX = mx; drawY = my;
  lastX = x; lastY = y;
}

function stopDraw() {
  if (drawX !== null && lastX !== null && (drawX !== lastX || drawY !== lastY)) {
    drawCtx.beginPath();
    drawCtx.moveTo(drawX, drawY);
    drawCtx.lineTo(lastX, lastY);
    drawCtx.strokeStyle = color;
    drawCtx.lineWidth = STROKE_WIDTH;
    drawCtx.lineCap = "round";
    drawCtx.lineJoin = "round";
    drawCtx.stroke();
  }
  drawing = false;
  lastX = lastY = drawX = drawY = null;
  if (curStroke && curStroke.points.length > 1) strokes.push(curStroke);
  curStroke = null;
}

// ─── Eraser ─────────────────────────────────
function eraseAt(x, y) {
  const nx = x / drawCanvas.width;
  const ny = y / drawCanvas.height;
  const rx = ERASER_RADIUS / drawCanvas.width;
  const ry = ERASER_RADIUS / drawCanvas.height;
  strokes = strokes.filter((s) =>
    !s.points.some((p) => Math.hypot((p.x - nx) / rx, (p.y - ny) / ry) < 1)
  );
  redrawStrokes();
}

// ─── Event Listeners ────────────────────────
eraserBtn.addEventListener("click", () => {
  eraserMode = !eraserMode;
  eraserBtn.classList.toggle("active", eraserMode);
  trackerDot.classList.toggle("erasing", eraserMode);
  if (eraserMode) {
    swatches.forEach((s) => s.classList.remove("active"));
  } else {
    swatches.forEach((s) => {
      if (s.dataset.color === color) s.classList.add("active");
    });
  }
});

swatches.forEach((sw) => {
  sw.addEventListener("click", () => {
    swatches.forEach((s) => s.classList.remove("active"));
    sw.classList.add("active");
    color = sw.dataset.color;
    eraserMode = false;
    eraserBtn.classList.remove("active");
    trackerDot.classList.remove("erasing");
  });
});

clearBtn.addEventListener("click", () => {
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  strokes = [];
  curStroke = null;
});

camToggleBtn.addEventListener("click", () => {
  camOn = !camOn;
  pipPanel.style.opacity = camOn ? "1" : "0";
  camToggleBtn.classList.toggle("active", !camOn);
});

onboardHint.addEventListener("animationend", () => {
  onboardHint.style.display = "none";
});

// ─── Start ──────────────────────────────────
init();
