import { t } from '../i18n/index.ts';
import { createAvatarBadge } from './avatars.ts';
import { element } from './client-utils.ts';
import type { ChatMessage } from './protocol.ts';

interface MultiplayerChatViewOptions {
  canSend(): boolean;
  getCurrentPlayerId(): string;
  onSend(text: string): void;
}

export interface MultiplayerChatView {
  append(chatMessage: ChatMessage): void;
  reset(): void;
  setConnected(connected: boolean): void;
}

export function createMultiplayerChatView({
  canSend,
  getCurrentPlayerId,
  onSend,
}: MultiplayerChatViewOptions): MultiplayerChatView {
  const messages = element<HTMLElement>('multiplayerChatMessages');
  const form = element<HTMLFormElement>('multiplayerChatForm');
  const input = element<HTMLInputElement>('multiplayerChatInput');
  const sendButton = element<HTMLButtonElement>('multiplayerChatSend');

  input.placeholder = t('multiplayer.chatPlaceholder');
  input.setAttribute('aria-label', t('multiplayer.chatPlaceholder'));

  function setConnected(connected: boolean): void {
    input.disabled = !connected;
    sendButton.disabled = !connected;
  }

  function reset(): void {
    messages.replaceChildren();
    const empty = document.createElement('p');
    empty.className = 'mp-chat-empty';
    empty.textContent = t('multiplayer.chatEmpty');
    messages.append(empty);
    input.value = '';
    setConnected(false);
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || !canSend()) return;
    onSend(text);
    input.value = '';
  });

  reset();

  return {
    append(chatMessage): void {
      messages.querySelector('.mp-chat-empty')?.remove();
      const row = document.createElement('article');
      row.className = `mp-chat-message${chatMessage.playerId === getCurrentPlayerId() ? ' is-own' : ''}`;
      const header = document.createElement('div');
      header.className = 'mp-chat-header';
      header.append(createAvatarBadge(chatMessage.avatar, 20, chatMessage.color));
      const playerName = document.createElement('strong');
      playerName.textContent = chatMessage.playerName;
      playerName.style.color = chatMessage.color;
      header.append(playerName);
      const text = document.createElement('p');
      text.textContent = chatMessage.text;
      const time = document.createElement('time');
      const timestamp = new Date(chatMessage.sentAt);
      time.dateTime = timestamp.toISOString();
      time.textContent = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      row.append(header, text, time);
      messages.append(row);
      while (messages.childElementCount > 50) messages.firstElementChild?.remove();
      messages.scrollTop = messages.scrollHeight;
    },
    reset,
    setConnected,
  };
}
