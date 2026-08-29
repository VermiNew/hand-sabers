import { MAX_IMPORT_BYTES } from './map-format.js';
import { coreT } from './translate.js';

export const MAX_ZIP_ENTRIES = 128;
export const MAX_ZIP_ENTRY_BYTES = MAX_IMPORT_BYTES;
export const MAX_ZIP_OUTPUT_BYTES = MAX_IMPORT_BYTES;
export const MAX_ZIP_MAP_BYTES = 25 * 1024 * 1024;

interface ZipDataChunk {
  length: number;
}

interface ZipStream {
  on(event: 'data', callback: (chunk: Uint8Array) => void): ZipStream;
  on(event: 'end', callback: () => void): ZipStream;
  on(event: 'error', callback: (error: Error) => void): ZipStream;
  pause(): ZipStream;
  resume(): ZipStream;
}

export interface LimitedZipEntry {
  name: string;
  dir?: boolean;
  // JSZip stores the central-directory size here for archives loaded with loadAsync().
  _data?: { uncompressedSize?: number };
  internalStream?(type: 'uint8array'): ZipStream;
}

export interface ZipOutputBudget {
  usedBytes: number;
  readonly limitBytes: number;
}

function megabytes(bytes: number): number {
  return Math.round(bytes / 1024 / 1024);
}

function expandedTooLarge(limitBytes: number): Error {
  return new Error(coreT('zipExpandedTooLarge', { limit: megabytes(limitBytes) }));
}

export function createZipOutputBudget(limitBytes = MAX_ZIP_OUTPUT_BYTES): ZipOutputBudget {
  return { usedBytes: 0, limitBytes };
}

export function assertZipDeclaredLimits(entries: readonly LimitedZipEntry[]): void {
  if (entries.length > MAX_ZIP_ENTRIES) {
    throw new Error(coreT('zipTooManyEntries', { count: entries.length, limit: MAX_ZIP_ENTRIES }));
  }

  let totalBytes = 0;
  for (const entry of entries) {
    if (entry.dir) continue;
    const size = Number(entry._data?.uncompressedSize ?? 0);
    if (!Number.isSafeInteger(size) || size < 0) throw expandedTooLarge(MAX_ZIP_OUTPUT_BYTES);
    if (size > MAX_ZIP_ENTRY_BYTES) {
      throw new Error(coreT('zipEntryTooLarge', {
        name: entry.name,
        limit: megabytes(MAX_ZIP_ENTRY_BYTES),
      }));
    }
    totalBytes += size;
    if (totalBytes > MAX_ZIP_OUTPUT_BYTES) throw expandedTooLarge(MAX_ZIP_OUTPUT_BYTES);
  }
}

export function readZipEntryBytes(
  entry: LimitedZipEntry,
  budget: ZipOutputBudget,
  entryLimitBytes = MAX_ZIP_ENTRY_BYTES,
): Promise<Uint8Array> {
  const stream = entry.internalStream?.('uint8array');
  if (!stream) return Promise.reject(new Error('Nie można bezpiecznie rozpakować wpisu ZIP.'));

  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let entryBytes = 0;
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      stream.pause();
      reject(error);
    };

    stream
      .on('data', (chunk: Uint8Array) => {
        if (settled) return;
        const chunkLength = Number((chunk as ZipDataChunk).length);
        if (!Number.isSafeInteger(chunkLength) || chunkLength < 0) {
          fail(expandedTooLarge(budget.limitBytes));
          return;
        }
        entryBytes += chunkLength;
        if (entryBytes > entryLimitBytes) {
          fail(new Error(coreT('zipEntryTooLarge', {
            name: entry.name,
            limit: megabytes(entryLimitBytes),
          })));
          return;
        }
        if (budget.usedBytes + chunkLength > budget.limitBytes) {
          fail(expandedTooLarge(budget.limitBytes));
          return;
        }
        budget.usedBytes += chunkLength;
        chunks.push(chunk);
      })
      .on('error', fail)
      .on('end', () => {
        if (settled) return;
        settled = true;
        const output = new Uint8Array(entryBytes);
        let offset = 0;
        for (const chunk of chunks) {
          output.set(chunk, offset);
          offset += chunk.length;
        }
        resolve(output);
      })
      .resume();
  });
}

export async function readZipEntryText(
  entry: LimitedZipEntry,
  budget: ZipOutputBudget,
  entryLimitBytes = MAX_ZIP_MAP_BYTES,
): Promise<string> {
  return new TextDecoder().decode(await readZipEntryBytes(entry, budget, entryLimitBytes));
}

export async function readZipEntryArrayBuffer(
  entry: LimitedZipEntry,
  budget: ZipOutputBudget,
  entryLimitBytes = MAX_ZIP_ENTRY_BYTES,
): Promise<ArrayBuffer> {
  const bytes = await readZipEntryBytes(entry, budget, entryLimitBytes);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
