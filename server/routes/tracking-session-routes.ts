import type { Express } from 'express';
import QRCode from 'qrcode';
import type { TrackingSessionRegistry } from '../realtime/tracking-session-registry.js';
import { getIp } from '../utils.js';

type RateLimiter = (ip: string, key: string, maxPerMinute: number) => boolean;

interface TrackingSessionRoutesOptions {
  app: Express;
  sessions: TrackingSessionRegistry;
  rateLimit: RateLimiter;
}

function publicOrigin(protocol: string, hostHeader: string | undefined): string {
  const host = String(hostHeader || 'localhost:3000');
  if (!/^[a-z0-9.[\]:-]+$/i.test(host)) return 'http://localhost:3000';
  return `${protocol === 'https' ? 'https' : 'http'}://${host}`;
}

function bearerToken(header: string | undefined): string {
  const match = /^Bearer ([A-Za-z0-9_-]{20,128})$/.exec(String(header || ''));
  return match?.[1] ?? '';
}

export function registerTrackingSessionRoutes({
  app,
  sessions,
  rateLimit,
}: TrackingSessionRoutesOptions): void {
  app.post('/api/tracking-sessions', async (req, res) => {
    const ip = getIp(req);
    if (rateLimit(ip, 'tracking-session-create', 5)) {
      return res.status(429).json({ error: 'RATE_LIMITED' });
    }
    try {
      const session = sessions.create();
      const fragment = new URLSearchParams({ session: session.id, token: session.phoneToken });
      const phoneUrl = `${publicOrigin(req.protocol, req.get('host'))}/remote-camera.html#${fragment}`;
      const qrDataUrl = await QRCode.toDataURL(phoneUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 320,
        color: { dark: '#05070d', light: '#ffffff' },
      });
      res.status(201).json({
        session: {
          id: session.id,
          code: session.code,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
        },
        hostToken: session.hostToken,
        phoneUrl,
        qrDataUrl,
      });
    } catch (error) {
      console.error('Failed to create tracking session:', error);
      res.status(500).json({ error: 'TRACKING_SESSION_CREATE_FAILED' });
    }
  });

  app.post('/api/tracking-sessions/code/:code', (req, res) => {
    const ip = getIp(req);
    if (rateLimit(ip, 'tracking-session-claim', 6)) {
      return res.status(429).json({ error: 'RATE_LIMITED' });
    }
    const credential = sessions.claimPhoneCredential(String(req.params['code'] || ''));
    if (!credential) return res.status(404).json({ error: 'TRACKING_SESSION_NOT_FOUND' });
    res.json(credential);
  });

  app.post('/api/tracking-sessions/:id/claim', (req, res) => {
    const ip = getIp(req);
    if (rateLimit(ip, 'tracking-session-token-claim', 12)) {
      return res.status(429).json({ error: 'RATE_LIMITED' });
    }
    const credential = sessions.claimPhoneCredentialByToken(
      String(req.params['id'] || ''),
      bearerToken(req.get('authorization')),
    );
    if (!credential) return res.status(404).json({ error: 'TRACKING_SESSION_NOT_FOUND' });
    res.json(credential);
  });

  app.get('/api/tracking-sessions/:id', (req, res) => {
    const ip = getIp(req);
    if (rateLimit(ip, 'tracking-session-read', 120)) {
      return res.status(429).json({ error: 'RATE_LIMITED' });
    }
    const status = sessions.getStatus(
      String(req.params['id'] || ''),
      bearerToken(req.get('authorization')),
    );
    if (!status) return res.status(404).json({ error: 'TRACKING_SESSION_NOT_FOUND' });
    res.json(status);
  });

  app.delete('/api/tracking-sessions/:id', (req, res) => {
    const ip = getIp(req);
    if (rateLimit(ip, 'tracking-session-revoke', 20)) {
      return res.status(429).json({ error: 'RATE_LIMITED' });
    }
    const revoked = sessions.revoke(
      String(req.params['id'] || ''),
      bearerToken(req.get('authorization')),
    );
    if (!revoked) return res.status(404).json({ error: 'TRACKING_SESSION_NOT_FOUND' });
    res.status(204).end();
  });
}
