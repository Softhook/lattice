#!/usr/bin/env node
/**
 * **Look at the twenty-eight seconds, since I cannot hear them.**
 *
 * ```bash
 * node tools/trailer/score-emberwake/analyze.mjs
 * ```
 *
 * Prints the numbers that can falsify a mix — true peak, per-section RMS, the level inside the
 * hole, whether the stems sum to the master, whether the tail is cut off — and writes
 * `score.png`: a waveform over a log-frequency spectrogram with the cut points ruled onto it and a
 * half-second ruler along the bottom — a bright column you cannot locate is a column you cannot
 * act on. Tall white ticks are every five seconds, mid ticks every second.
 *
 * | rule | colour |
 * |---|---|
 * | broadside 0:03, the title card 0:21.5 | white |
 * | the gauntlet 0:08 | grey |
 * | aground 0:10 | pink |
 * | the fuse 0:13 | amber |
 * | **the white flash 0:13.53** | red |
 * | aftermath 0:14.2 | orange |
 * | first light 0:18 | green |
 * | the reveal 0:23.5, the install line 0:25.4 | blue |
 * | every bar line the sequencer plays | dark grey, dotted |
 * | every instant the sequencer stops scheduling | purple |
 *
 * The picture is the point. A number can tell you the mix does not clip; only the picture tells
 * you that the escalation is a solid block of mid-range with no gaps in it, that the hole after the
 * detonation is actually a hole, and that the last chord decays instead of stopping.
 *
 * No dependencies: the FFT and the PNG encoder are both here, and both are about forty lines.
 *
 * Impure: reads and writes files.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeWav } from './wav.mjs';
import { CUES, DURATION_SEC, EVENTS } from './score.mjs';

/**
 * Every instant a one-shot is struck by hand, which the sequencer's grid does not cover: the
 * rubato of the cold open, the reflections, the accelerando into the blast, the card's spread
 * chord. Taken from the score rather than retyped, so the two cannot drift.
 */
const HAND_STRUCK = [...new Set(EVENTS.map((event) => event.at))];

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

const db = (value) => (value > 0 ? 20 * Math.log10(value) : -Infinity);
const show = (value) => (Number.isFinite(value) ? `${value.toFixed(1)} dB` : '  -inf');

/** Peak and RMS of a window, in linear gain. Both channels, because a mix is not one channel. */
function measure(channels, from, to, rate) {
  const start = Math.max(0, Math.round(from * rate));
  const end = Math.min(channels[0].length, Math.round(to * rate));
  let peak = 0;
  let sum = 0;
  let count = 0;
  for (const data of channels) {
    for (let i = start; i < end; i += 1) {
      const value = data[i];
      const magnitude = value < 0 ? -value : value;
      if (magnitude > peak) peak = magnitude;
      sum += value * value;
      count += 1;
    }
  }
  return { peak, rms: count > 0 ? Math.sqrt(sum / count) : 0 };
}

/**
 * Onset times, by spectral-flux-free means: a rise in short-window energy against a slower
 * average. Crude, and enough for the only question being asked of it — *did the transients land
 * where the score says they do* — which a sophisticated onset detector would answer no better.
 */
function onsets(channels, rate) {
  const hop = Math.round(rate * 0.005);
  const frames = Math.floor(channels[0].length / hop);
  const energy = new Float64Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (const data of channels) {
      for (let i = frame * hop; i < (frame + 1) * hop; i += 1) sum += data[i] * data[i];
    }
    energy[frame] = Math.sqrt(sum / (hop * channels.length));
  }
  const found = [];
  let floor = 0;
  let quietFrames = 0;
  for (let frame = 1; frame < frames; frame += 1) {
    floor = floor * 0.94 + energy[frame] * 0.06;
    const jumped = energy[frame] > Math.max(floor * 2.6, 0.02) && energy[frame] > energy[frame - 1] * 1.9;
    if (jumped && quietFrames >= 3) {
      found.push((frame * hop) / rate);
      quietFrames = 0;
    } else {
      quietFrames += 1;
    }
  }
  return found;
}

/** The nearest cue to each onset, so a stray transient shows up as a big number rather than a gap. */
function alignment(found, grid) {
  let worst = 0;
  let worstAt = 0;
  for (const time of found) {
    let best = Infinity;
    for (const cue of grid) best = Math.min(best, Math.abs(time - cue));
    if (best > worst) {
      worst = best;
      worstAt = time;
    }
  }
  return { worst, worstAt };
}

