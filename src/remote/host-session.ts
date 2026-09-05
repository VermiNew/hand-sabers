import { openRemoteTrackingChannel } from './channel.ts';
import { getSettings } from '../core/settings.ts';
import { isAudioEvent } from './audio-protocol.ts';
import { onPhoneAudioError, onPhoneAudioReady, setHostAudioSocket } from './host-audio.ts';
import type { TrackingOptionsCommand } from './tracking-options-protocol.ts';
import {
  isPhoneTrackingMetricsEvent,
  recordPhoneTrackingMetrics,
  recordRemoteTrackingPacket,
  resetRemoteTrackingMetrics,
} from './tracking-metrics.ts';

export interface RemoteTrackingSession {
  id: string;
  hostToken: string;
  expiresAt: number;
  code: string;
  phoneUrl: string;
  qrDataUrl: string;
}

export type RemoteTrackingSessionPhase =
  | 'idle'
  | 'connecting'
  | 'ready'
  | 'approvalPending'
  | 'approvalGranted'
  | 'claimed'
  | 'connected'
  | 'expired'
  | 'error';

export interface RemoteTrackingSessionState {
  session: RemoteTrackingSession | null;
  phase: RemoteTrackingSessionPhase;
  error: 'createFailed' | 'rateLimited' | 'sessionExpired' | 'statusFailed' | 'approvalFailed' | null;
}

interface TrackingSessionResponse {
  session?: {
    id?: unknown;
    code?: unknown;
    expiresAt?: unknown;
  };
  hostToken?: unknown;
  phoneUrl?: unknown;
  qrDataUrl?: unknown;
}

interface TrackingSessionStatus {
  expiresAt?: unknown;
  phoneCredentialIssued?: unknown;
  phoneApprovalPending?: unknown;
  phoneApprovalGranted?: unknown;
  phoneConnected?: unknown;
}

interface ActiveSession extends RemoteTrackingSession {
  pollTimer: ReturnType<typeof setInterval> | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempt: number;
  socket: WebSocket | null;
}

const STORAGE_KEY = 'hand-sabers.remote-tracking-host.v1';
const SESSION_ID_RE = /^[A-Za-z0-9_-]{16}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
const CODE_RE = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

let activeSession: ActiveSession | null = null;
let remoteTrackingConnected = false;
let initialized = false;
let state: RemoteTrackingSessionState = { session: null, phase: 'idle', error: null };

function createTrackingOptionsCommand(): TrackingOptionsCommand {
  const settings = getSettings();
  return {
    v: 1,
    type: 'tracking-options',
    options: {
      handDetectionConfidence: settings.handDetectionConfidence,
      handPresenceConfidence: settings.handPresenceConfidence,
      handTrackingConfidence: settings.handTrackingConfidence,
    },
  };
}

function publicSession(session: ActiveSession | null): RemoteTrackingSession | null {
  if (!session) return null;
  return {
    id: session.id,
    hostToken: session.hostToken,
    expiresAt: session.expiresAt,
    code: session.code,
    phoneUrl: session.phoneUrl,
    qrDataUrl: session.qrDataUrl,
  };
}

function dispatchState(phase: RemoteTrackingSessionPhase, error: RemoteTrackingSessionState['error'] = null): void {
  state = { session: publicSession(activeSession), phase, error };
  window.dispatchEvent(new CustomEvent('hand-sabers:remote-session-state', { detail: state }));
}

function setRemoteTrackingConnected(connected: boolean): void {
  if (remoteTrackingConnected === connected) return;
  remoteTrackingConnected = connected;
  if (!connected) resetRemoteTrackingMetrics();
  window.dispatchEvent(new CustomEvent('hand-sabers:remote-tracking-state', { detail: { connected } }));
}

function bearer(session: ActiveSession): HeadersInit {
  return { Authorization: `Bearer ${session.hostToken}` };
}

function validSession(value: unknown): value is RemoteTrackingSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<RemoteTrackingSession>;
  return typeof session.id === 'string'
    && SESSION_ID_RE.test(session.id)
    && typeof session.hostToken === 'string'
    && TOKEN_RE.test(session.hostToken)
    && typeof session.expiresAt === 'number'
    && Number.isFinite(session.expiresAt)
    && session.expiresAt > Date.now()
    && typeof session.code === 'string'
    && CODE_RE.test(session.code)
    && typeof session.phoneUrl === 'string'
    && typeof session.qrDataUrl === 'string'
    && session.qrDataUrl.startsWith('data:image/png;base64,');
}

