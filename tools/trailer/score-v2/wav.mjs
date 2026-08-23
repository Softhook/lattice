/**
 * WAV in and out, in about eighty lines. Pure — no DOM, no `node:fs` — so the browser half of
 * the render and the Node half of the analysis read the same file and cannot disagree about
 * what a sample is.
 *
 * 24-bit PCM rather than 16, for one reason: the deliverable is a master that an editor will
 * push around, and at 24 bits the question of whether to dither does not arise. Every NLE on
 * earth opens it.
 */

/** Bytes per sample. 3 is 24-bit signed little-endian, the widest integer format WAV agrees on. */
const BYTES = 3;
/** The largest magnitude a 24-bit sample can hold. Samples are clamped to ±this, and counted. */
const FULL_SCALE = 0x7fffff;

/**
 * Interleave float channels into a WAV file.
 *
 * Returns the bytes **and the number of samples that had to be clamped**, because a peak meter
 * that only reports the peak of what it wrote can never report a clip: everything above full
 * scale reads as exactly full scale afterwards.
 */
export function encodeWav(channels, sampleRate) {
  const frames = channels[0].length;
  const count = channels.length;
  const dataBytes = frames * count * BYTES;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  const ascii = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) bytes[offset + i] = text.charCodeAt(i);
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * BYTES, true); // byte rate
  view.setUint16(32, count * BYTES, true); // block align
  view.setUint16(34, BYTES * 8, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);

  let clipped = 0;
  let peak = 0;
  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < count; channel += 1) {
      const sample = channels[channel][frame];
      const magnitude = sample < 0 ? -sample : sample;
      if (magnitude > peak) peak = magnitude;
      if (magnitude > 1) clipped += 1;
      const value = Math.round(Math.max(-1, Math.min(1, sample)) * FULL_SCALE);
      bytes[offset] = value & 0xff;
      bytes[offset + 1] = (value >> 8) & 0xff;
      bytes[offset + 2] = (value >> 16) & 0xff;
      offset += BYTES;
    }
  }
  return { bytes, clipped, peak };
}

/** Read one back. Deliberately strict: this is used to check what was written, not to import audio. */
export function decodeWav(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (text(0) !== 'RIFF' || text(8) !== 'WAVE') throw new Error('wav: not a RIFF/WAVE file');

  let offset = 12;
  let format;
  let data;
  while (offset + 8 <= bytes.length) {
    const id = text(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      format = {
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (id === 'data') {
      data = { at: body, size };
    }
    offset = body + size + (size % 2);
  }
  if (!format || !data) throw new Error('wav: missing fmt or data chunk');
  if (format.bits !== 24) throw new Error(`wav: expected 24-bit, got ${format.bits}`);

  const frames = data.size / (format.channels * BYTES);
  const channels = Array.from({ length: format.channels }, () => new Float32Array(frames));
  let read = data.at;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < format.channels; channel += 1) {
      const raw = bytes[read] | (bytes[read + 1] << 8) | (bytes[read + 2] << 16);
      // Sign-extend from 24 bits. Without this every negative sample reads as a large positive
      // one and the waveform looks like a solid block.
      channels[channel][frame] = (raw & 0x800000 ? raw - 0x1000000 : raw) / FULL_SCALE;
      read += BYTES;
    }
  }
  return { channels, sampleRate: format.sampleRate, frames };
}