// ---------------------------------------------------------------------------
// A radix-2 FFT, for the picture
// ---------------------------------------------------------------------------

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let length = 2; length <= n; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < n; i += length) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < length / 2; k += 1) {
        const ar = re[i + k];
        const ai = im[i + k];
        const br = re[i + k + length / 2] * cr - im[i + k + length / 2] * ci;
        const bi = re[i + k + length / 2] * ci + im[i + k + length / 2] * cr;
        re[i + k] = ar + br;
        im[i + k] = ai + bi;
        re[i + k + length / 2] = ar - br;
        im[i + k + length / 2] = ai - bi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/**
 * Energy in four bands over a window, by summing FFT magnitudes.
 *
 * Bands rather than a full spectrum because there are only four questions worth asking of a mix
 * this short: is there a floor, is it muddy, is the tune audible, and is there any air.
 */
function bands(channels, from, to, rate) {
  const edges = [20, 100, 300, 2000, 14000];
  const totals = new Float64Array(4);
  const start = Math.round(from * rate);
  const end = Math.min(channels[0].length - FFT_SIZE, Math.round(to * rate));
  const window = new Float64Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i += 1) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE);
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  let windows = 0;
  for (let at = start; at < end; at += FFT_SIZE / 2) {
    for (let i = 0; i < FFT_SIZE; i += 1) {
      re[i] = ((channels[0][at + i] + channels[1][at + i]) * 0.5) * window[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let bin = 1; bin < FFT_SIZE / 2; bin += 1) {
      const hz = (bin * rate) / FFT_SIZE;
      const power = (re[bin] * re[bin] + im[bin] * im[bin]) / ((FFT_SIZE / 4) * (FFT_SIZE / 4));
      for (let band = 0; band < 4; band += 1) {
        if (hz >= edges[band] && hz < edges[band + 1]) totals[band] += power;
      }
    }
    windows += 1;
  }
  return [...totals].map((value) => Math.sqrt(value / Math.max(1, windows)));
}

// ---------------------------------------------------------------------------
// A PNG encoder, so the picture can be opened
// ---------------------------------------------------------------------------

function crc32(bytes) {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), body])), 0);
  return Buffer.concat([head, body, crc]);
}

