import type { TutorialGameplayProgress } from '../game/tutorial-gameplay-session.ts';
import {
  TUTORIAL_GAMEPLAY_END_EVENT,
  TUTORIAL_GAMEPLAY_PROGRESS_EVENT,
} from '../game/tutorial-gameplay-session.ts';

const OBJECTIVES: Array<keyof TutorialGameplayProgress> = [
  'directionalCut',
  'goodTiming',
  'combo',
  'bombAvoided',
  'heldComplete',
  'pausedAndResumed',
];

export function initTutorialGameplayHud(): void {
  const hud = document.getElementById('tutorialGameplayHud');
  if (!hud) return;

  const rows = new Map<keyof TutorialGameplayProgress, HTMLElement>();
  for (const objective of OBJECTIVES) {
    const row = hud.querySelector<HTMLElement>(`[data-tutorial-objective="${objective}"]`);
    if (row) rows.set(objective, row);
  }

  window.addEventListener(TUTORIAL_GAMEPLAY_PROGRESS_EVENT, event => {
    const progress = (event as CustomEvent<TutorialGameplayProgress>).detail;
    if (!progress) return;
    hud.hidden = false;
    for (const objective of OBJECTIVES) {
      const row = rows.get(objective);
      if (!row) continue;
      const complete = progress[objective];
      row.classList.toggle('is-complete', complete);
      const icon = row.querySelector<HTMLElement>('.material-symbols-rounded');
      if (icon) icon.textContent = complete ? 'check_circle' : 'radio_button_unchecked';
    }
  });

  window.addEventListener(TUTORIAL_GAMEPLAY_END_EVENT, () => {
    hud.hidden = true;
  });
}
