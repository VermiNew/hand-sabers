import type { DetectResult } from './realtime.ts';

export interface AutoFlipSuggestion {
  confidence: number;
  flipCamera: boolean;
}

export interface AutoFlipDetector {
  collect(result: DetectResult, currentFlip: boolean): AutoFlipSuggestion | null;
  reset(): void;
}

function desiredFlipFromHandSample(
  handedness: string | undefined,
  wristX: number,
  currentFlip: boolean,
): boolean | null {
  const label = String(handedness || '').toLowerCase();
  const side = label.includes('left') ? 'left' : label.includes('right') ? 'right' : null;
  if (!side || !Number.isFinite(wristX)) return null;
  const mappedRawX = currentFlip ? (1 - wristX) : wristX;
  const worldX = 0.5 - mappedRawX;
  const shouldBeLeftSide = side === 'left';
  const isMappedLeftSide = worldX < 0;
  return shouldBeLeftSide === isMappedLeftSide ? currentFlip : !currentFlip;
}

export function createAutoFlipDetector(): AutoFlipDetector {
  const samples: boolean[] = [];
  let applied = false;

  return {
    collect(result, currentFlip): AutoFlipSuggestion | null {
      if (applied) return null;
      const handedness = result.handedness ?? [];
      const landmarks = result.landmarks ?? [];
      for (let index = 0; index < landmarks.length; index++) {
        const hand = handedness[index]?.[0];
        if ((hand?.score ?? 0) < 0.62) continue;
        const desired = desiredFlipFromHandSample(
          hand?.categoryName ?? hand?.displayName,
          landmarks[index]?.[0]?.x ?? 0.5,
          currentFlip,
        );
        if (desired !== null) samples.push(desired);
        if (samples.length > 15) samples.shift();
      }
      if (samples.length < 5) return null;

      const trueCount = samples.filter(Boolean).length;
      const flipCamera = trueCount >= Math.ceil(samples.length / 2);
      applied = true;
      return {
        flipCamera,
        confidence: Math.max(trueCount, samples.length - trueCount) / samples.length,
      };
    },
    reset(): void {
      samples.length = 0;
      applied = false;
    },
  };
}
