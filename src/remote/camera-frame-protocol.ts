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
  return { sequence, sentAtEpochMs, width, height, jpeg };
}
