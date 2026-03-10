import { appState } from '../core/appState';
import { undoStack, clearCanvas } from '../drawing/drawingState';
import { Point2D } from '../types';

// ======================================================
// Interactive Guided Tutorial
// Floating overlay that listens for real gestures
// Advances on success, shows hints after 5s
// ======================================================

const STORAGE_KEY = 'doodl_tutorial_seen';

interface TutorialStep {
    id: number;
    title: string;
    instruction: string;
    hintText: string;
    hintSvg?: string;
    checkSuccess: (pose: string, landmarks: Point2D[]) => boolean;
}

// Inline SVGs for hand diagrams
const SVG_HAND_POINT = `<svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v8"/><path d="M12 10l-2-2"/><path d="M12 10l2-2"/><path d="M7 11v8a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9"/><path d="M15 9V7a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v4"/></svg>`;
const SVG_HAND_TWO = `<svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v8"/><path d="M14 2v8"/><path d="M7 11v8a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9"/><path d="M15 9V7a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v4"/></svg>`;
const SVG_HAND_PALM = `<svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v8"/><path d="M8 3v7"/><path d="M16 3v7"/><path d="M4 8v5"/><path d="M20 8v5"/><path d="M7 13v6a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V13"/></svg>`;
const SVG_PINCH_ANIM = `<svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><path d="M10 12c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2z"/><path d="M8 12h-3"/><path d="M19 12h-3"/></svg>`;

let tutorialActive = false;
let currentStepIdx = 0;
let overlayEl: HTMLElement | null = null;
let hintTimer: any = null;
let initialUndoCount = 0;
let initialColor = '';
let thumbUpSeen = false;
let thumbDownSeen = false;
let successAdvanceTimer: any = null;

const STEPS: TutorialStep[] = [
    {
        id: 1,
        title: 'Draw something',
        instruction: 'Raise your index finger and draw anything',
        hintText: 'Keep your palm facing the camera with your index finger extended.',
        hintSvg: SVG_HAND_POINT,
        checkSuccess: (pose) => {
            return pose === 'POINT' && undoStack.length > initialUndoCount;
        }
    },
    {
        id: 2,
        title: 'Lift the pen',
        instruction: 'Flash a peace sign to lift the pen',
        hintText: 'Extend both your index and middle fingers.',
        hintSvg: SVG_HAND_TWO,
        checkSuccess: (pose) => {
            return pose === 'TWO_FINGERS';
        }
    },
    {
        id: 3,
        title: 'Pick a color',
        instruction: 'Pinch and move your hand to browse colors, then release to pick one',
        hintText: 'Pinch your thumb and index together, move sideways, then let go.',
        hintSvg: SVG_PINCH_ANIM,
        checkSuccess: () => {
            return appState.currentColor !== initialColor;
        }
    },
    {
        id: 4,
        title: 'Undo and redo',
        instruction: 'Thumbs down to undo · Thumbs up to redo',
        hintText: 'Make a mark first, then try thumbs down.',
        checkSuccess: (pose) => {
            if (pose === 'THUMBS_UP') thumbUpSeen = true;
            if (pose === 'THUMBS_DOWN') thumbDownSeen = true;
            return thumbUpSeen && thumbDownSeen;
        }
    },
    {
        id: 5,
        title: 'Erase',
        instruction: 'Open your palm to switch to eraser mode',
        hintText: 'Show all five fingers spread wide.',
        hintSvg: SVG_HAND_PALM,
        checkSuccess: (pose) => {
            return pose === 'OPEN_PALM' && appState.currentMode === 'ERASE';
        }
    },
    {
        id: 6,
        title: 'Done',
        instruction: "You're ready.",
        hintText: 'Now go doodle.',
        checkSuccess: () => false // Handled by button
    }
];