function persistSession(session: ActiveSession): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(publicSession(session)));
  } catch (error) {
    console.error('Remote tracking session persistence failed:', error);
  }
}

function forgetSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Remote tracking session cleanup failed:', error);
  }
}

function readStoredSession(): RemoteTrackingSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (validSession(parsed)) return parsed;
  } catch (error) {
    console.error('Remote tracking session restore failed:', error);
  }
  forgetSession();
  return null;
}

function clearTimers(session: ActiveSession): void {
  if (session.pollTimer) clearInterval(session.pollTimer);
  if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
  session.pollTimer = null;
  session.reconnectTimer = null;
}

function clearActiveSession(forget: boolean): ActiveSession | null {
  const session = activeSession;
  activeSession = null;
  if (session) {
    clearTimers(session);
    session.socket?.close();
    session.socket = null;
  }
  setHostAudioSocket(null);
  setRemoteTrackingConnected(false);
  if (forget) forgetSession();
  return session;
}

async function readStatus(session: ActiveSession): Promise<void> {
  const response = await fetch(`/api/tracking-sessions/${encodeURIComponent(session.id)}`, {
    headers: bearer(session),
  });
  if (!response.ok) throw new Error('STATUS_FAILED');
  const payload = await response.json().catch(() => ({})) as TrackingSessionStatus;
  if (activeSession !== session) return;
  if (typeof payload.expiresAt === 'number' && Number.isFinite(payload.expiresAt)) {
    session.expiresAt = payload.expiresAt;
    persistSession(session);
  }
  if (remoteTrackingConnected) dispatchState('connected');
  else if (payload.phoneConnected === true) dispatchState('connecting');
  else if (payload.phoneApprovalGranted === true) dispatchState('approvalGranted');
  else if (payload.phoneApprovalPending === true) dispatchState('approvalPending');
  else dispatchState(payload.phoneCredentialIssued === true ? 'claimed' : 'ready');
}

function startPolling(session: ActiveSession): void {
  if (session.pollTimer) clearInterval(session.pollTimer);
  session.pollTimer = setInterval(() => {
    void readStatus(session).catch(() => {
      if (activeSession !== session) return;
      if (Date.now() >= session.expiresAt) {
        clearActiveSession(true);
        dispatchState('expired', 'sessionExpired');
      } else {
        dispatchState(state.phase, 'statusFailed');
      }
    });
  }, 2_000);
}

function connectHostChannel(session: ActiveSession): void {
  if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
  session.reconnectTimer = null;
  let authenticationRejected = false;
  dispatchState('connecting');
  const socket = openRemoteTrackingChannel({
    sessionId: session.id,
    token: session.hostToken,
    role: 'host',
    onEvent: event => {
      if (activeSession !== session) return;
      if (event.type === 'joined') {
        session.reconnectAttempt = 0;
        if (typeof event.expiresAt === 'number' && Number.isFinite(event.expiresAt)) {
          session.expiresAt = event.expiresAt;
          persistSession(session);
        }
      } else if (event.type === 'peer-connected') {
        setRemoteTrackingConnected(true);
        dispatchState('connected');
        if (session.pollTimer) clearInterval(session.pollTimer);
        session.pollTimer = null;
        setHostAudioSocket(session.socket);
        sendPhoneTrackingOptions();
        window.dispatchEvent(new CustomEvent('hand-sabers:phone-audio-connected'));
      } else if (event.type === 'peer-disconnected') {
        setRemoteTrackingConnected(false);
        dispatchState('claimed');
        startPolling(session);
        setHostAudioSocket(null);
      } else if (event.type === 'error') {
        authenticationRejected = true;
      } else if (isAudioEvent(event)) {
        if (event.type === 'audio-ready') onPhoneAudioReady();
        else if (event.type === 'audio-error') onPhoneAudioError();
      } else if (isPhoneTrackingMetricsEvent(event)) {
        recordPhoneTrackingMetrics(event);
      }
    },
    onBinary: packet => {
      if (activeSession === session) {
        recordRemoteTrackingPacket(packet);
        window.dispatchEvent(new CustomEvent('hand-sabers:remote-tracking-packet', { detail: packet }));
      }
    },
    onClose: () => {
      if (activeSession !== session) return;
      session.socket = null;
      setHostAudioSocket(null);
      setRemoteTrackingConnected(false);
      if (Date.now() >= session.expiresAt || (authenticationRejected && session.reconnectAttempt >= 2)) {
        clearActiveSession(true);
        dispatchState('expired', 'sessionExpired');
        return;
      }
      dispatchState('connecting');
      const delay = Math.min(10_000, 750 * 2 ** session.reconnectAttempt++);
      session.reconnectTimer = setTimeout(() => {
        if (activeSession === session) connectHostChannel(session);
      }, delay);
    },
  });
  session.socket = socket;
}

