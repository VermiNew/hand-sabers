/** Default limit for small API calls; a stalled server must not freeze a screen forever. */
export const API_TIMEOUT_MS = 15_000;
/** Larger limit for audio and other multi-megabyte downloads. */
export const DOWNLOAD_TIMEOUT_MS = 60_000;

/**
 * fetch() that gives up after `timeoutMs` by aborting the request, so callers hit
 * their normal error handling. A caller-supplied `signal` still works: aborting
 * it cancels the request just like the timeout does.
 */
export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = API_TIMEOUT_MS,
): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
}
