export const S = {
  MENU:     'menu',
  LOADING:  'loading',
  CALIB:    'calib',
  PLAYING:  'playing',
  PAUSED:   'paused',
  GAMEOVER: 'gameover'
};

export const state = {
  appState:         S.MENU,
  calibIdx:         0,
  score:            0,
  combo:            0,
  maxCombo:         0,
  lives:            10,
  maxLives:         10,
  tick:             0,
  fps:              0,
  frameMs:          0,
  deltaMs:          16.7,
  deltaSec:         1 / 60,
  deltaScale:       1,
  handsLeftActive:  false,
  handsRightActive: false,
  pauseReason:      null,  // null | 'manual' | 'hands'
  noFail:           false,
  oneHandMode:      null,   // null | 'left' | 'right'
  map:              null,   // załadowana mapa lub null (tryb losowy)
  saberQuatL:       null,
  saberQuatR:       null,
};
