import { PAUSE_REASONS } from '../core/pause.ts';
import { S, state } from '../core/state.ts';
import type { Settings } from '../types/index.js';
import { t } from '../i18n/index.ts';
import {
  hideMultiplayerOverlay,
  sendMultiplayerScore,
  showMultiplayerOverlay,
} from '../multiplayer/client.ts';
import { hideHandsPaused, hidePauseMenu, showMapTitle, ui } from '../ui/ui.ts';
import { initAudio, stopMapAudio } from './audio.ts';
import type { CalibrationController } from './calibration-controller.ts';
import type { CalibrationUIController } from './calibration-ui.ts';
import type { GamePauseController } from './game-pause-controller.ts';
import { clearGameplayEntities, resetMapSpawn, resetMenuDemo, startGameplay } from './gameplay.ts';
import { ensureCurrentMapAudio, loadMapById } from './map-session.ts';
import type { MapTimeline } from './map-timeline.ts';
import type {
  MultiplayerResourceReadiness,
  MultiplayerRoundStart,
  MultiplayerRules,
} from './multiplayer-events.ts';
import type { MultiplayerScorePublisher } from './multiplayer-score-publisher.ts';
import { beginScoreSubmissionSession } from './score-submission.ts';
import {
  isPhoneAudioActive,
  isPhoneAudioPreparationPending,
  preparePhoneAudio,
  waitForPhoneAudioPreparation,
} from '../remote/host-audio.ts';

interface MultiplayerRoundSessionOptions {
  calibrationController: CalibrationController;
  calibrationUI: CalibrationUIController;
  gamePauseController: Pick<GamePauseController, 'reset'>;
  hideOverlay(): void;
  mapTimeline: MapTimeline;
  scorePublisher: MultiplayerScorePublisher;
  settings: Settings;
  startWithCalibration(): Promise<void>;
}

export interface MultiplayerRoundSession {
  cancelPreparation(): void;
  completePreparation(): boolean;
  finish(progress: number | undefined): { trainingMode: boolean };
  getTrainingMode(): boolean;
  isActive(): boolean;
  leave(): void;
  prepare(mapId: string): Promise<void>;
  start(detail: MultiplayerRoundStart): Promise<void>;
}

