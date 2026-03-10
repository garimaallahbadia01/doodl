import { appState } from '../core/appState';
import { undoStack, clearCanvas } from '../drawing/drawingState';
import { Point2D } from '../types';

// ======================================================
// Interactive Guided Tutorial
// ======================================================

const STORAGE_KEY = 'doodl_tutorial_seen';

interface TutorialStep {
    id: number;
    title: string;
    instruction: string;
    hintText: string;
    targetId?: string;
    hintHtml?: string;
    checkSuccess: (pose: string, landmarks: Point2D[]) => boolean;
}

const SVG_HAND_TWO = `<svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v8"/><path d="M14 2v8"/><path d="M7 11v8a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9"/><path d="M15 9V7a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v4"/></svg>`;
const SVG_DONE = `<svg width="100" height="100" viewBox="0 0 279 270" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M118.5 211V260.5L129 268.5L170 238L182 211L133.5 187L118.5 211Z" fill="#E6DEBE"/>
<path d="M257.152 68.7423L206.774 42.5082C205.794 41.998 205.414 40.7903 205.924 39.8106L210.311 31.3846L214.699 22.9586C215.209 21.9789 216.417 21.5982 217.397 22.1084L267.775 48.3425C268.755 48.8526 269.136 50.0604 268.625 51.0401L259.85 67.8921C259.34 68.8718 258.132 69.2524 257.152 68.7423Z" fill="#E6DEBE"/>
<path d="M258.768 69.166L234.5 113.166L179.5 219.666L126.5 194.455L205 40.8L258.768 69.166Z" fill="#D6D1CD"/>
<path d="M119 246.808L119.13 260.618L129.137 268.684L148.036 254.774L119 246.808Z" fill="#43403D"/>
<path d="M215.627 59.8625C223.187 59.5625 230.767 59.3025 238.327 58.8125L205.147 41.7025L152.547 143.692C156.397 151.272 152.157 161.762 152.157 161.762C159.477 164.822 163.267 169.362 163.267 169.362C165.897 172.552 161.007 174.952 161.007 174.952C161.007 174.952 162.517 177.782 160.387 180.072C158.357 182.252 156.627 181.582 156.457 181.512C156.597 181.702 158.347 184.242 155.997 186.642C154.777 187.892 152.257 188.072 152.257 188.072C152.257 188.072 153.617 192.152 148.237 192.222C144.477 192.282 136.507 186.872 132.037 183.602C131.357 184.902 130.947 185.662 130.917 185.662L130.557 186.362C133.797 190.552 136.477 195.512 133.317 196.412C131.437 196.952 129.027 196.042 126.587 194.052L117.857 210.992C118.277 210.372 126.107 199.142 132.367 202.372C138.807 205.692 136.887 214.982 136.887 214.982C136.887 214.982 142.187 205.212 151.407 209.972C160.647 214.742 155.747 224.702 155.747 224.702C155.747 224.702 162.217 217.762 168.657 221.092C174.707 224.202 170.637 236.282 170.107 237.792L234.317 113.292C233.347 113.512 232.337 113.462 231.437 112.942C229.717 111.952 229.377 109.772 230.017 108.022C230.627 106.362 231.737 104.992 232.917 103.682C234.087 102.372 236.817 101.682 238.217 100.602C238.557 100.342 239.477 99.4025 239.847 99.1525C235.657 99.3425 229.477 99.7125 225.317 100.352C219.367 101.262 215.697 101.822 209.667 102.002C207.147 102.072 200.617 102.942 199.447 100.152C197.637 95.8025 205.147 93.1725 208.047 92.4425C208.777 92.2525 209.507 92.0725 210.237 91.8825C209.767 91.9025 209.287 91.9025 208.817 91.9325C206.607 92.0625 204.377 92.1725 202.157 92.1025C200.227 92.0425 198.197 91.9625 196.397 91.2325C194.947 90.6425 193.507 89.5225 193.497 87.8025C193.487 85.9025 195.837 85.3025 197.407 84.5325C201.257 82.6325 205.397 82.3025 209.607 81.9325C211.547 81.7525 212.927 80.9325 214.857 80.7225C213.487 80.5325 212.117 80.4225 210.697 80.4025C206.837 80.3425 202.207 80.0125 198.847 77.7625C197.537 76.8825 195.927 75.8125 196.827 74.3425C197.507 73.2325 199.707 72.7725 200.907 72.5425C204.137 71.9225 207.527 72.0525 210.797 71.8425C214.007 71.6325 217.227 71.4025 220.447 71.3325C219.227 70.7325 218.007 70.1425 216.797 69.5225C215.607 68.9025 214.447 68.2225 213.227 67.6625C212.247 67.2025 211.167 66.9425 210.227 66.4125C208.477 65.4325 205.637 64.1725 207.237 62.3925C208.727 60.7325 213.627 59.9425 215.627 59.8625Z" fill="#D6D1CD"/>
</svg>`;

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
        targetId: 'pencilBtn',
        title: 'draw something',
        instruction: 'raise your index finger and draw anything',
        hintText: 'keep your palm facing the camera with your index finger extended.',
        hintHtml: `<img src="/gestures/draw.svg" class="tut-hint-img">`,
        checkSuccess: (pose) => (pose === 'POINT' && undoStack.length > initialUndoCount)
    },
    {
        id: 2,
        targetId: 'pencilBtn',
        title: 'lift the pen',
        instruction: 'flash a peace sign to lift the pen',
        hintText: 'extend both your index and middle fingers.',
        hintHtml: SVG_HAND_TWO,
        checkSuccess: (pose) => pose === 'TWO_FINGERS'
    },
    {
        id: 3,
        targetId: 'swatch-point',
        title: 'pick a color',
        instruction: 'pinch and move sideways to browse colors, then release',
        hintText: 'pinch your thumb and index together, move, then let go.',
        hintHtml: `<img src="/gestures/pinch.svg" class="tut-hint-img">`,
        checkSuccess: () => appState.currentColor !== initialColor
    },
    {
        id: 4,
        targetId: 'undoBtn',
        title: 'undo and redo',
        instruction: 'thumbs down to undo · thumbs up to redo',
        hintText: 'try a quick thumbs down gesture.',
        hintHtml: `
            <div style="display:flex; gap:12px;">
                <img src="/gestures/undo.svg" class="tut-hint-img small">
                <img src="/gestures/redo.svg" class="tut-hint-img small">
            </div>
        `,
        checkSuccess: (pose) => {
            if (pose === 'THUMBS_UP') thumbUpSeen = true;
            if (pose === 'THUMBS_DOWN') thumbDownSeen = true;
            return thumbUpSeen && thumbDownSeen;
        }
    },
    {
        id: 5,
        targetId: 'eraserBtn',
        title: 'erase',
        instruction: 'open your palm to switch to eraser mode',
        hintText: 'show all five fingers spread wide.',
        hintHtml: `<img src="/gestures/hand.svg" class="tut-hint-img">`,
        checkSuccess: (pose) => (pose === 'OPEN_PALM' && appState.currentMode === 'ERASE')
    },
    {
        id: 6,
        targetId: '',
        title: "you're ready!",
        instruction: "now go doodle.",
        hintText: "",
        hintHtml: SVG_DONE,
        checkSuccess: () => false
    }
];

