import { t } from '../i18n/index.ts';
import { createModalTransition } from './modal-transition.ts';

const TUTORIAL_SEEN_KEY = 'hs_tutorial_seen';
const TUTORIAL_STEPS = [
  { key: 'cameraCheck', icon: 'videocam' },
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
  const tutorialNext = document.getElementById('tutorialNext') as HTMLButtonElement | null;
  const cameraCheck = document.getElementById('tutorialCameraCheck');
  const cameraPreview = document.getElementById('tutorialCameraPreview') as HTMLVideoElement | null;
  const cameraStart = document.getElementById('tutorialCameraStart') as HTMLButtonElement | null;
  const cameraStatus = document.getElementById('tutorialCameraStatus');
  const calibrationAction = document.getElementById('tutorialCalibrationAction');
  const calibrationStart = document.getElementById('tutorialCalibrationStart') as HTMLButtonElement | null;
  if (
    !overlay || !panel || !openButton || !closeButton || !guide || !tutorialView ||
    !startTutorialButton || !tutorialProgress || !tutorialIcon || !tutorialStepLabel ||
    !tutorialStepTitle || !tutorialStepBody || !tutorialSkip || !tutorialBack || !tutorialNext ||
    !cameraCheck || !cameraPreview || !cameraStart || !cameraStatus ||
    !calibrationAction || !calibrationStart
  ) return;

  let tutorialActive = false;
  let tutorialStep = 0;
  let cameraStream: MediaStream | null = null;
  let cameraReady = false;
  let cameraAttempt = 0;
  let markSeenOnClose = true;

  const stopCameraCheck = () => {
    cameraAttempt++;
    cameraStream?.getTracks().forEach(track => track.stop());
    cameraStream = null;
    cameraPreview.srcObject = null;
  };

  const startCameraCheck = async () => {
    const attempt = ++cameraAttempt;
    cameraStart.disabled = true;
    cameraStatus.dataset['state'] = 'checking';
    cameraStatus.textContent = t('tutorial.cameraCheck.checking');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      if (attempt !== cameraAttempt || TUTORIAL_STEPS[tutorialStep]?.key !== 'cameraCheck') {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      cameraStream = stream;
      cameraPreview.srcObject = stream;
      await cameraPreview.play();
      if (attempt !== cameraAttempt) return;
      cameraReady = cameraPreview.videoWidth > 0 && cameraPreview.videoHeight > 0;
      cameraStatus.dataset['state'] = cameraReady ? 'ready' : 'error';
      cameraStatus.textContent = cameraReady
        ? `${t('tutorial.cameraCheck.ready')} ${cameraPreview.videoWidth}×${cameraPreview.videoHeight}`
        : t('tutorial.cameraCheck.failed');
      tutorialNext.disabled = !cameraReady;
    } catch {
      if (attempt !== cameraAttempt) return;
      cameraStatus.dataset['state'] = 'error';
      cameraStatus.textContent = t('tutorial.cameraCheck.failed');
    } finally {
      if (attempt === cameraAttempt) cameraStart.disabled = false;
    }
  };

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
    const isCameraCheck = step.key === 'cameraCheck';
    const isCalibration = step.key === 'calibration';
    tutorialView.classList.toggle('has-camera-check', isCameraCheck);
    tutorialView.classList.toggle('has-calibration-action', isCalibration);
    cameraCheck.hidden = !isCameraCheck;
    calibrationAction.hidden = !isCalibration;
    tutorialNext.disabled = (isCameraCheck && !cameraReady) || isCalibration;
    tutorialBack.hidden = tutorialStep === 0;
    tutorialNext.textContent = t(tutorialStep === TUTORIAL_STEPS.length - 1 ? 'tutorial.finish' : 'tutorial.next');
  };

  const modal = createModalTransition({
    overlay,
    panel,
    visibleClass: 'show',
    transitionMs: 220,
    onBeforeClose: () => {
      stopCameraCheck();
      if (tutorialActive && markSeenOnClose) markTutorialSeen();
    },
  });

  const close = () => {
    if (!modal.isOpen()) return;
    modal.close();
  };

  const open = (showTutorial = false, initialStep = 0) => {
    tutorialActive = showTutorial;
    tutorialStep = Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, initialStep));
    markSeenOnClose = true;
    cameraReady = false;
    cameraStatus.textContent = '';
    delete cameraStatus.dataset['state'];
    guide.hidden = showTutorial;
    tutorialView.hidden = !showTutorial;
    if (showTutorial) renderTutorialStep();
    const activeKey = TUTORIAL_STEPS[tutorialStep]?.key;
    modal.open({
      initialFocus: showTutorial
        ? (activeKey === 'cameraCheck' ? cameraStart : activeKey === 'calibration' ? calibrationStart : tutorialNext)
        : closeButton,
      returnFocusTo: openButton,
    });
  };

  openButton.addEventListener('click', () => open(false));
  startTutorialButton.addEventListener('click', () => {
    tutorialActive = true;
    tutorialStep = 0;
    cameraReady = false;
    cameraStatus.textContent = '';
    delete cameraStatus.dataset['state'];
    guide.hidden = true;
    tutorialView.hidden = false;
    renderTutorialStep();
    cameraStart.focus({ preventScroll: true });
  });
  closeButton.addEventListener('click', close);
  tutorialSkip.addEventListener('click', close);
  cameraStart.addEventListener('click', () => void startCameraCheck());
  calibrationStart.addEventListener('click', () => {
    markSeenOnClose = false;
    stopCameraCheck();
    modal.close();
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('hand-sabers:tutorial-calibration-request', {
        detail: { resumeStep: tutorialStep },
      }));
    }, 240);
  });
  tutorialBack.addEventListener('click', () => {
    if (tutorialStep <= 0) return;
    stopCameraCheck();
    tutorialStep--;
    renderTutorialStep();
  });
  tutorialNext.addEventListener('click', () => {
    if (tutorialStep >= TUTORIAL_STEPS.length - 1) {
      markTutorialSeen();
      close();
      return;
    }
    stopCameraCheck();
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
    const detail = (event as CustomEvent<{ force?: boolean; step?: number }>).detail;
    const force = detail?.force === true;
    const requestedStep = Number.isInteger(detail?.step) ? Number(detail?.step) : 0;
    window.setTimeout(() => {
      if (requestedStep > 0 && document.body.classList.contains('menu-open')) open(true, requestedStep);
      else openTutorialIfNeeded(force);
    }, 0);
  });
}
