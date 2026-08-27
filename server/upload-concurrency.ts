import type { Request, RequestHandler } from 'express';
import { getIp } from './utils.js';

interface UploadConcurrencyGate {
  middleware: RequestHandler;
  release(req: Request): void;
}

export function createUploadConcurrencyGate(
  maxGlobal = 4,
  maxPerIp = 2,
): UploadConcurrencyGate {
  let activeGlobal = 0;
  const activeByIp = new Map<string, number>();
  const leases = new WeakSet<Request>();

  function release(req: Request): void {
    if (!leases.delete(req)) return;
    const ip = getIp(req);
    activeGlobal = Math.max(0, activeGlobal - 1);
    const activeForIp = Math.max(0, (activeByIp.get(ip) ?? 0) - 1);
    if (activeForIp === 0) activeByIp.delete(ip);
    else activeByIp.set(ip, activeForIp);
  }

  const middleware: RequestHandler = (req, res, next) => {
    const ip = getIp(req);
    const activeForIp = activeByIp.get(ip) ?? 0;
    if (activeForIp >= maxPerIp) {
      res.set('Retry-After', '2').status(429).json({
        error: 'Zbyt wiele równoczesnych uploadów z tego adresu. Spróbuj ponownie za chwilę.',
      });
      return;
    }
    if (activeGlobal >= maxGlobal) {
      res.set('Retry-After', '2').status(503).json({
        error: 'Serwer przetwarza maksymalną liczbę uploadów. Spróbuj ponownie za chwilę.',
      });
      return;
    }

    activeGlobal++;
    activeByIp.set(ip, activeForIp + 1);
    leases.add(req);
    next();
  };

  return { middleware, release };
}