function png(width, height, rgb) {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0;
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Black through blue and orange to white. Enough contrast that a 40 dB range is readable. */
function heat(unit) {
  const t = Math.max(0, Math.min(1, unit));
  const stops = [
    [0, 8, 18],
    [20, 40, 92],
    [46, 100, 140],
    [214, 128, 60],
    [255, 226, 168],
  ];
  const scaled = t * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const f = scaled - index;
  return [0, 1, 2].map((c) => Math.round(stops[index][c] + (stops[index + 1][c] - stops[index][c]) * f));
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

const WIDTH = 1600;
const WAVE_HEIGHT = 150;
const SPECTRO_HEIGHT = 400;
/** A half-second ruler along the bottom, so a bright column can be *located* and not only seen. */
const RULER_HEIGHT = 16;
const FFT_SIZE = 2048;
/** The picture's frequency range. 40 Hz is under the lowest note; 14 kHz is over the top hat. */
const LOW_HZ = 40;
const HIGH_HZ = 14000;

function picture(channels, rate, file) {
  const height = WAVE_HEIGHT + SPECTRO_HEIGHT + RULER_HEIGHT;
  const rgb = Buffer.alloc(WIDTH * height * 3);
  const set = (x, y, color) => {
    if (x < 0 || x >= WIDTH || y < 0 || y >= height) return;
    const at = (y * WIDTH + x) * 3;
    rgb[at] = color[0];
    rgb[at + 1] = color[1];
    rgb[at + 2] = color[2];
  };

  // --- the waveform -------------------------------------------------------
  const perColumn = channels[0].length / WIDTH;
  for (let x = 0; x < WIDTH; x += 1) {
    let peak = 0;
    for (const data of channels) {
      for (let i = Math.floor(x * perColumn); i < Math.floor((x + 1) * perColumn); i += 1) {
        const magnitude = data[i] < 0 ? -data[i] : data[i];
        if (magnitude > peak) peak = magnitude;
      }
    }
    const half = Math.round((peak / 1) * (WAVE_HEIGHT / 2 - 2));
    for (let y = WAVE_HEIGHT / 2 - half; y <= WAVE_HEIGHT / 2 + half; y += 1) set(x, y, [120, 200, 230]);
  }

  // --- the spectrogram ----------------------------------------------------
  const hop = Math.floor(channels[0].length / WIDTH);
  const window = new Float64Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i += 1) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE);
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  const logLow = Math.log(LOW_HZ);
  const logHigh = Math.log(HIGH_HZ);

  for (let x = 0; x < WIDTH; x += 1) {
    const start = x * hop;
    for (let i = 0; i < FFT_SIZE; i += 1) {
      const at = start + i;
      const value = at < channels[0].length ? (channels[0][at] + channels[1][at]) * 0.5 : 0;
      re[i] = value * window[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let y = 0; y < SPECTRO_HEIGHT; y += 1) {
      // Log frequency, because music is logarithmic and a linear axis spends four fifths of the
      // picture on the top two octaves, where there is nothing but hats.
      const hz = Math.exp(logLow + ((SPECTRO_HEIGHT - 1 - y) / (SPECTRO_HEIGHT - 1)) * (logHigh - logLow));
      const bin = Math.min(FFT_SIZE / 2 - 1, Math.max(1, Math.round((hz * FFT_SIZE) / rate)));
      const magnitude = Math.sqrt(re[bin] * re[bin] + im[bin] * im[bin]) / (FFT_SIZE / 4);
      // −78 dB to −6 dB, which is the range a mix actually lives in.
      set(x, WAVE_HEIGHT + y, heat((db(magnitude) + 78) / 72));
    }
  }

  // --- the cut points, ruled on -------------------------------------------
  const rules = [
    [CUES.broadside, [255, 255, 255]],
    [CUES.gauntlet, [200, 200, 200]],
    [CUES.aground, [255, 140, 200]],
    [CUES.fuse, [255, 190, 90]],
    [CUES.flash, [255, 70, 70]],
    [CUES.aftermath, [255, 150, 70]],
    [CUES.firstLight, [120, 255, 190]],
    [CUES.title, [255, 255, 255]],
    [CUES.reveal, [120, 200, 255]],
    [CUES.install, [90, 150, 200]],
    ...CUES.bars.map((time) => [time, [70, 70, 80]]),
    ...CUES.stops.map((time) => [time, [150, 90, 160]]),
  ];
  for (const [time, color] of rules) {
    const x = Math.round((time / DURATION_SEC) * WIDTH);
    // Solid across the waveform and the ruler, dotted across the spectrogram. A solid line all the
    // way down hides exactly the thing the spectrogram is there to show; a dotted line all the way
    // up is invisible against a waveform.
    for (let y = 0; y < WAVE_HEIGHT; y += 1) set(x, y, color);
    for (let y = WAVE_HEIGHT; y < WAVE_HEIGHT + SPECTRO_HEIGHT; y += 3) set(x, y, color);
    for (let y = WAVE_HEIGHT + SPECTRO_HEIGHT; y < height; y += 1) set(x, y, color);
  }

  // --- the ruler ----------------------------------------------------------
  const base = WAVE_HEIGHT + SPECTRO_HEIGHT;
  for (let x = 0; x < WIDTH; x += 1) set(x, base, [40, 44, 52]);
  for (let half = 0; half <= DURATION_SEC * 2; half += 1) {
    const x = Math.min(WIDTH - 1, Math.round((half / 2 / DURATION_SEC) * WIDTH));
    const five = half % 10 === 0;
    const whole = half % 2 === 0;
    const tall = five ? RULER_HEIGHT - 2 : whole ? 8 : 4;
    const shade = five ? [225, 230, 238] : whole ? [130, 138, 150] : [70, 76, 86];
    for (let y = base + 1; y < base + 1 + tall; y += 1) set(x, y, shade);
  }

  writeFileSync(file, png(WIDTH, height, rgb));
}

function main() {
  const master = join(HERE, 'score.wav');
  if (!existsSync(master)) {
    console.error('analyze: no score.wav. Run `node tools/trailer/score/render.mjs` first.');
    process.exit(2);
  }
  const { channels, sampleRate, frames } = decodeWav(readFileSync(master));

  console.log(`score.wav  ${(frames / sampleRate).toFixed(3)} s  ${sampleRate} Hz  ${channels.length} ch`);

  const whole = measure(channels, 0, DURATION_SEC, sampleRate);
  console.log(`peak ${show(db(whole.peak))}   rms ${show(db(whole.rms))}`);

  const sections = [
    ['cold open    0.0-3.0', 0, 3],
    ['broadside    3.0-8.0', 3, 8],
    ['gauntlet     8.0-10.0', 8, 10],
    ['  aground   10.0-10.5', 10, 10.5],
    ['  recovery  10.5-13.0', 10.5, 13],
    ['the fuse    13.0-13.44', 13, 13.4375],
    ['  the gap  13.44-13.53', 13.4375, 13.53],
    ['THE FLASH  13.53-13.93', 13.53, 13.93],
    ['blind      13.60-14.20', 13.6, 14.2],
    ['aftermath   14.2-18.0', 14.2, 18],
    ['first light 18.0-21.5', 18, 21.5],
    ['title card 21.5-23.5', 21.5, 23.5],
    ['end card   23.5-28.02', 23.5, 28.02],
    ['last 20 ms', DURATION_SEC - 0.02, DURATION_SEC],
  ];
  console.log('');
  for (const [name, from, to] of sections) {
    const band = measure(channels, from, to, sampleRate);
    console.log(`  ${name.padEnd(22)} peak ${show(db(band.peak)).padStart(8)}   rms ${show(db(band.rms)).padStart(8)}`);
  }

  // --- the arc, one second at a time --------------------------------------
  // A passage that builds has to build in *energy* and not only in layer count, and a bar chart of
  // RMS a second at a time is the only honest way to see whether it does — or whether, as this one
  // did on its first render, the busiest stretch is a decibel quieter than the bar before it.
  console.log('');
  for (let second = 0; second < DURATION_SEC; second += 1) {
    const band = measure(channels, second, second + 1, sampleRate);
    const level = db(band.rms);
    const bars = Math.max(0, Math.round((level + 52) / 1.1));
    console.log(`  ${String(second).padStart(2)}s ${show(level).padStart(8)} ${'#'.repeat(bars)}`);
  }

  // --- where the energy sits, per section ---------------------------------
  // Four bands, because the failure this catches is not a level, it is a shape: a mix whose sub
  // is louder than its mid reads as boom on a laptop and as nothing on a phone.
  console.log('');
  console.log(`  ${'band energy, dB'.padEnd(22)} ${'20–100'.padStart(8)} ${'100–300'.padStart(8)} ${'300–2k'.padStart(8)} ${'2k–14k'.padStart(8)}`);
  for (const [name, from, to] of sections.filter((entry) => !entry[0].startsWith('  ') && !entry[0].startsWith('last'))) {
    const split = bands(channels, from, to, sampleRate);
    console.log(`  ${name.padEnd(22)} ${split.map((value) => show(db(value)).padStart(8)).join(' ')}`);
  }

  // Every landmark the edit will cut on, plus every sixteenth the sequencer plays on and every
  // instant a hand strikes something. An onset far from all of these is a note in the wrong place.
  const grid = [
    ...CUES.grid,
    ...HAND_STRUCK,
    CUES.open,
    CUES.broadside,
    CUES.gauntlet,
    CUES.aground,
    CUES.fuse,
    CUES.flash,
    CUES.aftermath,
    CUES.firstLight,
    CUES.title,
    CUES.reveal,
    CUES.install,
  ];
  // --- did something land ON each cut point? ------------------------------
  // The one question a trailer score has to answer and the section table cannot: an edit cuts on
  // an instant, and if the music arrives 40 ms after the picture the whole thing feels loose.
  // 60 ms after the cut against the 200 ms before it — a landing is a big positive number.
  console.log('');
  const landings = [
    ['broadside', CUES.broadside],
    ['the gauntlet', CUES.gauntlet],
    ['aground', CUES.aground],
    ['the fuse', CUES.fuse],
    ['THE FLASH', CUES.flash],
    ['first light', CUES.firstLight],
    ['the title card', CUES.title],
    ['the reveal', CUES.reveal],
    ['the install line', CUES.install],
  ];
  for (const [name, time] of landings) {
    const after = measure(channels, time, time + 0.06, sampleRate);
    // 120 ms up to the cut itself, not 200 ms up to 40 ms before it. The wider window swallowed
    // the last note of the run into the blast and reported the biggest event in the piece as a
    // 6.7 dB step, which is a measurement of the run and not of the impact.
    const before = measure(channels, time - 0.12, time - 0.004, sampleRate);
    const step = db(after.peak) - db(before.peak);
    console.log(
      `  ${name.padEnd(14)} ${time.toFixed(3)} s   peak ${show(db(after.peak)).padStart(8)}   ` +
        `${step >= 0 ? '+' : ''}${step.toFixed(1)} dB over the 120 ms before it`,
    );
  }

  // --- the two things the locked cut makes non-negotiable -----------------
  // The flash is a single frame of full-frame white and the impact belongs *on* it. A score that
  // is 30 ms early there is a score that is two frames early, which is visible.
  const flashWindow = measure(channels, CUES.flash, CUES.flash + 1 / 60, sampleRate);
  const flashRunUp = measure(channels, CUES.flash - 1 / 60, CUES.flash, sampleRate);
  console.log('');
  console.log(
    `  the flash at ${CUES.flash.toFixed(3)} s: the frame it lands on peaks at ${show(db(flashWindow.peak))}, ` +
      `the frame before it at ${show(db(flashRunUp.peak))} — a ${(db(flashWindow.peak) - db(flashRunUp.peak)).toFixed(1)} dB step across one frame`,
  );
  // And nothing may be struck while the frame is still washed out.
  const blind = measure(channels, CUES.blind[0], CUES.blind[1], sampleRate);
  const before = measure(channels, 12.5, 13, sampleRate);
  // Two numbers, because one is misleading. The window's RMS is dominated by its first fifty
  // milliseconds — the blast is still ending — and reads as "quieter", where what the picture
  // needs is "emptying". The last hundred milliseconds is where the hole actually is.
  const blindTail = measure(channels, CUES.blind[1] - 0.1, CUES.blind[1], sampleRate);
  console.log(
    `  blind ${CUES.blind[0].toFixed(2)}-${CUES.blind[1].toFixed(2)} s: rms ${show(db(blind.rms))} over the whole window ` +
      `(${(db(blind.rms) - db(before.rms)).toFixed(1)} dB under the half second before the fuse), ` +
      `${show(db(blindTail.rms))} across its last 100 ms`,
  );

  const found = onsets(channels, sampleRate);
  const drift = alignment(found, grid);
  console.log('');
  console.log(`  ${found.length} onsets detected; furthest from the sixteenth-note grid: ${(drift.worst * 1000).toFixed(1)} ms at ${drift.worstAt.toFixed(3)} s`);

  // --- clicks -------------------------------------------------------------
  // A single sample far above its neighbours is not music; it is an envelope that arrived one
  // sample late. This is here permanently because the defect that produced it fires on about one
  // start time in ten and is invisible to every other reading in this file.
  const clicks = [];
  const NEAR = 16;
  for (const [channel, data] of channels.entries()) {
    for (let i = NEAR; i < frames - NEAR; i += 1) {
      if (Math.abs(data[i]) <= 0.02) continue;
      // The neighbourhood is a *window* and not four samples, which the previous version of this
      // check got wrong and reported me a false positive for. A hi-hat band-passed at 7.5–13.5 kHz
      // has a period of about four samples at 48 kHz, so the samples two and three away from a
      // peak land on its zero crossings — measured 0.066 against 0.002, a ratio of 32, in the
      // middle of an ordinary and perfectly clean noise burst. Sixteen samples either side always
      // contain a full cycle of anything below Nyquist, so a genuine lone impulse is the only
      // thing that can still score.
      let near = 0;
      for (let k = 2; k <= NEAR; k += 1) {
        near = Math.max(near, Math.abs(data[i - k]), Math.abs(data[i + k]));
      }
      if (Math.abs(data[i]) > near * 25) {
        clicks.push(`${(i / sampleRate).toFixed(5)} s ch${channel} ${data[i].toFixed(4)} vs ${near.toFixed(4)}`);
      }
    }
  }
  console.log(`  single-sample impulses above the neighbourhood: ${clicks.length === 0 ? 'none' : clicks.join(', ')}`);

  // --- do the stems sum to the master? ------------------------------------
  const stemFiles = ['stem-pulse', 'stem-melody', 'stem-floor'].map((name) => join(HERE, `${name}.wav`));
  if (stemFiles.every((file) => existsSync(file))) {
    const stems = stemFiles.map((file) => decodeWav(readFileSync(file)));
    let worst = 0;
    for (let channel = 0; channel < 2; channel += 1) {
      for (let i = 0; i < frames; i += 1) {
        let sum = 0;
        for (const stem of stems) sum += stem.channels[channel][i];
        worst = Math.max(worst, Math.abs(sum - channels[channel][i]));
      }
    }
    console.log(`  stems sum to the master to within ${show(db(worst))}`);
  }

  picture(channels, sampleRate, join(HERE, 'score.png'));
  console.log(`\n  wrote ${join(HERE, 'score.png')}`);
}

main();
