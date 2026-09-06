import { t } from '../i18n/index.ts';
import { createAvatarBadge } from './avatars.ts';
import { isVoicePlayerSpeaking } from './voice-speaking.ts';
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
  const gameChat = element<HTMLElement>('multiplayerGameChat');
  const gameChatToggle = element<HTMLButtonElement>('multiplayerGameChatToggle');
  const gameChatBody = element<HTMLElement>('multiplayerGameChatBody');
  const gameChatUnread = element<HTMLElement>('multiplayerGameChatUnread');
  const surfaces = [
    {
      messages: element<HTMLElement>('multiplayerChatMessages'),
      form: element<HTMLFormElement>('multiplayerChatForm'),
      input: element<HTMLInputElement>('multiplayerChatInput'),
      sendButton: element<HTMLButtonElement>('multiplayerChatSend'),
      gameplay: false,
    },
    {
      messages: element<HTMLElement>('multiplayerGameChatMessages'),
      form: element<HTMLFormElement>('multiplayerGameChatForm'),
      input: element<HTMLInputElement>('multiplayerGameChatInput'),
      sendButton: element<HTMLButtonElement>('multiplayerGameChatSend'),
      gameplay: true,
    },
  ];
  let history: ChatMessage[] = [];
  let connected = false;
  let expanded = false;
  let unread = 0;

  function createMessageRow(chatMessage: ChatMessage): HTMLElement {
    const row = document.createElement('article');
    row.className = `mp-chat-message${chatMessage.playerId === getCurrentPlayerId() ? ' is-own' : ''}`;
    row.dataset['voicePlayerId'] = chatMessage.playerId;
    row.classList.toggle('is-voice-speaking', isVoicePlayerSpeaking(chatMessage.playerId));
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
    return row;
  }

  function renderMessages(container: HTMLElement): void {
    container.replaceChildren();
    if (!history.length) {
      const empty = document.createElement('p');
      empty.className = 'mp-chat-empty';
      empty.textContent = t('multiplayer.chatEmpty');
      container.append(empty);
      return;
    }
    for (const chatMessage of history) container.append(createMessageRow(chatMessage));
    container.scrollTop = container.scrollHeight;
  }

  function updateUnread(): void {
    gameChatUnread.hidden = unread === 0;
    gameChatUnread.textContent = unread > 99 ? '99+' : String(unread);
    gameChatToggle.setAttribute('aria-label', unread > 0
      ? `${t(expanded ? 'multiplayer.chatCollapse' : 'multiplayer.chatExpand')}. ${t('multiplayer.chatUnread', { count: unread })}`
      : t(expanded ? 'multiplayer.chatCollapse' : 'multiplayer.chatExpand'));
  }

  function setExpanded(next: boolean): void {
    expanded = next;
    gameChat.classList.toggle('is-expanded', expanded);
    gameChatBody.hidden = !expanded;
    gameChatToggle.setAttribute('aria-expanded', String(expanded));
    if (expanded) {
      unread = 0;
      const gameplayMessages = surfaces[1]!.messages;
      gameplayMessages.scrollTop = gameplayMessages.scrollHeight;
    }
    updateUnread();
  }

  function setConnected(nextConnected: boolean): void {
    connected = nextConnected;
    for (const surface of surfaces) {
      surface.input.disabled = !connected;
      surface.sendButton.disabled = !connected;
    }
  }

  function reset(): void {
    history = [];
    unread = 0;
    for (const surface of surfaces) {
      surface.input.value = '';
      renderMessages(surface.messages);
    }
    setExpanded(false);
    setConnected(false);
  }

  for (const surface of surfaces) {
    surface.input.placeholder = t('multiplayer.chatPlaceholder');
    surface.input.setAttribute('aria-label', t('multiplayer.chatPlaceholder'));
    surface.form.addEventListener('submit', event => {
      event.preventDefault();
      const text = surface.input.value.trim();
      if (!text || !canSend()) return;
      onSend(text);
      surface.input.value = '';
    });
    if (surface.gameplay) {
      surface.form.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key !== 'Escape') return;
        event.preventDefault();
        setExpanded(false);
        gameChatToggle.focus({ preventScroll: true });
      });
    }
  }

  gameChatToggle.addEventListener('click', () => {
    setExpanded(!expanded);
    if (expanded && connected) surfaces[1]!.input.focus({ preventScroll: true });
  });

  reset();

  return {
    append(chatMessage): void {
      history.push(chatMessage);
      if (history.length > 50) history = history.slice(-50);
      for (const surface of surfaces) renderMessages(surface.messages);
      if (
        chatMessage.playerId !== getCurrentPlayerId()
        && !expanded
        && Boolean(document.body.dataset['multiplayerMode'])
      ) {
        unread++;
        updateUnread();
      }
    },
    reset,
    setConnected,
  };
}