function activateSession(session: RemoteTrackingSession): ActiveSession {
  const active: ActiveSession = {
    ...session,
    pollTimer: null,
    reconnectTimer: null,
    reconnectAttempt: 0,
    socket: null,
  };
  activeSession = active;
  persistSession(active);
  return active;
}

export function getRemoteTrackingSessionState(): RemoteTrackingSessionState {
  return state;
}

export function isRemoteTrackingConnected(): boolean {
  return remoteTrackingConnected;
}

/** Send the validated shared model thresholds to the currently paired phone. */
export function sendPhoneTrackingOptions(): boolean {
  const socket = activeSession?.socket;
  if (!remoteTrackingConnected || !socket || socket.readyState !== WebSocket.OPEN) return false;
  try {
    socket.send(JSON.stringify(createTrackingOptionsCommand()));
    return true;
  } catch {
    return false;
  }
}

export async function respondToPhoneApproval(approved: boolean): Promise<void> {
  const session = activeSession;
  if (!session) return;
  try {
    const response = await fetch(`/api/tracking-sessions/${encodeURIComponent(session.id)}/phone-claim`, {
      method: approved ? 'POST' : 'DELETE',
      headers: bearer(session),
    });
    if (!response.ok) throw new Error('APPROVAL_FAILED');
    await readStatus(session);
  } catch (error) {
    if (activeSession === session) dispatchState(state.phase, 'approvalFailed');
    throw error;
  }
}

export function initRemoteTrackingHost(): void {
  if (initialized) return;
  initialized = true;
  window.addEventListener('pagehide', () => {
    clearActiveSession(false);
  }, { once: true });

  const stored = readStoredSession();
  if (!stored) return;
  const session = activateSession(stored);
  dispatchState('connecting');
  void readStatus(session).then(() => {
    if (activeSession !== session) return;
    connectHostChannel(session);
    startPolling(session);
  }).catch(() => {
    if (activeSession !== session) return;
    clearActiveSession(true);
    dispatchState('expired', 'sessionExpired');
  });
}

export async function createRemoteTrackingSession(): Promise<void> {
  dispatchState('connecting');
  try {
    const response = await fetch('/api/tracking-sessions', { method: 'POST' });
    const payload = await response.json().catch(() => ({})) as TrackingSessionResponse;
    const session = payload.session;
    if (
      !response.ok
      || typeof session?.id !== 'string'
      || !SESSION_ID_RE.test(session.id)
      || typeof session.code !== 'string'
      || !CODE_RE.test(session.code)
      || typeof payload.hostToken !== 'string'
      || !TOKEN_RE.test(payload.hostToken)
      || typeof session.expiresAt !== 'number'
      || !Number.isFinite(session.expiresAt)
      || typeof payload.phoneUrl !== 'string'
      || typeof payload.qrDataUrl !== 'string'
      || !payload.qrDataUrl.startsWith('data:image/png;base64,')
    ) throw new Error(response.status === 429 ? 'RATE_LIMITED' : 'CREATE_FAILED');

    await revokeRemoteTrackingSession();
    const active = activateSession({
      id: session.id,
      hostToken: payload.hostToken,
      expiresAt: session.expiresAt,
      code: session.code,
      phoneUrl: payload.phoneUrl,
      qrDataUrl: payload.qrDataUrl,
    });
    dispatchState('ready');
    connectHostChannel(active);
    startPolling(active);
  } catch (error) {
    const rateLimited = error instanceof Error && error.message === 'RATE_LIMITED';
    dispatchState('error', rateLimited ? 'rateLimited' : 'createFailed');
    throw error;
  }
}

export async function revokeRemoteTrackingSession(): Promise<void> {
  const session = clearActiveSession(true);
  dispatchState('idle');
  if (!session) return;
  try {
    await fetch(`/api/tracking-sessions/${encodeURIComponent(session.id)}`, {
      method: 'DELETE',
      headers: bearer(session),
    });
  } catch {
    // The session is short-lived and its credentials have already been removed locally.
  }
}