export function createMultiplayerRoundSession({
  calibrationController,
  calibrationUI,
  gamePauseController,
  hideOverlay,
  mapTimeline,
  scorePublisher,
  settings,
  startWithCalibration,
}: MultiplayerRoundSessionOptions): MultiplayerRoundSession {
  let active = false;
  let rules: MultiplayerRules | null = null;
  let preparationMapId = '';
  let preparationId = 0;
  let preparationReadiness: MultiplayerResourceReadiness = { map: false, audio: false, tracking: false };
  let singleplayerRules: Pick<Settings, 'gameMode' | 'noteSpeed'> | null = null;

  function restoreSingleplayerRules(): void {
    active = false;
    rules = null;
    if (singleplayerRules) {
      settings.gameMode = singleplayerRules.gameMode;
      settings.noteSpeed = singleplayerRules.noteSpeed;
      document.body.dataset['gameMode'] = singleplayerRules.gameMode;
      singleplayerRules = null;
    }
    state.noFail = settings.noFail;
    document.body.classList.toggle('training-mode', settings.trainingMode);
  }

  function publishPreparationProgress(): void {
    if (!preparationMapId) return;
    window.dispatchEvent(new CustomEvent('hand-sabers:multiplayer-preparation-progress', {
      detail: {
        mapId: preparationMapId,
        readiness: { ...preparationReadiness },
      },
    }));
  }

  function completePreparation(): boolean {
    if (!preparationMapId) return false;
    preparationReadiness.tracking = calibrationController.isReady();
    publishPreparationProgress();
    if (!Object.values(preparationReadiness).every(Boolean)) return false;
    const mapId = preparationMapId;
    const readiness = { ...preparationReadiness };
    preparationMapId = '';
    calibrationUI.hidePanel();
    hideOverlay();
    state.appState = S.MENU;
    const mainMenu = document.getElementById('mainMenu');
    if (mainMenu) mainMenu.style.display = 'flex';
    document.body.classList.add('menu-open');
    resetMenuDemo();
    showMultiplayerOverlay();
    window.dispatchEvent(new CustomEvent('hand-sabers:multiplayer-prepared', { detail: { mapId, readiness } }));
    return true;
  }

  return {
    cancelPreparation(): void {
      preparationId++;
      preparationMapId = '';
      preparationReadiness = { map: false, audio: false, tracking: false };
    },
    completePreparation,
    finish(progress): { trainingMode: boolean } {
      const wasActive = active;
      const trainingMode = wasActive ? Boolean(rules?.trainingMode) : settings.trainingMode;
      if (wasActive) {
        sendMultiplayerScore({
          score: Math.max(0, Math.round(state.score)),
          combo: Math.max(0, Math.round(state.combo)),
          lives: Math.max(0, Math.round(state.lives)),
          progress: progress ?? 0,
          finished: true,
        });
      }
      restoreSingleplayerRules();
      delete document.body.dataset['multiplayerMode'];
      return { trainingMode };
    },
    getTrainingMode: () => active ? Boolean(rules?.trainingMode) : settings.trainingMode,
    isActive: () => active,
    leave(): void {
      preparationId++;
      preparationMapId = '';
      preparationReadiness = { map: false, audio: false, tracking: false };
      if (active) window.dispatchEvent(new CustomEvent('hand-sabers:multiplayer-leave'));
      restoreSingleplayerRules();
    },
    async prepare(mapId): Promise<void> {
      const currentPreparationId = ++preparationId;
      preparationMapId = mapId;
      preparationReadiness = { map: false, audio: false, tracking: false };
      try {
        initAudio();
        if (!await loadMapById(mapId)) throw new Error('MAP_NOT_FOUND');
        if (currentPreparationId !== preparationId) return;
        preparationReadiness.map = true;
        publishPreparationProgress();
        await ensureCurrentMapAudio(settings);
        if (currentPreparationId !== preparationId) return;
        if (settings.phoneAudioOutput && state.map?.id === mapId && !state.map.localOnly && !isPhoneAudioActive()) {
          const pending = isPhoneAudioPreparationPending() || preparePhoneAudio(mapId);
          if (pending) await waitForPhoneAudioPreparation();
          if (currentPreparationId !== preparationId) return;
        }
        preparationReadiness.audio = true;
        publishPreparationProgress();
        if (calibrationController.isReady()) {
          completePreparation();
          return;
        }
        hideMultiplayerOverlay();
        await startWithCalibration();
      } catch (error) {
        if (currentPreparationId !== preparationId) return;
        console.error('Multiplayer preparation failed:', error);
        preparationMapId = '';
        const code = error instanceof Error && /^[A-Z0-9_]{1,64}$/.test(error.message)
          ? error.message
          : 'PREPARATION_FAILED';
        window.dispatchEvent(new CustomEvent('hand-sabers:multiplayer-prepare-error', { detail: { code } }));
      }
    },
    async start(detail): Promise<void> {
      if (!Number.isFinite(detail.startAtPerformance) || !await loadMapById(detail.mapId)) {
        window.dispatchEvent(new CustomEvent('hand-sabers:multiplayer-prepare-error'));
        return;
      }
      initAudio();
      await ensureCurrentMapAudio(settings);
      gamePauseController.reset();
      clearGameplayEntities();
      stopMapAudio();
      mapTimeline.reset();
      calibrationUI.hidePanel();
      hideOverlay();
      hideHandsPaused();
      hidePauseMenu();
      hideMultiplayerOverlay();
      const mainMenu = document.getElementById('mainMenu');
      if (mainMenu) mainMenu.style.display = 'none';
      document.body.classList.remove('menu-open');
      if (ui.hud) ui.hud.style.display = 'flex';
      if (ui.mapProgress) ui.mapProgress.style.display = 'flex';
      gamePauseController.reset();
      state.pauseReason = PAUSE_REASONS.NONE;
      state.appState = S.PLAYING;
      rules = { ...detail.rules };
      active = true;
      singleplayerRules = {
        gameMode: settings.gameMode,
        noteSpeed: settings.noteSpeed,
      };
      settings.gameMode = detail.rules.gameMode;
      settings.noteSpeed = detail.rules.noteSpeed;
      scorePublisher.reset();
      state.noFail = detail.rules.noFail;
      document.body.classList.toggle('training-mode', detail.rules.trainingMode);
      document.body.dataset['gameMode'] = detail.rules.gameMode;
      document.body.dataset['multiplayerMode'] = detail.mode;
      beginScoreSubmissionSession(state.map?.id, detail.rules.trainingMode, Boolean(state.map?.localOnly));
      resetMapSpawn();
      mapTimeline.startAt(detail.startAtPerformance);
      startGameplay(detail.saber);
      showMapTitle(state.map?.meta?.title ?? t('game.unknownTrack'));
      if (ui.dStatus) ui.dStatus.textContent = 'MULTIPLAYER';
    },
  };
}
