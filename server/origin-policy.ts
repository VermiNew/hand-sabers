export interface OriginPolicy {
  isAllowed(origin: string | undefined): boolean;
}

function normalizeOrigin(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
    || url.origin === 'null') {
    throw new Error(`Nieprawidłowy origin: ${value}`);
  }
  return url.origin;
}

export function createOriginPolicy(enabled: boolean, configuredOrigins: readonly string[]): OriginPolicy {
  const allowedOrigins = new Set(configuredOrigins.map(normalizeOrigin));
  if (enabled && allowedOrigins.size === 0) {
    throw new Error('config.json: przy security=true pole "allowedOrigins" nie może być puste.');
  }

  return {
    isAllowed(origin): boolean {
      if (!enabled || !origin) return true;
      try {
        return allowedOrigins.has(normalizeOrigin(origin));
      } catch {
        return false;
      }
    },
  };
}
