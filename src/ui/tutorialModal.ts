// ══════════════════════════════════════════════════════
// Tutorial Onboarding Modal
// Compact floating card, shows once on first visit
// ══════════════════════════════════════════════════════

const STORAGE_KEY = 'doodle_tutorial_seen';

interface Slide {
    emoji: string;
    title: string;
    desc: string;
}

const SLIDES: Slide[] = [
    { emoji: '✋', title: 'Welcome to Doodle', desc: 'Draw in the air with just your hand. Let\'s take a quick tour!' },
    { emoji: '☝️', title: 'Point to Draw', desc: 'Raise your index finger to start drawing on the canvas.' },
    { emoji: '✌️', title: 'Peace to Pause', desc: 'Flash a peace sign to lift the pen instantly.' },
    { emoji: '🖐️', title: 'Palm to Erase', desc: 'Show your palm to switch to eraser. Give a thumbs down to undo, or a thumbs up to redo.' },
    { emoji: '🤌', title: 'Pinch for Colors', desc: 'Pinch and move to browse colors. Release to pick one.' },
    { emoji: '✊', title: 'Fist to Clear', desc: 'Hold a fist for 1 second to clear the whole canvas.' },
];

let currentSlide = 0;
let cardEl: HTMLElement | null = null;
let backdropEl: HTMLElement | null = null;

export function showTutorialIfNeeded() {
    if (localStorage.getItem(STORAGE_KEY)) return;
    injectStyles();
    createModal();
}

function injectStyles() {
    if (document.getElementById('tut-styles')) return;
    const style = document.createElement('style');
    style.id = 'tut-styles';
    style.textContent = `
        /* Soft backdrop */
        .tut-backdrop {
            position: fixed;
            inset: 0;
            z-index: 11000;
            background: rgba(243, 241, 237, 0.5);
            backdrop-filter: blur(2px);
            -webkit-backdrop-filter: blur(2px);
            display: flex;
            align-items: flex-end;
            justify-content: center;
            padding-bottom: 48px;
            opacity: 0;
            transition: opacity 0.3s ease;
            pointer-events: none;
        }
        .tut-backdrop.visible {
            opacity: 1;
            pointer-events: auto;
        }

        /* Compact floating card */
        .tut-card {
            background: var(--bg-surface, #F7F6F2);
            border: 1px solid var(--border-panel, #D6D1CD);
            border-radius: var(--radius-panel, 12px);
            box-shadow: 0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04);
            width: 380px;
            max-width: 90vw;
            overflow: hidden;
            transform: translateY(20px) scale(0.96);
            transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .tut-backdrop.visible .tut-card {
            transform: translateY(0) scale(1);
        }

        /* Title bar */
        .tut-titlebar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 14px;
            border-bottom: 1px solid var(--border-panel, #D6D1CD);
            background: var(--bg-surface, #F7F6F2);
        }
        .tut-step-label {
            font-family: system-ui, -apple-system, 'SF Pro Display', 'Inter', sans-serif;
            font-size: 11px;
            font-weight: 500;
            color: #928C86;
            text-transform: uppercase;
            letter-spacing: 0.06em;
        }
        .tut-close-btn {
            width: 18px;
            height: 18px;
            border-radius: 50%;
            border: none;
            background: #D6D1CD;
            color: #928C86;
            font-size: 11px;
            line-height: 18px;
            text-align: center;
            cursor: pointer;
            padding: 0;
            transition: background 0.15s ease;
        }
        .tut-close-btn:hover {
            background: #C4BEB8;
            color: #43403D;
        }

        /* Body content */
        .tut-body {
            padding: 28px 24px 20px;
            text-align: center;
            min-height: 140px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }
        .tut-emoji {
            font-size: 40px;
            line-height: 1;
            margin-bottom: 14px;
            transition: opacity 0.2s ease, transform 0.2s ease;
        }
        .tut-title {
            font-family: system-ui, -apple-system, 'SF Pro Display', 'Inter', sans-serif;
            font-size: 17px;
            font-weight: 600;
            color: #43403D;
            letter-spacing: -0.01em;
            margin-bottom: 6px;
            transition: opacity 0.2s ease, transform 0.2s ease;
        }
        .tut-desc {
            font-family: system-ui, -apple-system, 'SF Pro Display', 'Inter', sans-serif;
            font-size: 13px;
            font-weight: 400;
            color: #928C86;
            line-height: 1.5;
            max-width: 300px;
            transition: opacity 0.2s ease, transform 0.2s ease;
        }

        /* Footer */
        .tut-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 14px;
            border-top: 1px solid var(--border-panel, #D6D1CD);
        }

        /* Dot indicators - pill style */
        .tut-dots {
            display: flex;
            gap: 4px;
            align-items: center;
        }
        .tut-dot {
            height: 6px;
            width: 6px;
            border-radius: 3px;
            background: #D6D1CD;
            transition: width 0.25s ease, background 0.25s ease;
        }
        .tut-dot.active {
            width: 18px;
            background: #43403D;
        }

        /* Nav buttons */
        .tut-nav {
            display: flex;
            gap: 8px;
            align-items: center;
        }
        .tut-skip {
            font-family: system-ui, -apple-system, 'SF Pro Display', 'Inter', sans-serif;
            font-size: 12px;
            font-weight: 400;
            color: #928C86;
            background: none;
            border: none;
            cursor: pointer;
            padding: 4px 8px;
            transition: color 0.15s ease;
        }
        .tut-skip:hover { color: #43403D; }

        .tut-next-btn {
            font-family: system-ui, -apple-system, 'SF Pro Display', 'Inter', sans-serif;
            font-size: 13px;
            font-weight: 600;
            color: var(--icon-active-fg, #F7F6F2);
            background: var(--icon-active-bg, #43403D);
            border: none;
            border-radius: 8px;
            padding: 7px 18px;
            cursor: pointer;
            transition: background 0.15s ease, transform 0.15s ease;
        }
        .tut-next-btn:hover { background: #2C2A27; }
        .tut-next-btn:active { transform: scale(0.96); }

        /* Fade transition */
        .tut-fading .tut-emoji,
        .tut-fading .tut-title,
        .tut-fading .tut-desc {
            opacity: 0;
            transform: translateY(-4px);
        }
    `;
    document.head.appendChild(style);
}

