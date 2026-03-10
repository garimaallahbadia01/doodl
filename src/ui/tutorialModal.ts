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
const SVG_DONE = `<svg width="120" height="120" viewBox="0 0 279 270" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M118.5 211V260.5L129 268.5L170 238L182 211L133.5 187L118.5 211Z" fill="#E6DEBE"/>
<path d="M257.152 68.7423L206.774 42.5082C205.794 41.998 205.414 40.7903 205.924 39.8106L210.311 31.3846L214.699 22.9586C215.209 21.9789 216.417 21.5982 217.397 22.1084L267.775 48.3425C268.755 48.8526 269.136 50.0604 268.625 51.0401L259.85 67.8921C259.34 68.8718 258.132 69.2524 257.152 68.7423Z" fill="#E6DEBE"/>
<path d="M258.768 69.166L234.5 113.166L179.5 219.666L126.5 194.455L205 40.8L258.768 69.166Z" fill="#D6D1CD"/>
<path d="M119 246.808L119.13 260.618L129.137 268.684L148.036 254.774L119 246.808Z" fill="#43403D"/>
<path d="M215.627 59.8625C223.187 59.5625 230.767 59.3025 238.327 58.8125L205.147 41.7025L152.547 143.692C156.397 151.272 152.157 161.762 152.157 161.762C159.477 164.822 163.267 169.362 163.267 169.362C165.897 172.552 161.007 174.952 161.007 174.952C161.007 174.952 162.517 177.782 160.387 180.072C158.357 182.252 156.627 181.582 156.457 181.512C156.597 181.702 158.347 184.242 155.997 186.642C154.777 187.892 152.257 188.072 152.257 188.072C152.257 188.072 153.617 192.152 148.237 192.222C144.477 192.282 136.507 186.872 132.037 183.602C131.357 184.902 130.947 185.662 130.917 185.662L130.557 186.362C133.797 190.552 136.477 195.512 133.317 196.412C131.437 196.952 129.027 196.042 126.587 194.052L117.857 210.992C118.277 210.372 126.107 199.142 132.367 202.372C138.807 205.692 136.887 214.982 136.887 214.982C136.887 214.982 142.187 205.212 151.407 209.972C160.647 214.742 155.747 224.702 155.747 224.702C155.747 224.702 162.217 217.762 168.657 221.092C174.707 224.202 170.637 236.282 170.107 237.792L234.317 113.292C233.347 113.512 232.337 113.462 231.437 112.942C229.717 111.952 229.377 109.772 230.017 108.022C230.627 106.362 231.737 104.992 232.917 103.682C234.087 102.372 236.817 101.682 238.217 100.602C238.557 100.342 239.477 99.4025 239.847 99.1525C235.657 99.3425 229.477 99.7125 225.317 100.352C219.367 101.262 215.697 101.822 209.667 102.002C207.147 102.072 200.617 102.942 199.447 100.152C197.637 95.8025 205.147 93.1725 208.047 92.4425C208.777 92.2525 209.507 92.0725 210.237 91.8825C209.767 91.9025 209.287 91.9025 208.817 91.9325C206.607 92.0625 204.377 92.1725 202.157 92.1025C200.227 92.0425 198.197 91.9625 196.397 91.2325C194.947 90.6425 193.507 89.5225 193.497 87.8025C193.487 85.9025 195.837 85.3025 197.407 84.5325C201.257 82.6325 205.397 82.3025 209.607 81.9325C211.547 81.7525 212.927 80.9325 214.857 80.7225C213.487 80.5325 212.117 80.4225 210.697 80.4025C206.837 80.3425 202.207 80.0125 198.847 77.7625C197.537 76.8825 195.927 75.8125 196.827 74.3425C197.507 73.2325 199.707 72.7725 200.907 72.5425C204.137 71.9225 207.527 72.0525 210.797 71.8425C214.007 71.6325 217.227 71.4025 220.447 71.3325C219.227 70.7325 218.007 70.1425 216.797 69.5225C215.607 68.9025 214.447 68.2225 213.227 67.6625C212.247 67.2025 211.167 66.9425 210.227 66.4125C208.477 65.4325 205.637 64.1725 207.237 62.3925C208.727 60.7325 213.627 59.9425 215.627 59.8625Z" fill="#D6D1CD"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M137.109 212.211L138.31 209.862C138.353 210.247 138.381 210.623 138.398 210.986C139.155 210.246 140.03 209.547 141.012 208.968L138.891 213.121L137.109 212.211ZM154.534 224.452C154.501 224.632 154.508 224.815 154.553 224.989C154.52 224.859 154.507 224.725 154.517 224.59C154.52 224.544 154.525 224.498 154.534 224.452Z" fill="#43403D"/>
<path d="M31.5501 157.031C31.4751 157.031 31.4001 157.038 31.3241 157.051C19.3511 159.238 9.78807 164.883 4.39707 172.948C-1.28393 181.444 -2.20193 195.077 6.09307 203.184C10.9071 207.89 18.4241 210.003 25.5101 208.706C25.3711 211.492 25.7161 214.197 26.5711 216.734C29.0441 224.08 35.8151 229.768 43.8211 231.227C49.7871 232.32 56.1741 231.065 61.6391 227.855C61.8411 228.96 62.0971 230.054 62.4071 231.132C65.3921 241.499 73.4591 250.453 83.4601 254.499C93.4601 258.545 105.483 257.721 114.838 252.349C115.437 252.005 115.643 251.241 115.299 250.642C114.955 250.042 114.192 249.838 113.592 250.181C104.888 255.181 93.7011 255.947 84.3961 252.182C75.0911 248.417 67.5861 240.086 64.8081 230.441C64.4231 229.103 64.1281 227.739 63.9221 226.359C64.4981 225.94 65.0601 225.498 65.6061 225.032C71.3111 220.174 75.1611 213.089 76.4461 205.083C76.6861 203.59 76.8331 201.995 76.2931 200.451C75.6181 198.521 73.9061 197.254 72.0971 197.258C70.0791 197.316 68.6811 198.935 67.8041 200.148C62.6751 207.251 60.3471 216.415 61.2521 225.159C56.1121 228.469 49.9721 229.808 44.2671 228.769C37.2521 227.49 31.0921 222.333 28.9381 215.938C28.1101 213.477 27.8241 210.829 28.0511 208.091C34.2221 206.235 39.8771 201.886 43.7401 195.977C44.6631 194.565 45.7381 192.669 45.8631 190.536C46.0061 188.086 44.7211 185.8 42.7381 184.977C40.2931 183.964 37.4421 185.122 34.7101 188.239C29.7541 193.893 26.6981 200.121 25.7751 206.103C19.2661 207.541 12.2471 205.705 7.83807 201.397C0.472073 194.198 1.35907 181.985 6.47307 174.337C13.2351 164.223 25.2251 160.706 31.7711 159.511C32.4501 159.387 32.9001 158.736 32.7761 158.057C32.6691 157.453 32.1431 157.031 31.5501 157.031ZM28.4501 205.33C29.4981 200.17 32.2731 194.815 36.5931 189.888C37.5111 188.839 39.8541 186.49 41.7831 187.286C42.9171 187.757 43.4401 189.204 43.3701 190.39C43.2801 191.926 42.4501 193.386 41.6501 194.611C38.3431 199.669 33.6271 203.473 28.4501 205.33ZM63.6201 223.437C63.1611 215.746 65.3441 207.83 69.8341 201.612C70.7341 200.367 71.4771 199.778 72.1711 199.758C72.9691 199.764 73.6731 200.525 73.9361 201.276C74.2931 202.297 74.1681 203.518 73.9801 204.687C72.8061 211.999 69.1641 218.721 63.9801 223.13C63.8651 223.234 63.7431 223.336 63.6201 223.437Z" fill="#43403D"/>
<path d="M225.147 5.94601L217 21.745L269.207 48.666L277.354 32.867C280.532 26.704 276.569 18.324 268.512 14.169L245.486 2.29602C237.43 -1.85898 228.325 -0.216986 225.147 5.94601Z" fill="#0157CA"/>
<path d="M225.147 5.94601L217 21.745L269.207 48.666L277.354 32.867C280.532 26.704 276.569 18.324 268.512 14.169L245.486 2.29602C237.43 -1.85898 228.325 -0.216986 225.147 5.94601Z" fill="white" fill-opacity="0.2"/>
<path d="M266.371 21.2502C266.123 21.2502 265.875 21.3422 265.682 21.5252C265.282 21.9062 265.266 22.5402 265.647 22.9392C269.501 26.9862 270.141 32.6552 267.104 35.8462C266.723 36.2462 266.739 36.8792 267.139 37.2602C267.537 37.6392 268.172 37.6252 268.553 37.2252C272.325 33.2602 271.686 26.3792 267.096 21.5602C266.899 21.3542 266.635 21.2502 266.371 21.2502Z" fill="#F3F1ED"/>
<path d="M264.231 57.5657L212.212 30.4773L216.103 23.005C216.339 22.5518 216.897 22.3759 217.351 22.6118L267.729 48.8459C268.182 49.0819 268.358 49.6402 268.122 50.0933L264.231 57.5657ZM259.347 66.9453C259.111 67.3984 258.552 67.5744 258.099 67.3385L207.721 41.1044C207.268 40.8684 207.092 40.3101 207.328 39.857L211.219 32.3846L263.238 59.473L259.347 66.9453ZM270.029 51.0865C270.814 49.5803 270.228 47.723 268.722 46.9386L218.344 20.7046C216.837 19.9202 214.98 20.5055 214.196 22.0118L205.42 38.8638C204.636 40.3701 205.221 42.2273 206.728 43.0116L257.106 69.2457C258.612 70.0301 260.47 69.4448 261.254 67.9385L270.029 51.0865Z" fill="#43403D"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M220.109 49.7109L221.891 50.6211L141.012 208.968L138.891 213.121L137.109 212.211L138.31 209.862L220.109 49.7109Z" fill="#43403D"/>
<path d="M240.11 59.7099L241.89 60.6221L160.224 220.043C162.791 218.879 165.987 218.312 169.228 219.979C176.581 223.756 171.434 237.778 171.21 238.374C171.168 238.485 171.111 238.589 171.041 238.684C170.968 238.781 170.88 238.869 170.78 238.942L147.923 255.781L129.024 269.691C128.567 270.027 127.941 270.013 127.499 269.657L117.491 261.591C117.2 261.356 117.029 261.003 117.026 260.629L116.582 211.03C116.579 210.777 116.654 210.529 116.796 210.319C117.106 209.863 123.494 200.535 129.979 200.535C130.233 200.535 130.486 200.549 130.739 200.579C130.985 200.608 131.232 200.651 131.478 200.71C131.97 200.829 132.46 201.009 132.945 201.258C136.694 203.196 137.965 206.798 138.31 209.862L137.109 212.211L138.891 213.121L141.012 208.968C143.864 207.286 147.614 206.616 151.983 208.866C157.025 211.465 158.422 215.666 158.28 219.451L240.11 59.7099ZM131.798 203.48C127.476 201.25 121.364 208.167 119.085 211.404L119.52 260.016L128.316 267.107L168.992 237.154C170.309 233.433 172.413 224.428 168.082 222.204C162.976 219.574 157.67 224.532 156.65 225.56C156.222 225.988 155.548 226.052 155.049 225.705C154.795 225.528 154.625 225.271 154.553 224.989C154.483 224.718 154.504 224.423 154.629 224.153C155.055 223.235 158.564 215.069 150.836 211.089C142.831 206.961 138.188 215.226 137.995 215.578C137.7 216.122 137.054 216.367 136.47 216.156C135.889 215.945 135.549 215.339 135.672 214.732C135.69 214.649 137.301 206.324 131.798 203.48Z" fill="#43403D"/>
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
        title: 'draw something',
        instruction: 'raise your index finger and draw anything',
        hintText: 'keep your palm facing the camera with your index finger extended.',
        hintSvg: SVG_HAND_POINT,
        checkSuccess: (pose) => {
            return pose === 'POINT' && undoStack.length > initialUndoCount;
        }
    },
    {
        id: 2,
        title: 'lift the pen',
        instruction: 'flash a peace sign to lift the pen',
        hintText: 'extend both your index and middle fingers.',
        hintSvg: SVG_HAND_TWO,
        checkSuccess: (pose) => {
            return pose === 'TWO_FINGERS';
        }
    },
    {
        id: 3,
        title: 'pick a color',
        instruction: 'pinch and move your hand to browse colors, then release to pick one',
        hintText: 'pinch your thumb and index together, move sideways, then let go.',
        hintSvg: SVG_PINCH_ANIM,
        checkSuccess: () => {
            return appState.currentColor !== initialColor;
        }
    },
    {
        id: 4,
        title: 'undo and redo',
        instruction: 'thumbs down to undo · thumbs up to redo',
        hintText: 'make a mark first, then try thumbs down.',
        checkSuccess: (pose) => {
            if (pose === 'THUMBS_UP') thumbUpSeen = true;
            if (pose === 'THUMBS_DOWN') thumbDownSeen = true;
            return thumbUpSeen && thumbDownSeen;
        }
    },
    {
        id: 5,
        title: 'erase',
        instruction: 'open your palm to switch to eraser mode',
        hintText: 'show all five fingers spread wide.',
        hintSvg: SVG_HAND_PALM,
        checkSuccess: (pose) => {
            return pose === 'OPEN_PALM' && appState.currentMode === 'ERASE';
        }
    },
    {
        id: 6,
        title: "you're ready!",
        instruction: "now go doodle.",
        hintText: "",
        hintSvg: SVG_DONE,
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
            font-family: 'Instrument Sans', sans-serif;
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

        .tut-done-btn:active { transform: translateY(0); }
    `;
    document.head.appendChild(style);
}

function createOverlay() {
    overlayEl = document.createElement('div');
    overlayEl.className = 'tut-overlay';

    const panel = document.createElement('div');
    panel.className = 'tut-panel';
    panel.innerHTML = `
        <button class="tut-skip-btn" id="tutSkip">skip tutorial</button>
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
                <button class="tut-done-btn" id="tutDoneBtn">start drawing</button>
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
    document.getElementById('tutStepLabel')!.textContent = idx === STEPS.length - 1 ? '' : `step ${idx + 1} of 5`;

    const hintContainer = document.getElementById('tutHintContainer')!;
    hintContainer.classList.remove('visible');

    const footer = document.getElementById('tutFooter')!;
    footer.style.display = idx === STEPS.length - 1 ? 'block' : 'none';

    // Step 6 has a subline
    if (idx === STEPS.length - 1) {
        document.getElementById('tutHintText')!.textContent = step.hintText;
        document.getElementById('tutHintSvg')!.innerHTML = step.hintSvg || '';
        hintContainer.classList.add('visible');
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
    }, 400);
}


export function isTutorialActive() {
    return tutorialActive;
}
