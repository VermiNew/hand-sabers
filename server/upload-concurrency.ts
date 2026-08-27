import { statSync } from 'fs';
import type { Request, RequestHandler } from 'express';
import { getIp } from './utils.js';

interface UploadConcurrencyOptions {
  initialUsedBytes: number;
  maxGlobal?: number;
  maxPerIp?: number;
  maxTempBytes: number;
  reservationBytes: number;
}

interface UploadConcurrencyGate {
  middleware: RequestHandler;
  release(req: Request): void;
  trackFile(req: Request, filePath: string): void;
}

interface UploadLease {
  ip: string;
  reservedBytes: number;
  tempPath: string | null;
}

export function createUploadConcurrencyGate({
  initialUsedBytes,
  maxGlobal = 4,
  maxPerIp = 2,
  maxTempBytes,
  reservationBytes,
}: UploadConcurrencyOptions): UploadConcurrencyGate {
  let activeGlobal = 0;
  let usedTempBytes = Math.max(0, initialUsedBytes);
  let reservedTempBytes = 0;
  const activeByIp = new Map<string, number>();
  const leases = new WeakMap<Request, UploadLease>();

  function release(req: Request): void {
    const lease = leases.get(req);
    if (!lease) return;
    leases.delete(req);
    activeGlobal = Math.max(0, activeGlobal - 1);
    reservedTempBytes = Math.max(0, reservedTempBytes - lease.reservedBytes);
    const activeForIp = Math.max(0, (activeByIp.get(lease.ip) ?? 0) - 1);
    if (activeForIp === 0) activeByIp.delete(lease.ip);
    else activeByIp.set(lease.ip, activeForIp);

    if (lease.tempPath) {
      try {
        usedTempBytes += Math.max(0, statSync(lease.tempPath).size);
      } catch {}
    }
  }

  function trackFile(req: Request, filePath: string): void {
    const lease = leases.get(req);
    if (lease) lease.tempPath = filePath;
  }

  const middleware: RequestHandler = (req, res, next) => {
    const ip = getIp(req);
    const activeForIp = activeByIp.get(ip) ?? 0;
    const requestReservation = req.is('multipart/form-data') ? reservationBytes : 0;
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
    if (usedTempBytes + reservedTempBytes + requestReservation > maxTempBytes) {
      res.status(507).json({
        error: 'Katalog tymczasowych uploadów osiągnął limit pojemności.',
      });
      return;
    }

    activeGlobal++;
    reservedTempBytes += requestReservation;
    activeByIp.set(ip, activeForIp + 1);
    leases.set(req, { ip, reservedBytes: requestReservation, tempPath: null });
    next();
  };

  return { middleware, release, trackFile };
}
