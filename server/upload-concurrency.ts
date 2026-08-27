import { statSync } from 'fs';
import type { Request, RequestHandler } from 'express';
import { getIp } from './utils.js';

interface UploadConcurrencyOptions {
  byteRateGraceMs: number;
  byteRateWindowMs: number;
  initialUsedBytes: number;
  maxGlobal?: number;
  maxPerIp?: number;
  maxTempBytes: number;
  minBytesPerSecond: number;
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
  stopRateMonitor: (() => void) | null;
  tempPath: string | null;
}

export function createUploadConcurrencyGate({
  byteRateGraceMs,
  byteRateWindowMs,
  initialUsedBytes,
  maxGlobal = 4,
  maxPerIp = 2,
  maxTempBytes,
  minBytesPerSecond,
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
    lease.stopRateMonitor?.();
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
    const lease: UploadLease = {
      ip,
      reservedBytes: requestReservation,
      stopRateMonitor: null,
      tempPath: null,
    };
    leases.set(req, lease);

    const startedAt = Date.now();
    let lastCheckAt = startedAt;
    let windowBytes = 0;
    const onData = (chunk: Buffer): void => { windowBytes += chunk.byteLength; };
    const stopRateMonitor = (): void => {
      clearInterval(rateTimer);
      req.off('data', onData);
      req.off('end', stopRateMonitor);
      req.off('aborted', stopRateMonitor);
      req.off('error', stopRateMonitor);
    };
    const rateTimer = setInterval(() => {
      const now = Date.now();
      const elapsedMs = Math.max(1, now - lastCheckAt);
      if (now - startedAt < byteRateGraceMs) {
        windowBytes = 0;
        lastCheckAt = now;
        return;
      }
      const bytesPerSecond = windowBytes * 1000 / elapsedMs;
      windowBytes = 0;
      lastCheckAt = now;
      if (bytesPerSecond >= minBytesPerSecond || req.readableEnded || req.destroyed) return;

      stopRateMonitor();
      const error = new Error('Upload jest przesyłany zbyt wolno.');
      if (!res.headersSent && !res.writableEnded) {
        res.once('finish', () => req.destroy(error));
        res.set('Connection', 'close').status(408).json({ error: error.message });
      } else {
        req.destroy(error);
      }
    }, byteRateWindowMs);
    rateTimer.unref();
    lease.stopRateMonitor = stopRateMonitor;
    req.on('data', onData);
    req.once('end', stopRateMonitor);
    req.once('aborted', stopRateMonitor);
    req.once('error', stopRateMonitor);
    next();
  };

  return { middleware, release, trackFile };
}
