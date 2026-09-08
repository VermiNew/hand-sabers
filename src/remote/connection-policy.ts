export const REMOTE_SESSION_ERROR_CODES = [
  'SESSION_EXPIRED',
  'SESSION_REVOKED',
  'UNAUTHORIZED',
  'SERVER_BUSY',
] as const;

export type RemoteSessionErrorCode = typeof REMOTE_SESSION_ERROR_CODES[number];
export type RemoteConnectionCode = RemoteSessionErrorCode | 'CONNECTION_LOST';

export type RemoteConnectionErrorKey =
  | 'sessionExpired'
  | 'sessionRevoked'
  | 'sessionUnauthorized'
  | 'serverBusy'
  | 'connectionLost';

export function parseRemoteSessionErrorCode(value: unknown): RemoteSessionErrorCode | null {
  return typeof value === 'string' && REMOTE_SESSION_ERROR_CODES.includes(value as RemoteSessionErrorCode)
    ? value as RemoteSessionErrorCode
    : null;
}

export function isTerminalRemoteSessionError(code: RemoteSessionErrorCode | null): boolean {
  return code === 'SESSION_EXPIRED' || code === 'SESSION_REVOKED' || code === 'UNAUTHORIZED';
}

export function remoteConnectionErrorKey(code: RemoteSessionErrorCode | null): RemoteConnectionErrorKey {
  if (code === 'SESSION_EXPIRED') return 'sessionExpired';
  if (code === 'SESSION_REVOKED') return 'sessionRevoked';
  if (code === 'UNAUTHORIZED') return 'sessionUnauthorized';
  if (code === 'SERVER_BUSY') return 'serverBusy';
  return 'connectionLost';
}

export function remoteConnectionCode(code: RemoteSessionErrorCode | null): RemoteConnectionCode {
  return code ?? 'CONNECTION_LOST';
}

export function remoteReconnectDelay(attempt: number): number {
  return Math.min(10_000, 750 * 2 ** Math.max(0, attempt));
}
