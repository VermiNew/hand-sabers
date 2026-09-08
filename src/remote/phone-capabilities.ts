export interface PhoneCapabilitiesEvent {
  v: 1;
  type: 'phone-capabilities';
  camera: {
    mediaDevices: boolean;
    webCodecs: boolean;
    widthConstraint: boolean;
    heightConstraint: boolean;
    frameRateConstraint: boolean;
    facingModeConstraint: boolean;
  };
  audio: {
    webAudio: boolean;
    mpeg: boolean;
    ogg: boolean;
    wav: boolean;
  };
  storage: {
    cacheStorage: boolean;
    deviceMemoryGb: number | null;
  };
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isPhoneCapabilitiesEvent(value: unknown): value is PhoneCapabilitiesEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  if (event['v'] !== 1 || event['type'] !== 'phone-capabilities') return false;
  const camera = event['camera'] as Record<string, unknown> | undefined;
  const audio = event['audio'] as Record<string, unknown> | undefined;
  const storage = event['storage'] as Record<string, unknown> | undefined;
  return Boolean(camera && audio && storage
    && isBoolean(camera['mediaDevices'])
    && isBoolean(camera['webCodecs'])
    && isBoolean(camera['widthConstraint'])
    && isBoolean(camera['heightConstraint'])
    && isBoolean(camera['frameRateConstraint'])
    && isBoolean(camera['facingModeConstraint'])
    && isBoolean(audio['webAudio'])
    && isBoolean(audio['mpeg'])
    && isBoolean(audio['ogg'])
    && isBoolean(audio['wav'])
    && isBoolean(storage['cacheStorage'])
    && (storage['deviceMemoryGb'] === null
      || (typeof storage['deviceMemoryGb'] === 'number'
        && Number.isFinite(storage['deviceMemoryGb'])
        && storage['deviceMemoryGb'] >= 0.25
        && storage['deviceMemoryGb'] <= 64)));
}

export function detectPhoneCapabilities(): PhoneCapabilitiesEvent {
  const constraints = navigator.mediaDevices?.getSupportedConstraints?.() ?? {};
  const audio = new Audio();
  const browserWindow = window as Window & { webkitAudioContext?: typeof AudioContext };
  const supports = (mime: string): boolean => {
    const result = audio.canPlayType(mime);
    return result === 'maybe' || result === 'probably';
  };
  const reportedMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const deviceMemoryGb = typeof reportedMemory === 'number' && Number.isFinite(reportedMemory)
    ? Math.max(0.25, Math.min(64, reportedMemory))
    : null;

  return {
    v: 1,
    type: 'phone-capabilities',
    camera: {
      mediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
      webCodecs: typeof window.VideoEncoder === 'function' && typeof window.VideoDecoder === 'function',
      widthConstraint: constraints.width === true,
      heightConstraint: constraints.height === true,
      frameRateConstraint: constraints.frameRate === true,
      facingModeConstraint: constraints.facingMode === true,
    },
    audio: {
      webAudio: typeof window.AudioContext === 'function'
        || typeof browserWindow.webkitAudioContext === 'function',
      mpeg: supports('audio/mpeg'),
      ogg: supports('audio/ogg; codecs="vorbis"'),
      wav: supports('audio/wav; codecs="1"'),
    },
    storage: {
      cacheStorage: 'caches' in window,
      deviceMemoryGb,
    },
  };
}

export function supportsPhoneAudio(capabilities: PhoneCapabilitiesEvent): boolean {
  return capabilities.audio.webAudio
    && (capabilities.audio.mpeg || capabilities.audio.ogg || capabilities.audio.wav);
}