function createModal() {
    currentSlide = 0;

    // Backdrop
    backdropEl = document.createElement('div');
    backdropEl.className = 'tut-backdrop';

    // Card
    cardEl = document.createElement('div');
    cardEl.className = 'tut-card';

    // Title bar
    const titlebar = document.createElement('div');
    titlebar.className = 'tut-titlebar';

    const stepLabel = document.createElement('span');
    stepLabel.className = 'tut-step-label';
    stepLabel.id = 'tutStepLabel';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tut-close-btn';
    closeBtn.textContent = '\u00D7'; // multiplication sign as X
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', closeTutorial);

    titlebar.appendChild(stepLabel);
    titlebar.appendChild(closeBtn);

    // Body
    const body = document.createElement('div');
    body.className = 'tut-body';
    body.id = 'tutBody';

    const emoji = document.createElement('div');
    emoji.className = 'tut-emoji';
    emoji.id = 'tutEmoji';

    const title = document.createElement('div');
    title.className = 'tut-title';
    title.id = 'tutTitle';

    const desc = document.createElement('div');
    desc.className = 'tut-desc';
    desc.id = 'tutDesc';

    body.appendChild(emoji);
    body.appendChild(title);
    body.appendChild(desc);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'tut-footer';

    const dots = document.createElement('div');
    dots.className = 'tut-dots';
    dots.id = 'tutDots';
    SLIDES.forEach((_, i) => {
        const dot = document.createElement('span');
        dot.className = 'tut-dot' + (i === 0 ? ' active' : '');
        dots.appendChild(dot);
    });

    const nav = document.createElement('div');
    nav.className = 'tut-nav';

    const skip = document.createElement('button');
    skip.className = 'tut-skip';
    skip.id = 'tutSkip';
    skip.textContent = 'skip tour';
    skip.addEventListener('click', closeTutorial);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'tut-next-btn';
    nextBtn.id = 'tutNext';
    nextBtn.textContent = 'Next';
    nextBtn.addEventListener('click', () => {
        if (currentSlide === SLIDES.length - 1) {
            closeTutorial();
        } else {
            goToSlide(currentSlide + 1);
        }
    });

    nav.appendChild(skip);
    nav.appendChild(nextBtn);

    footer.appendChild(dots);
    footer.appendChild(nav);

    // Assemble
    cardEl.appendChild(titlebar);
    cardEl.appendChild(body);
    cardEl.appendChild(footer);
    backdropEl.appendChild(cardEl);
    document.body.appendChild(backdropEl);

    // Render first slide
    renderSlide();

    // Animate in
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            backdropEl!.classList.add('visible');
        });
    });
}

function renderSlide() {
    const slide = SLIDES[currentSlide];
    document.getElementById('tutEmoji')!.textContent = slide.emoji;
    document.getElementById('tutTitle')!.textContent = slide.title;
    document.getElementById('tutDesc')!.textContent = slide.desc;
    document.getElementById('tutStepLabel')!.textContent = `tour ${currentSlide + 1}/${SLIDES.length}`;

    const nextBtn = document.getElementById('tutNext')!;
    nextBtn.textContent = currentSlide === SLIDES.length - 1 ? "Let's go!" : 'Next';

    // Update dots
    const dots = document.getElementById('tutDots')!;
    Array.from(dots.children).forEach((dot, i) => {
        dot.classList.toggle('active', i === currentSlide);
    });
}

function goToSlide(index: number) {
    if (index < 0 || index >= SLIDES.length) return;

    const body = document.getElementById('tutBody')!;
    body.classList.add('tut-fading');

    setTimeout(() => {
        currentSlide = index;
        renderSlide();
        body.classList.remove('tut-fading');
    }, 180);
}

function closeTutorial() {
    localStorage.setItem(STORAGE_KEY, '1');
    if (backdropEl) {
        backdropEl.classList.remove('visible');
        setTimeout(() => {
            backdropEl?.remove();
            backdropEl = null;
            cardEl = null;
        }, 350);
    }
}
