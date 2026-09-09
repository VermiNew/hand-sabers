export const PHONE_CAMERA_FRAME_KIND = 3;
export const PHONE_CAMERA_FRAME_HEADER_BYTES = 20;
export const PHONE_CAMERA_FRAME_MAX_BYTES = 64 * 1024;
export const PHONE_CAMERA_FRAME_MAX_WIDTH = 640;
export const PHONE_CAMERA_FRAME_MAX_HEIGHT = 480;

export interface PhoneCameraFrame {
  sequence: number;
  sentAtEpochMs: number;
  width: number;
  height: number;
  jpeg: Uint8Array;
}

function hasJpegMarkers(bytes: Uint8Array): boolean {
  return bytes.length >= 4
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[bytes.length - 2] === 0xff
    && bytes[bytes.length - 1] === 0xd9;
}

function isStartOfFrameMarker(marker: number): boolean {
  return (marker >= 0xc0 && marker <= 0xc3)
    || (marker >= 0xc5 && marker <= 0xc7)
    || (marker >= 0xc9 && marker <= 0xcb)
    || (marker >= 0xcd && marker <= 0xcf);
}

function readJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (!hasJpegMarkers(bytes)) return null;
  let offset = 2;
  let dimensions: { width: number; height: number } | null = null;

  while (offset < bytes.length - 2) {
    if (bytes[offset] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length - 1) return null;
    const marker = bytes[offset++]!;
    if (marker === 0x00 || marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      return null;
    }
    if (marker === 0x01) continue;
    if (offset + 2 > bytes.length) return null;
    const segmentLength = (bytes[offset]! << 8) | bytes[offset + 1]!;
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;

    if (isStartOfFrameMarker(marker)) {
      if (dimensions || segmentLength < 8) return null;
      const height = (bytes[offset + 3]! << 8) | bytes[offset + 4]!;
      const width = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
      if (width < 1 || height < 1) return null;
      dimensions = { width, height };
    }
    if (marker === 0xda) return dimensions;
    offset += segmentLength;
  }
  return null;
}

export function encodePhoneCameraFrame(frame: PhoneCameraFrame): ArrayBuffer | null {
  const packetLength = PHONE_CAMERA_FRAME_HEADER_BYTES + frame.jpeg.byteLength;
  if (
    !Number.isSafeInteger(frame.sequence)
    || frame.sequence < 0
    || !Number.isFinite(frame.sentAtEpochMs)
    || frame.sentAtEpochMs < 0
    || !Number.isSafeInteger(frame.width)
    || frame.width < 1
    || frame.width > PHONE_CAMERA_FRAME_MAX_WIDTH
    || !Number.isSafeInteger(frame.height)
    || frame.height < 1
    || frame.height > PHONE_CAMERA_FRAME_MAX_HEIGHT
    || packetLength > PHONE_CAMERA_FRAME_MAX_BYTES
    || !hasJpegMarkers(frame.jpeg)
  ) return null;
  const dimensions = readJpegDimensions(frame.jpeg);
  if (!dimensions || dimensions.width !== frame.width || dimensions.height !== frame.height) return null;

  const packet = new Uint8Array(packetLength);
  const view = new DataView(packet.buffer);
  view.setUint8(0, 1);
  view.setUint8(1, PHONE_CAMERA_FRAME_KIND);
  view.setUint32(4, frame.sequence, true);
  view.setFloat64(8, frame.sentAtEpochMs, true);
  view.setUint16(16, frame.width, true);
  view.setUint16(18, frame.height, true);
  packet.set(frame.jpeg, PHONE_CAMERA_FRAME_HEADER_BYTES);
  return packet.buffer;
}

export function decodePhoneCameraFrame(packet: Uint8Array): PhoneCameraFrame | null {
  if (
    packet.byteLength <= PHONE_CAMERA_FRAME_HEADER_BYTES
    || packet.byteLength > PHONE_CAMERA_FRAME_MAX_BYTES
  ) return null;
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  const sequence = view.getUint32(4, true);
  const sentAtEpochMs = view.getFloat64(8, true);
  const width = view.getUint16(16, true);
  const height = view.getUint16(18, true);
  const jpeg = packet.subarray(PHONE_CAMERA_FRAME_HEADER_BYTES);
  if (
    view.getUint8(0) !== 1
    || view.getUint8(1) !== PHONE_CAMERA_FRAME_KIND
    || view.getUint8(2) !== 0
    || view.getUint8(3) !== 0
    || !Number.isFinite(sentAtEpochMs)
    || sentAtEpochMs < 0
    || width < 1
    || width > PHONE_CAMERA_FRAME_MAX_WIDTH
    || height < 1
    || height > PHONE_CAMERA_FRAME_MAX_HEIGHT
    || !hasJpegMarkers(jpeg)
  ) return null;
  const dimensions = readJpegDimensions(jpeg);
  if (!dimensions || dimensions.width !== width || dimensions.height !== height) return null;
  return { sequence, sentAtEpochMs, width, height, jpeg };
}