export function showTutorialIfNeeded() {
    try { if (localStorage.getItem(STORAGE_KEY)) return; } catch { }
    startTutorial();
}

export function startTutorial() {
    if (tutorialActive) return;
    tutorialActive = true;
    currentStepIdx = 0;
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
            position: fixed; inset: 0; z-index: 11000;
            background: rgba(247, 246, 242, 0.4);
            backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
            opacity: 0; transition: opacity 0.4s ease, mask-image 0.4s ease;
            pointer-events: none;
            /* Spotlight Mask Setup */
            --hx: 0px; --hy: 0px; --hw: 0px; --hh: 0px; --hr: 8px;
            mask-image: linear-gradient(#000, #000), 
                        linear-gradient(#000, #000);
            mask-size: 100% 100%, 
                       var(--hw) var(--hh);
            mask-position: 0 0, 
                           var(--hx) var(--hy);
            mask-repeat: no-repeat;
            mask-composite: exclude;
            -webkit-mask-composite: destination-out;
        }
        .tut-overlay.visible { opacity: 1; pointer-events: auto; }
        .tut-panel {
            background: #F7F6F2; border: 1px solid #D6D1CD;
            border-radius: 12px; box-shadow: 0 12px 48px rgba(0,0,0,0.08);
            width: 320px; position: absolute;
            display: flex; flex-direction: column; text-align: center;
            text-transform: lowercase;
            transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), left 0.4s ease, top 0.4s ease;
            font-family: 'Instrument Sans', sans-serif;
        }
        .tut-arrow {
            position: absolute; left: -8px; top: 50%; transform: translateY(-50%);
            width: 0; height: 0; border-top: 8px solid transparent; border-bottom: 8px solid transparent;
            border-right: 8px solid #D6D1CD;
        }
        .tut-arrow::after {
            content: ''; position: absolute; left: 1px; top: -8px;
            width: 0; height: 0; border-top: 8px solid transparent; border-bottom: 8px solid transparent;
            border-right: 8px solid #F7F6F2;
        }
        .tut-header { padding: 10px; border-bottom: 1px solid #D6D1CD; background: rgba(0,0,0,0.02); border-radius: 12px 12px 0 0; }
        .tut-step-id { font-size: 13px; font-weight: 500; color: #645F5B; }
        .tut-body { padding: 24px; display: flex; flex-direction: column; gap: 12px; align-items: center; }
        #tutContent { transition: opacity 0.3s ease, transform 0.35s cubic-bezier(0.2, 0, 0, 1); width: 100%; display: flex; flex-direction: column; align-items: center; }
        .tut-title { font-size: 24px; font-weight: 600; color: #000; margin: 0 0 4px 0; }
        .tut-instruction { font-size: 14px; color: #645F5B; line-height: 1.5; }
        .tut-hint-container { display: flex; flex-direction: column; align-items: center; gap: 12px; opacity: 0; transition: opacity 0.5s ease; margin-bottom: 12px; }
        .tut-hint-container.visible { opacity: 1; }
        .tut-hint-img, .tut-hint-svg { max-height: 70px; width: auto; color: #43403D; }
        .tut-hint-text { font-size: 13px; color: #928C86; font-style: italic; }
        .tut-footer { padding: 0 16px 16px 16px; display: flex; justify-content: center; }
        .tut-skip-btn { background: none; border: none; color: #43403D; font-size: 14px; font-weight: 500; cursor: pointer; padding: 4px 8px; position: absolute; bottom: 12px; right: 12px; }
        .tut-done-btn { background: #43403D; color: white; border: none; border-radius: 6px; padding: 8px 16px; font-size: 14px; font-weight: 600; cursor: pointer; }
    `;
    document.head.appendChild(style);
}

function createOverlay() {
    overlayEl = document.createElement('div');
    overlayEl.className = 'tut-overlay';
    overlayEl.innerHTML = `
        <div class="tut-panel" id="tutPanel">
            <div class="tut-arrow" id="tutArrow"></div>
            <div class="tut-header"><span class="tut-step-id" id="tutStepLabel"></span></div>
            <div class="tut-body">
                <div id="tutContent">
                    <div class="tut-hint-container" id="tutHintContainer">
                        <div class="tut-hint-svg" id="tutHintSvg"></div>
                        <p class="tut-hint-text" id="tutHintText"></p>
                    </div>
                    <h2 class="tut-title" id="tutTitle"></h2>
                    <p class="tut-instruction" id="tutInstruction"></p>
                </div>
            </div>
            <div class="tut-footer">
                <button class="tut-skip-btn" id="tutSkip">skip</button>
                <button class="tut-done-btn" id="tutDoneBtn" style="display:none;">start drawing</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlayEl);
    document.getElementById('tutSkip')!.addEventListener('click', () => goToStep(STEPS.length - 1));
    document.getElementById('tutDoneBtn')!.addEventListener('click', finishTutorial);
    requestAnimationFrame(() => overlayEl?.classList.add('visible'));
}

function goToStep(idx: number) {
    if (idx < 0 || idx >= STEPS.length) return;
    currentStepIdx = idx;
    const step = STEPS[idx];
    initialUndoCount = undoStack.length;
    initialColor = appState.currentColor;
    if (idx !== 3) { thumbUpSeen = false; thumbDownSeen = false; }
    if (hintTimer) clearTimeout(hintTimer);
    if (step.id === 4 && undoStack.length === 0) {
        undoStack.push({ type: 'stroke', mode: 'DRAW', color: appState.currentColor, width: 3, segments: [], dot: { x: 0, y: 0 } });
        initialUndoCount = undoStack.length;
    }
    const titleEl = document.getElementById('tutTitle')!;
    const instructionEl = document.getElementById('tutInstruction')!;
    const labelEl = document.getElementById('tutStepLabel')!;
    titleEl.textContent = step.title;
    instructionEl.textContent = step.instruction;
    labelEl.textContent = idx === STEPS.length - 1 ? '' : `step ${idx + 1}/5`;
    repositionPanel(step.targetId);
    const hintContainer = document.getElementById('tutHintContainer')!;
    hintContainer.classList.remove('visible');
    const doneBtn = document.getElementById('tutDoneBtn')!;
    const skipBtn = document.getElementById('tutSkip')!;
    const isLast = idx === STEPS.length - 1;
    doneBtn.style.display = isLast ? 'inline-block' : 'none';
    skipBtn.style.display = isLast ? 'none' : 'inline-block';
    if (isLast) {
        document.getElementById('tutHintText')!.textContent = step.hintText;
        document.getElementById('tutHintSvg')!.innerHTML = step.hintHtml || '';
        hintContainer.classList.add('visible');
    } else {
        hintTimer = setTimeout(() => {
            document.getElementById('tutHintText')!.textContent = step.hintText;
            document.getElementById('tutHintSvg')!.innerHTML = step.hintHtml || '';
            hintContainer.classList.add('visible');
        }, 5000);
    }
}

function repositionPanel(targetId?: string) {
    const panel = document.getElementById('tutPanel');
    const arrow = document.getElementById('tutArrow');
    if (!panel || !arrow || !overlayEl) return;

    if (!targetId) {
        panel.style.left = '50%'; panel.style.top = '50%';
        panel.style.transform = 'translate(-50%, -50%)';
        arrow.style.display = 'none';
        overlayEl.style.setProperty('--hw', '0px');
        overlayEl.style.setProperty('--hh', '0px');
        return;
    }

    let target = document.getElementById(targetId);
    if (targetId === 'swatch-point') target = document.querySelector('.swatch-group');

    if (target) {
        const rect = target.getBoundingClientRect();
        panel.style.left = `${rect.right + 20}px`;
        panel.style.top = `${rect.top + rect.height / 2}px`;
        panel.style.transform = 'translateY(-50%)';
        arrow.style.display = 'block';

        // Update spotlight hole
        overlayEl.style.setProperty('--hx', (rect.left - 4) + 'px');
        overlayEl.style.setProperty('--hy', (rect.top - 4) + 'px');
        overlayEl.style.setProperty('--hw', (rect.width + 8) + 'px');
        overlayEl.style.setProperty('--hh', (rect.height + 8) + 'px');
    } else {
        panel.style.left = '50%'; panel.style.top = '50%';
        panel.style.transform = 'translate(-50%, -50%)';
        arrow.style.display = 'none';
        overlayEl.style.setProperty('--hw', '0px');
        overlayEl.style.setProperty('--hh', '0px');
    }
}

export function handleGestureUpdate(pose: string, landmarks: Point2D[]) {
    if (!tutorialActive || currentStepIdx >= STEPS.length - 1) return;
    if (STEPS[currentStepIdx].checkSuccess(pose, landmarks)) onStepSuccess();
}

function onStepSuccess() {
    if (successAdvanceTimer) return;
    successAdvanceTimer = true;
    const content = document.getElementById('tutContent')!;
    content.style.opacity = '0';
    content.style.transform = 'translateY(10px)';
    setTimeout(() => {
        goToStep(currentStepIdx + 1);
        content.style.transition = 'none';
        content.style.transform = 'translateY(-10px)';
        void content.offsetWidth;
        content.style.transition = 'opacity 0.4s ease, transform 0.4s cubic-bezier(0.2, 0, 0, 1)';
        content.style.opacity = '1';
        content.style.transform = 'translateY(0)';
        successAdvanceTimer = null;
    }, 300);
}

function finishTutorial() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { }
    tutorialActive = false;
    overlayEl?.classList.remove('visible');
    setTimeout(() => { overlayEl?.remove(); overlayEl = null; clearCanvas(); }, 400);
}

export function isTutorialActive() { return tutorialActive; }
