const speakingPlayerIds = new Set<string>();

function updatePlayerElements(playerId: string, speaking: boolean): void {
  for (const element of document.querySelectorAll<HTMLElement>('[data-voice-player-id]')) {
    if (element.dataset['voicePlayerId'] === playerId) {
      element.classList.toggle('is-voice-speaking', speaking);
    }
  }
}

export function setVoicePlayerSpeaking(playerId: string, speaking: boolean): void {
  if (!playerId) return;
  if (speaking) speakingPlayerIds.add(playerId);
  else speakingPlayerIds.delete(playerId);
  updatePlayerElements(playerId, speaking);
}

export function isVoicePlayerSpeaking(playerId: string): boolean {
  return speakingPlayerIds.has(playerId);
}

export function clearVoiceSpeaking(): void {
  for (const playerId of speakingPlayerIds) updatePlayerElements(playerId, false);
  speakingPlayerIds.clear();
}
