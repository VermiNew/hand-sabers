import { isDeveloperAccessGranted } from './developer-access.ts';

export function developerWarn(message: string, detail?: unknown): void {
  if (!isDeveloperAccessGranted()) return;
  if (detail === undefined) console.warn(message);
  else console.warn(message, detail);
}
