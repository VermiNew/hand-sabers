import {
  AUDIO_BANK_MANIFEST_VERSION,
  type AudioBankManifest,
  type AudioBankManifestAsset,
} from './audio-bank-manifest.ts';

const AUDIO_CACHE_NAME = `hand-sabers-audio-v${AUDIO_BANK_MANIFEST_VERSION}`;
const SHA256_RE = /^[a-f0-9]{64}$/;

export interface PhoneAudioBankProgress {
  loadedAssets: number;
  totalAssets: number;
  loadedBytes: number;
  totalBytes: number;
}

export interface PreparedPhoneAudioBank {
  manifest: AudioBankManifest;
  musicObjectUrl: string;
  cachedAssets: number;
}

function isManifestAsset(value: unknown): value is AudioBankManifestAsset {
  if (!value || typeof value !== 'object') return false;
  const asset = value as Record<string, unknown>;
  if (typeof asset['id'] !== 'string' || !asset['id']) return false;
  if (asset['category'] !== 'music' && asset['category'] !== 'interface' && asset['category'] !== 'gameplay') return false;
  if (asset['kind'] !== 'file' && asset['kind'] !== 'procedural') return false;
  if (typeof asset['bytes'] !== 'number' || !Number.isSafeInteger(asset['bytes']) || asset['bytes'] < 0) return false;
  if (typeof asset['sha256'] !== 'string' || !SHA256_RE.test(asset['sha256'])) return false;
  if (asset['kind'] === 'file') return typeof asset['url'] === 'string' && asset['url'].startsWith('/api/');
  return typeof asset['recipe'] === 'string' && Number.isSafeInteger(asset['recipeVersion']);
}

function parseManifest(value: unknown, expectedMapId: string): AudioBankManifest {
  if (!value || typeof value !== 'object') throw new Error('INVALID_MANIFEST');
  const manifest = value as Record<string, unknown>;
  if (
    manifest['version'] !== AUDIO_BANK_MANIFEST_VERSION
    || manifest['mapId'] !== expectedMapId
    || typeof manifest['bankId'] !== 'string'
    || !SHA256_RE.test(manifest['bankId'])
    || typeof manifest['totalBytes'] !== 'number'
    || !Number.isSafeInteger(manifest['totalBytes'])
    || manifest['totalBytes'] < 0
    || !Array.isArray(manifest['assets'])
    || manifest['assets'].length < 1
    || manifest['assets'].length > 100
    || !manifest['assets'].every(isManifestAsset)
  ) throw new Error('INVALID_MANIFEST');
  return manifest as unknown as AudioBankManifest;
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('INTEGRITY_UNAVAILABLE');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

function cacheKey(asset: AudioBankManifestAsset): Request {
  return new Request(`/api/audio-bank-cache/${asset.sha256}`, { method: 'GET' });
}

async function openAudioCache(): Promise<Cache | null> {
  if (!('caches' in globalThis)) return null;
  try {
    return await caches.open(AUDIO_CACHE_NAME);
  } catch {
    // Private browsing and storage pressure may disable persistent cache.
    return null;
  }
}

async function verifiedBlob(response: Response, asset: AudioBankManifestAsset): Promise<Blob> {
  const blob = await response.blob();
  if (blob.size !== asset.bytes) throw new Error('SIZE_MISMATCH');
  if (await sha256(await blob.arrayBuffer()) !== asset.sha256) throw new Error('HASH_MISMATCH');
  return blob;
}

async function downloadBlob(
  asset: AudioBankManifestAsset,
  signal: AbortSignal,
  onBytes: (loadedBytes: number) => void,
): Promise<Blob> {
  const response = await fetch(asset.url!, { signal, cache: 'no-cache' });
  if (!response.ok) throw new Error('ASSET_DOWNLOAD_FAILED');
  if (!response.body) {
    const blob = await response.blob();
    onBytes(blob.size);
    return blob;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    received += value.byteLength;
    if (received > asset.bytes) throw new Error('SIZE_MISMATCH');
    chunks.push(value);
    onBytes(received);
  }
  return new Blob(chunks, { type: asset.mimeType || response.headers.get('content-type') || 'application/octet-stream' });
}

export async function preparePhoneAudioBank(
  mapId: string,
  signal: AbortSignal,
  onProgress: (progress: PhoneAudioBankProgress) => void,
): Promise<PreparedPhoneAudioBank> {
  const manifestResponse = await fetch(`/api/audio-banks/${encodeURIComponent(mapId)}/manifest`, {
    signal,
    cache: 'no-cache',
  });
  if (!manifestResponse.ok) throw new Error('MANIFEST_LOAD_FAILED');
  const manifest = parseManifest(await manifestResponse.json(), mapId);
  const music = manifest.assets.find(asset => asset.id === 'music.map' && asset.kind === 'file');
  if (!music) throw new Error('MUSIC_ASSET_MISSING');

  const proceduralCount = manifest.assets.filter(asset => asset.kind === 'procedural').length;
  let loadedBytes = 0;
  let cachedAssets = 0;
  const report = (loadedAssets: number): void => onProgress({
    loadedAssets,
    totalAssets: manifest.assets.length,
    loadedBytes,
    totalBytes: manifest.totalBytes,
  });
  report(proceduralCount);

  const cache = await openAudioCache();
  const key = cacheKey(music);
  let blob: Blob | null = null;
  if (cache) {
    const cached = await cache.match(key);
    if (cached) {
      try {
        blob = await verifiedBlob(cached, music);
        loadedBytes = music.bytes;
        cachedAssets = 1;
      } catch {
        await cache.delete(key);
      }
    }
  }

  if (!blob) {
    const downloaded = await downloadBlob(music, signal, bytes => {
      loadedBytes = bytes;
      report(proceduralCount);
    });
    blob = await verifiedBlob(new Response(downloaded), music);
    if (cache) {
      await cache.put(key, new Response(blob, {
        headers: { 'Content-Type': music.mimeType || blob.type || 'application/octet-stream' },
      }));
    }
  }

  loadedBytes = music.bytes;
  report(manifest.assets.length);
  return {
    manifest,
    musicObjectUrl: URL.createObjectURL(blob),
    cachedAssets,
  };
}
