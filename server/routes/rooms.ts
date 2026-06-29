import type { Express } from 'express';
import QRCode from 'qrcode';
import type { RoomRegistry } from '../realtime/rooms.js';
import { errorMessage, getIp } from '../utils.js';

type RateLimiter = (ip: string, key: string, maxPerMinute: number) => boolean;

interface RoomRoutesOptions {
  app: Express;
  rooms: RoomRegistry;
  rateLimit: RateLimiter;
}

function getPublicOrigin(protocol: string, hostHeader: string | undefined): string {
  const host = String(hostHeader || 'localhost:3000');
  if (!/^[a-z0-9.[\]:-]+$/i.test(host)) return 'http://localhost:3000';
  return `${protocol === 'https' ? 'https' : 'http'}://${host}`;
}

export function registerRoomRoutes({ app, rooms, rateLimit }: RoomRoutesOptions): void {
  app.post('/api/rooms', async (req, res) => {
    try {
      const ip = getIp(req);
      if (rateLimit(ip, 'rooms-create', 10)) {
        return res.status(429).json({ error: 'Za dużo utworzonych pokojów. Spróbuj ponownie za chwilę.' });
      }

      const room = rooms.create();
      const fragment = new URLSearchParams({ room: room.code, token: room.joinToken });
      const joinUrl = `${getPublicOrigin(req.protocol, req.get('host'))}/beat-sabers-3d.html#${fragment}`;
      const qrDataUrl = await QRCode.toDataURL(joinUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 320,
        color: { dark: '#05070d', light: '#ffffff' },
      });

      res.status(201).json({
        room: {
          code: room.code,
          createdAt: room.createdAt,
          expiresAt: room.expiresAt,
          players: room.players,
        },
        hostToken: room.hostToken,
        joinToken: room.joinToken,
        joinUrl,
        qrDataUrl,
      });
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  app.get('/api/rooms/:code', (req, res) => {
    const ip = getIp(req);
    if (rateLimit(ip, 'rooms-read', 120)) {
      return res.status(429).json({ error: 'Za dużo żądań. Spróbuj ponownie za chwilę.' });
    }
    const room = rooms.get(String(req.params['code'] || ''));
    if (!room) return res.status(404).json({ error: 'Pokój nie istnieje lub wygasł.' });
    res.json(room);
  });
}