export function showTutorialIfNeeded() {
    try {
        if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {
        // Safe fail
    }
    startTutorial();
}

export function startTutorial() {
    if (tutorialActive) return;
    tutorialActive = true;
    currentStepIdx = 0;

    // Clear flags
    thumbUpSeen = false;
    thumbDownSeen = false;

    injectStyles();
    createOverlay();
    goToStep(0);
}

function injectStyles() {
    if (document.getElementById('tut-styles')) return;
    const style = document.createElement('style');
    style.id = 'tut-styles';
    style.textContent = `
        .tut-overlay {
            position: fixed;
            inset: 0;
            z-index: 11000;
            background: rgba(247, 246, 242, 0.4);
            backdrop-filter: blur(2px);
            -webkit-backdrop-filter: blur(2px);
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.4s ease;
        }
        .tut-overlay.visible {
            opacity: 1;
            pointer-events: auto;
        }
        .tut-panel {
            background: var(--bg-surface, #F7F6F2);
            border: 1px solid var(--border-panel, #D6D1CD);
            border-radius: 20px;
            box-shadow: 0 12px 48px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06);
            width: 420px;
            max-width: 90vw;
            padding: 40px 32px;
            text-align: center;
            position: relative;
            transform: scale(0.95) translateY(10px);
            transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .tut-overlay.visible .tut-panel {
            transform: scale(1) translateY(0);
        }
        .tut-skip-btn {
            position: absolute;
            top: 20px;
            right: 24px;
            background: none;
            border: none;
            color: #928C86;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            padding: 8px;
            opacity: 0.7;
            transition: opacity 0.2s ease, transform 0.2s ease;
            pointer-events: auto;
            z-index: 5;
        }
        .tut-skip-btn:hover { opacity: 1; transform: translateX(2px); }

        .tut-step-id {
            font-size: 11px;
            font-weight: 700;
            color: #928C86;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            margin-bottom: 12px;
            display: block;
        }
        .tut-title {
            font-size: 22px;
            font-weight: 700;
            color: #43403D;
            margin-bottom: 8px;
            letter-spacing: -0.02em;
        }
        .tut-instruction {
            font-size: 16px;
            color: #645F5B;
            line-height: 1.4;
            margin-bottom: 24px;
        }
        .tut-hint-container {
            height: 140px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transform: translateY(10px);
            transition: opacity 0.5s ease, transform 0.5s ease;
        }
        .tut-hint-container.visible {
            opacity: 1;
            transform: translateY(0);
        }
        .tut-hint-svg {
            color: #43403D;
            margin-bottom: 12px;
        }
        .tut-hint-text {
            font-size: 13px;
            color: #928C86;
            font-style: italic;
            max-width: 280px;
        }
        
        .tut-success-check {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(0.5);
            width: 80px;
            height: 80px;
            background: #34C759;
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.2s ease;
            box-shadow: 0 4px 12px rgba(52, 199, 89, 0.3);
            z-index: 10;
            pointer-events: none;
        }
        .tut-success-check.active {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1.2);
        }

        .tut-done-btn {
            background: #43403D;
            color: white;
            border: none;
            border-radius: 12px;
            padding: 14px 32px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s ease, transform 0.2s ease;
            margin-top: 10px;
            pointer-events: auto;
        }
        .tut-done-btn:hover { background: #2C2A27; transform: translateY(-1px); }
        .tut-done-btn:active { transform: translateY(0); }

        .doodle-prompt {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 32px;
            font-weight: 500;
            color: #928C86;
            opacity: 0;
            pointer-events: none;
            transition: opacity 1s ease;
            z-index: 5000;
            user-select: none;
        }
        .doodle-prompt.visible {
            opacity: 0.3;
        }
        .doodle-prompt.fade-out {
            opacity: 0;
        }
    `;
    document.head.appendChild(style);
}

function createOverlay() {
    overlayEl = document.createElement('div');
    overlayEl.className = 'tut-overlay';

    const panel = document.createElement('div');
    panel.className = 'tut-panel';
    panel.innerHTML = `
        <button class="tut-skip-btn" id="tutSkip">Skip tutorial</button>
        <div class="tut-success-check" id="tutSuccess">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <div id="tutContent">
            <span class="tut-step-id" id="tutStepLabel"></span>
            <h2 class="tut-title" id="tutTitle"></h2>
            <p class="tut-instruction" id="tutInstruction"></p>
            <div class="tut-hint-container" id="tutHintContainer">
                <div class="tut-hint-svg" id="tutHintSvg"></div>
                <p class="tut-hint-text" id="tutHintText"></p>
            </div>
            <div id="tutFooter" style="display:none; margin-top:20px;">
                <button class="tut-done-btn" id="tutDoneBtn">Start drawing</button>
            </div>
        </div>
    `;

    overlayEl.appendChild(panel);
    document.body.appendChild(overlayEl);

    document.getElementById('tutSkip')!.addEventListener('click', () => {
        goToStep(STEPS.length - 1);
    });

    document.getElementById('tutDoneBtn')!.addEventListener('click', finishTutorial);

    // Initial show
    requestAnimationFrame(() => {
        overlayEl?.classList.add('visible');
    });
}

function goToStep(idx: number) {
    if (idx < 0 || idx >= STEPS.length) return;
    currentStepIdx = idx;
    const step = STEPS[idx];

    // Reset step states
    initialUndoCount = undoStack.length;
    initialColor = appState.currentColor;
    if (idx !== 3) { // Keep track of thumbs seen throughout step 4
        thumbUpSeen = false;
        thumbDownSeen = false;
    }

    if (hintTimer) clearTimeout(hintTimer);

    // Step 4 special logic: Ensure something is there to undo
    if (step.id === 4 && undoStack.length === 0) {
        createGhostStroke();
        initialUndoCount = undoStack.length;
    }

    // UI Update
    document.getElementById('tutTitle')!.textContent = step.title;
    document.getElementById('tutInstruction')!.textContent = step.instruction;
    document.getElementById('tutStepLabel')!.textContent = idx === STEPS.length - 1 ? '' : `Step ${idx + 1} of 5`;

    const hintContainer = document.getElementById('tutHintContainer')!;
    hintContainer.classList.remove('visible');

    const footer = document.getElementById('tutFooter')!;
    footer.style.display = idx === STEPS.length - 1 ? 'block' : 'none';

    // Step 6 has a subline
    if (idx === STEPS.length - 1) {
        document.getElementById('tutHintText')!.textContent = step.hintText;
        hintContainer.classList.add('visible');
        document.getElementById('tutHintSvg')!.innerHTML = '';
        document.getElementById('tutSkip')!.style.display = 'none';
    } else {
        // Start hint timer
        hintTimer = setTimeout(() => {
            document.getElementById('tutHintText')!.textContent = step.hintText;
            document.getElementById('tutHintSvg')!.innerHTML = step.hintSvg || '';
            hintContainer.classList.add('visible');
        }, 5000);
    }
}

function createGhostStroke() {
    // Add a tiny dot so undo has context
    undoStack.push({
        type: 'stroke',
        mode: 'DRAW',
        color: appState.currentColor,
        width: 3,
        segments: [],
        dot: { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    });
}

export function handleGestureUpdate(pose: string, landmarks: Point2D[]) {
    if (!tutorialActive || currentStepIdx >= STEPS.length - 1) return;

    const step = STEPS[currentStepIdx];
    if (step.checkSuccess(pose, landmarks)) {
        onStepSuccess();
    }
}

function onStepSuccess() {
    if (successAdvanceTimer) return; // Already advancing

    const successEl = document.getElementById('tutSuccess')!;
    successEl.classList.add('active');

    successAdvanceTimer = setTimeout(() => {
        successEl.classList.remove('active');
        successAdvanceTimer = null;
        goToStep(currentStepIdx + 1);
    }, 600);
}

function finishTutorial() {
    try {
        localStorage.setItem(STORAGE_KEY, '1');
    } catch {
        // Safe fail
    }

    tutorialActive = false;
    overlayEl?.classList.remove('visible');

    setTimeout(() => {
        overlayEl?.remove();
        overlayEl = null;

        // Clear canvas
        clearCanvas();

        // Show "now go doodle" prompt
        showFinalPrompt();
    }, 400);
}

function showFinalPrompt() {
    const prompt = document.createElement('div');
    prompt.className = 'doodle-prompt';
    prompt.textContent = 'now go doodle';
    document.body.appendChild(prompt);

    requestAnimationFrame(() => prompt.classList.add('visible'));

    // Listen for first stroke to fade it out
    const fadeOut = () => {
        prompt.classList.add('fade-out');
        setTimeout(() => prompt.remove(), 1000);
        window.removeEventListener('stroke-started', fadeOut);
    };
    window.addEventListener('stroke-started', fadeOut);
}

export function isTutorialActive() {
    return tutorialActive;
}
