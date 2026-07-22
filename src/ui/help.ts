import { popEscapeHandler, popFocusTrap, pushEscapeHandler, pushFocusTrap } from './keyboard-nav.ts';
import { t } from '../i18n/index.ts';

const TUTORIAL_SEEN_KEY = 'hs_tutorial_seen';
const TUTORIAL_STEPS = [
  { key: 'settings', icon: 'tune' },
  { key: 'maps', icon: 'library_music' },
  { key: 'calibration', icon: 'center_focus_strong' },
  { key: 'movement', icon: 'swipe' },
  { key: 'hit', icon: 'ads_click' },
  { key: 'tracking', icon: 'visibility' },
] as const;

export function initHelpOverlay(): void {
  const overlay = document.getElementById('helpOverlay');
  const panel = overlay?.querySelector<HTMLElement>('.help-panel');
  const openButton = document.getElementById('mainHelp');
  const closeButton = document.getElementById('helpClose');
  const guide = document.getElementById('helpGuide');
  const tutorialView = document.getElementById('tutorialView');
  const startTutorialButton = document.getElementById('helpStartTutorial');
  const tutorialProgress = document.getElementById('tutorialProgress');
  const tutorialIcon = document.getElementById('tutorialIcon');
  const tutorialStepLabel = document.getElementById('tutorialStepLabel');
  const tutorialStepTitle = document.getElementById('tutorialStepTitle');
  const tutorialStepBody = document.getElementById('tutorialStepBody');
  const tutorialSkip = document.getElementById('tutorialSkip');
  const tutorialBack = document.getElementById('tutorialBack');
  const tutorialNext = document.getElementById('tutorialNext');
  if (
    !overlay || !panel || !openButton || !closeButton || !guide || !tutorialView ||
    !startTutorialButton || !tutorialProgress || !tutorialIcon || !tutorialStepLabel ||
    !tutorialStepTitle || !tutorialStepBody || !tutorialSkip || !tutorialBack || !tutorialNext
  ) return;

  let closeTimer: number | null = null;
  let tutorialActive = false;
  let tutorialStep = 0;

  const markTutorialSeen = () => {
    try { localStorage.setItem(TUTORIAL_SEEN_KEY, '1'); } catch {}
  };

  const renderTutorialStep = () => {
    const step = TUTORIAL_STEPS[tutorialStep]!;
    tutorialProgress.innerHTML = TUTORIAL_STEPS.map((_, index) => (
      `<span class="${index < tutorialStep ? 'is-done' : index === tutorialStep ? 'is-active' : ''}"></span>`
    )).join('');
    tutorialIcon.textContent = step.icon;
    tutorialStepLabel.textContent = `${t('tutorial.step')} ${tutorialStep + 1} / ${TUTORIAL_STEPS.length}`;
    tutorialStepTitle.textContent = t(`tutorial.${step.key}.title`);
    tutorialStepBody.textContent = t(`tutorial.${step.key}.body`);
    tutorialBack.hidden = tutorialStep === 0;
    tutorialNext.textContent = t(tutorialStep === TUTORIAL_STEPS.length - 1 ? 'tutorial.finish' : 'tutorial.next');
  };

  const close = () => {
    if (overlay.hidden) return;
    if (tutorialActive) markTutorialSeen();
    overlay.classList.remove('show');
    popFocusTrap(panel);
    popEscapeHandler(overlay);
    closeTimer = window.setTimeout(() => {
      overlay.hidden = true;
      closeTimer = null;
      openButton.focus({ preventScroll: true });
    }, 180);
  };

  const open = (showTutorial = false) => {
    if (closeTimer !== null) {
      window.clearTimeout(closeTimer);
      closeTimer = null;
    }
    tutorialActive = showTutorial;
    tutorialStep = 0;
    guide.hidden = showTutorial;
    tutorialView.hidden = !showTutorial;
    if (showTutorial) renderTutorialStep();
    overlay.hidden = false;
    pushFocusTrap(panel);
    pushEscapeHandler(overlay, close);
    requestAnimationFrame(() => {
      overlay.classList.add('show');
      (showTutorial ? tutorialNext : closeButton).focus({ preventScroll: true });
    });
  };

  openButton.addEventListener('click', () => open(false));
  startTutorialButton.addEventListener('click', () => {
    tutorialActive = true;
    tutorialStep = 0;
    guide.hidden = true;
    tutorialView.hidden = false;
    renderTutorialStep();
    tutorialNext.focus({ preventScroll: true });
  });
  closeButton.addEventListener('click', close);
  tutorialSkip.addEventListener('click', close);
  tutorialBack.addEventListener('click', () => {
    if (tutorialStep <= 0) return;
    tutorialStep--;
    renderTutorialStep();
  });
  tutorialNext.addEventListener('click', () => {
    if (tutorialStep >= TUTORIAL_STEPS.length - 1) {
      markTutorialSeen();
      close();
      return;
    }
    tutorialStep++;
    renderTutorialStep();
  });
  overlay.addEventListener('pointerdown', event => {
    if (event.target === overlay) close();
  });

  const openTutorialIfNeeded = (force = false) => {
    let tutorialSeen = false;
    try { tutorialSeen = localStorage.getItem(TUTORIAL_SEEN_KEY) === '1'; } catch {}
    if ((!force && tutorialSeen) || !overlay.hidden || !document.body.classList.contains('menu-open')) return;
    open(true);
  };

  window.addEventListener('hand-sabers:open-tutorial', event => {
    const force = (event as CustomEvent<{ force?: boolean }>).detail?.force === true;
    window.setTimeout(() => openTutorialIfNeeded(force), 0);
  });
}
