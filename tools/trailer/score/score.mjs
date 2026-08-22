/**
 * **"The grid underneath" — twenty seconds of music for the Lattice launch trailer.**
 *
 * Every sample here is synthesized by `@latticekit/audio`. There is no sample file, no loop, no
 * external instrument and no second runtime dependency: a trailer that claims zero assets and
 * is scored with a stock music download is an advertisement that contradicts itself in its own
 * soundtrack.
 *
 * ## The cut, and what the music does under it
 *
 * | time | shot | music |
 * |---|---|---|
 * | 0:00–0:03 | a valley at dusk, lamps coming on | one low struck root, a breath of air, and a four-note motif that hangs unresolved |
 * | 0:03–0:10 | six cuts in seven seconds | a pulse that gains a layer on every bar line, so the edit has a grid to cut against |
 * | 0:10 | hard cut to black | one impact, then a hole. Nothing but the air it left behind |
 * | 0:10–0:18 | a sentence types out, then plays. Three times, accelerating | the machine spells the motif back one note longer each time, in the major |
 * | 0:18–0:20 | the end card | the motif completes on a struck C major chord, and rings out under it |
 *
 * ## The decisions worth arguing with
 *
 * **One key, A natural minor / C major, and no modulation.** Twenty seconds is not long enough
 * to leave a key and be understood coming back. The whole turn at 0:10 is a rotation inside one
 * scale — the same seven notes, heard from A at the start and from C at the end. Nothing else
 * changes, which is why the ending reads as *brighter* rather than as *different*.
 *
 * **Struck and plucked, never sustained.** Bells, plucks and one drum. A synthesized pad is what
 * makes procedural audio sound like a screensaver, and — the practical reason — a pad smears
 * across a hard cut, where a bell simply stops being struck and its tail is a decision the edit
 * can make. The only sustained thing in twenty seconds is 1.6 s of filtered noise under the
 * opening, and it has an attack and a decay: it is a gesture, not a bed.
 *
 * **The harmony is implied and almost never stated.** The sequencer transposes a whole track by
 * the bar's root, so any interval it plays must be consonant with every chord in the loop:
 * roots, fifths and octaves only. The thirds — the notes that decide major from minor — are
 * struck by hand as one-shot bells, which is also the only way to write the 4–3 suspension the
 * last second of the piece is built on.
 *
 * **The motif is stated unresolved and finished on the card.** `A C E D` in the opening hangs on
 * the fourth. `C E G F` at 0:17 hangs on the same degree in the major, and the F falls to E
 * inside the chord that lands on the end card. That is the "something recognizable arrives" the
 * brief asks for; there is nothing else in here to recognize.
 *
 * @see render.mjs for how this is turned into a WAV. Impure only there — this module reads no
 *   clock and no global, and the same seed produces the same twenty seconds every time.
 */

import { createAudio, createDeck, validateSong, validateSounds, LOOKAHEAD_SEC, SEMITONE } from '@latticekit/audio';

// ---------------------------------------------------------------------------
// The timings, which are the brief's and not negotiable
// ---------------------------------------------------------------------------

/** Total length of the render. The trailer is twenty seconds and the file is twenty seconds. */
export const DURATION_SEC = 20;

/** 120 bpm, so a bar is exactly 2 s and every landmark below falls on the grid. */
const BPM = 120;
const BEAT_SEC = 60 / BPM;
const BAR_SEC = BEAT_SEC * 4;

/** Establish. Sparse and warm; this is the shot that has to buy the next seventeen seconds. */
const T_ESTABLISH = 0;
/** The pulse enters half a bar *before* the first montage cut. Music leads picture; it always has. */
const T_PULSE_IN = 2;
/** The montage's first cut. Four bars from here to the turn, so the turn is a downbeat. */
const T_MONTAGE = 3;
/** The hard cut to black. Everything scheduled stops before this instant; one impact lands on it. */
const T_CUT = 10;
/** The hole. Near-silence, deliberately longer than feels comfortable while writing it. */
const T_HOLE_END = 11;
/** Three type-then-play cycles, each shorter than the last. */
const T_CYCLE = [11, 13.5, 15.5];
/** Where each cycle stops typing and the thing it typed starts playing. */
const T_PLAY = [12.25, 14.375, 16];
/** The final phrase: the motif on bells, accelerating into the card. */
const T_LIFT = 17;
/** The end card. The chord lands *on* it rather than after it, and is not faded under it. */
const T_LAND = 18;

/** Where the sequencer runs. Both windows are whole bars and both end on a landmark. */
const DECK_BUILD = { from: T_PULSE_IN, to: T_CUT };
const DECK_RESOLVE = { from: 12, to: T_LAND };

// ---------------------------------------------------------------------------
// Pitch. One key, walked a semitone at a time
// ---------------------------------------------------------------------------

/** A2, the piece's floor for anything with a pitch. Below this a laptop speaker reproduces nothing. */
const A2_HZ = 110;

/** Semitones from A, per letter. The key has no accidentals, so there is no need to parse one. */
const PITCH_CLASS = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };

/**
 * The frequency of a named note, by repeated multiplication rather than by `pow`.
 *
 * `SEMITONE` is exported by the package as a literal for exactly this reason: `Math.pow` is Tier
 * B, not required by ECMA-262 to be correctly rounded, and two renders that disagree in the last
 * bit are two renders whose hashes disagree — which would make the determinism check below
 * meaningless the first time it ran on someone else's machine.
 */
function hz(name) {
  const letter = name[0];
  const octave = Number(name.slice(1));
  const semis = (octave - 2) * 12 + PITCH_CLASS[letter];
  let f = A2_HZ;
  for (let i = 0; i < semis; i += 1) f *= SEMITONE;
  for (let i = 0; i > semis; i -= 1) f /= SEMITONE;
  return f;
}

// ---------------------------------------------------------------------------
// The instruments — four timbres, and every pitch of each as its own sound id
// ---------------------------------------------------------------------------

/**
 * A struck bell: fundamental, octave, twelfth, seventeenth, and a hammer.
 *
 * The four tuned partials are exact small-integer ratios, so the timbre is built with `*` and
 * only the *interval* between notes is Tier B. The noise layer is 45 ms long and inaudible on
 * its own; take it out and the sound stops being struck and starts being a sine that faded in.
 * It is the single cheapest thing in this file and it does the most work.
 */
function bell(f) {
  return {
    bus: 'sfx',
    minGapMs: 70,
    layers: [
      { wave: 'sine', hz: f, gain: 0.15, hold: 2.9, cutoff: 2600 },
      { wave: 'sine', hz: f * 2, gain: 0.072, hold: 1.25, cutoff: 5200, delay: 0.004 },
      // The twelfth is a triangle and its low-pass sits at 9 kHz, which is where all of this
      // score's air comes from: two sines and a hammer measured 30 dB down in the top octave and
      // read as a muffled kick drum with tinkling over it.
      { wave: 'triangle', hz: f * 3, gain: 0.032, hold: 0.45, cutoff: 9000 },
      { wave: 'noise', hz: 0, gain: 0.042, hold: 0.045, highpass: 2600, cutoff: 11000 },
      // The fifth partial, gone in a tenth of a second. A real bell's upper partials die first,
      // and without one the top octave of this mix measured 28 dB under the mids: dull, in the
      // specific way that reads as synthetic rather than as quiet.
      { wave: 'sine', hz: f * 5, gain: 0.024, hold: 0.14 },
    ],
  };
}

/**
 * The reflection of a bell off a wall that does not exist.
 *
 * `@latticekit/audio` has no reverb and cannot have one: a convolver needs an impulse response,
 * which is an audio file, and an algorithmic reverb needs feedback delay lines, which the fixed
 * `source → filter → envelope → pan → bus` chain refuses on purpose — the moment routing is
 * author-defined the clipping ceiling stops being provable.
 *
 * So the space is written into the score instead: every exposed note is struck twice more, 90 ms
 * and 210 ms later, quieter, darker, softer-edged and thrown to the other side of the stereo
 * field. That is what a small hall does to a struck note, and the reason it is only applied where
 * the texture is sparse — the opening, the three phrases, the ending — is that in the montage the
 * sequencer is already filling the same 200 ms and the reflections would only be mud.
 */
function ghost(f) {
  return {
    bus: 'sfx',
    minGapMs: 60,
    layers: [
      { wave: 'sine', hz: f, gain: 0.15, hold: 1.9, attack: 0.02, cutoff: 1400 },
      { wave: 'sine', hz: f * 2, gain: 0.055, hold: 0.7, attack: 0.03, cutoff: 2600 },
    ],
  };
}

/**
 * A plucked, brighter, much shorter relative of the bell — a celesta rather than a church.
 *
 * The montage and the three type-then-play cycles are written on this and not on {@link bell}
 * for one reason: a 2.9 s tail struck every quarter of a second is a chord by accident. Half a
 * second of decay is the longest a note can ring at this tempo and still leave the next one room.
 */
function spark(f) {
  return {
    bus: 'sfx',
    minGapMs: 55,
    layers: [
      { wave: 'triangle', hz: f, gain: 0.145, hold: 0.5, cutoff: 4600 },
      { wave: 'sine', hz: f * 2, gain: 0.052, hold: 0.22, cutoff: 6400 },
      { wave: 'noise', hz: 0, gain: 0.035, hold: 0.022, highpass: 3200, cutoff: 11000 },
    ],
  };
}

/** The floor: a struck low root with one octave over it, filtered down to a thud with a pitch. */
function low(f) {
  return {
    bus: 'sfx',
    minGapMs: 200,
    layers: [
      { wave: 'sine', hz: f, gain: 0.125, hold: 2.4, cutoff: 380 },
      { wave: 'triangle', hz: f * 2, gain: 0.048, hold: 0.85, cutoff: 620 },
    ],
  };
}

/**
 * A typewriter key that happens to be in the key. Five of them, ascending, cycled by the sentence.
 *
 * `spatial` is set by hand because these are on the `ui` bus, where it defaults to **off** — and
 * with it off `PlayOptions.pan` is silently ignored rather than refused. Left alone, the
 * alternating left/right of a sentence being typed simply does not happen and nothing says why.
 */
function tick(f) {
  return {
    bus: 'ui',
    minGapMs: 20,
    spatial: true,
    layers: [
      // Peak-hot on purpose. A 14 ms click at the same peak as a bell is heard as far quieter
      // than the bell, because loudness integrates over about 100 ms and a click does not last
      // that long. Mixed by RMS these vanish; mixed by peak they are a typewriter.
      { wave: 'noise', hz: 0, gain: 0.115, hold: 0.014, highpass: 2600, cutoff: 9500 },
      { wave: 'triangle', hz: f, gain: 0.1, hold: 0.05, cutoff: 5000 },
    ],
  };
}

/** Which pitches exist, per timbre. Every id below is generated from these and nothing else. */
const BELL_NOTES = ['A3', 'C4', 'G4', 'A4', 'C5', 'D5', 'E5', 'F5', 'G5', 'C6'];
const SPARK_NOTES = ['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6', 'D6', 'E6'];
const LOW_NOTES = ['A1', 'C2'];
const TICK_NOTES = ['E5', 'G5', 'A5', 'C6', 'D6'];

/**
 * The whole table: forty-two rows, of which thirty-eight are one pitch of one instrument.
 *
 * It has to be this way and it is the package's sharpest edge. `minGapMs` is keyed on the sound
 * **id**, so a chord spelled as six plays of one recipe at six detunes is six plays of the same
 * sound in the same instant, and five of them are thrown away. A chord must therefore be *n*
 * different ids. That is right for a COLLECT ALL button and wrong for music, and there is no
 * way to tell the package which one you meant.
 */
function table() {
  const out = {};
  for (const note of BELL_NOTES) out[`bell${note}`] = bell(hz(note));
  for (const note of BELL_NOTES) out[`ghost${note}`] = ghost(hz(note));
  for (const note of SPARK_NOTES) out[`spark${note}`] = spark(hz(note));
  for (const note of LOW_NOTES) out[`low${note}`] = low(hz(note));
  TICK_NOTES.forEach((note, index) => {
    out[`tick${index}`] = tick(hz(note));
  });

  /**
   * The cut to black, at 0:10. A sub falling an octave, a body of filtered noise, and a low
   * triangle a beat behind it so the impact has a pitch and is not just a bang.
   *
   * The loudest event in the piece by a factor of two, which is correct: it is the only moment
   * the trailer stops rather than moves.
   */
  out.impact = {
    bus: 'sfx',
    minGapMs: 500,
    layers: [
      // Short, and shorter than it wants to be. A 1.5 s sub tail measured the hole at 2 dB below
      // the montage it was supposed to be the opposite of: the impact was filling the silence it
      // had just made.
      { wave: 'sine', hz: 82.4, toHz: 41.2, gain: 0.2, hold: 0.7, cutoff: 300 },
      { wave: 'noise', hz: 0, gain: 0.085, hold: 0.32, highpass: 110, cutoff: 1100 },
      { wave: 'triangle', hz: 110, gain: 0.05, hold: 0.55, cutoff: 700, delay: 0.012 },
    ],
  };

  /**
   * Air. Sixteen hundred milliseconds of band-passed noise with a slow attack.
   *
   * Used twice: under the first second, where it is the difference between a valley and a black
   * rectangle, and inside the hole at 0:10, where it is the difference between a held breath and
   * a dropped file. It has an attack and a decay and it is never re-triggered — the moment this
   * loops it is a pad, and a pad is what this score is written to avoid.
   */
  out.air = {
    bus: 'sfx',
    minGapMs: 800,
    layers: [
      { wave: 'noise', hz: 0, gain: 0.03, hold: 1.6, attack: 0.45, highpass: 320, cutoff: 1500 },
      { wave: 'noise', hz: 0, gain: 0.019, hold: 1.2, attack: 0.7, highpass: 1800, cutoff: 5200, pan: 0.4 },
    ],
  };

  return out;
}

export const SOUNDS = table();

// ---------------------------------------------------------------------------
// The sequencer's two songs — the pulse, and nothing else
// ---------------------------------------------------------------------------

/**
 * A kick, out of one oscillator: a sine at 118 Hz swept to a third of that in a tenth of a
 * second. There is no other way to get a drum out of a table of ten numbers, and a sample would
 * mean shipping a binary for the sake of one thud.
 */
const KICK = { wave: 'sine', gain: 0.15, hold: 0.1, cutoff: 420, sweepTo: 0.34, fixedHz: 118 };

/**
 * Every track of both songs. `bright` lifts the plucked parts an octave for the resolve.
 *
 * `bars` is per song because the two songs are different lengths — a bar index the progression
 * does not have is a part that is silent forever, and `validateSong` is the only thing that says
 * so.
 */
function tracks(bright, chimeBars) {
  // Two octaves up, in both songs. At the written register the arpeggio's low notes landed at
  // 131–262 Hz over the C bar, which measured as the loudest band in the montage: boxy, and
  // masking the melody rather than driving under it. `bright` is left to move the filter alone.
  const octave = 12;
  return [
    { id: 'kick', voice: KICK, notes: [{ step: 0 }, { step: 8 }] },
    {
      id: 'kick2',
      voice: KICK,
      notes: [{ step: 4 }, { step: 12 }],
      minIntensity: 0.35,
    },
    {
      // The beater. A sequencer track is *one* voice with no layers, so a drum that needs a body
      // and an attack has to be spelled as two tracks on the same steps — there is no other way
      // to put a click on a kick, and the two can drift apart the moment one of them is muted.
      id: 'beat',
      voice: { wave: 'noise', gain: 0.035, hold: 0.012, highpass: 900, cutoff: 4200 },
      notes: [{ step: 0 }, { step: 4 }, { step: 8 }, { step: 12 }],
    },
    {
      id: 'bass',
      voice: { wave: 'triangle', gain: 0.072, hold: 0.55, cutoff: 320 },
      notes: [{ step: 0 }, { step: 8, semis: 12 }],
    },
    {
      id: 'pluck',
      voice: { wave: 'triangle', gain: 0.1, hold: 0.17, cutoff: bright ? 5600 : 3400 },
      // Roots, fifths and octaves only: the sequencer transposes the whole track by the bar's
      // root, so a third here would be major over one chord of the loop and wrong over the next.
      notes: [
        { step: 2, semis: 12 + octave },
        { step: 5, semis: 19 + octave },
        { step: 6, semis: 24 + octave },
        { step: 9, semis: 19 + octave },
        { step: 11, semis: 12 + octave },
        { step: 13, semis: 19 + octave },
        { step: 14, semis: 24 + octave },
      ],
      melodic: true,
      minIntensity: 0.3,
      drop: 0.14,
    },
    {
      id: 'hat',
      voice: { wave: 'noise', gain: 0.07, hold: 0.028, highpass: 7000, cutoff: 13000 },
      notes: [{ step: 2 }, { step: 6 }, { step: 10 }, { step: 14 }],
      minIntensity: 0.55,
    },
    {
      id: 'hat2',
      voice: { wave: 'noise', gain: 0.052, hold: 0.02, highpass: 8000, cutoff: 14000 },
      notes: [{ step: 0 }, { step: 4 }, { step: 8 }, { step: 12 }],
      minIntensity: 0.8,
    },
    {
      id: 'chime',
      // The one place the sequencer speaks above the bass: a struck double octave on the
      // downbeat of every other bar, so the loop stops announcing where it begins.
      voice: { wave: 'triangle', gain: 0.105, hold: 0.65, cutoff: 4800 },
      notes: [{ step: 0, semis: 24 + octave }],
      bars: chimeBars,
      minIntensity: 0.5,
    },
  ];
}

/**
 * The montage. Am – F – C – G, one bar each, which is the whole seven seconds.
 *
 * The rotation matters more than the chords: this same loop started on its third bar is C – G –
 * Am – F and reads bright. Started here, on the minor, it reads as unfinished — which is what a
 * montage that is going somewhere needs to sound like.
 */
export const SONG_BUILD = {
  bpm: BPM,
  steps: 16,
  rootHz: A2_HZ,
  progression: [0, -4, -9, -2],
  seed: 7,
  tracks: tracks(false, [1, 3]),
};

/** The resolve. C – F – G, and the fourth bar is the end card, played by hand. */
export const SONG_RESOLVE = {
  bpm: BPM,
  steps: 16,
  rootHz: A2_HZ,
  progression: [-9, -4, -2],
  seed: 11,
  tracks: tracks(true, [1]),
};

/**
 * How busy the sequencer is, at a given moment. A staircase, not a ramp.
 *
 * `Track.minIntensity` is a threshold rather than a fade, so what this actually schedules is one
 * more layer arriving per bar: kick and bass, then the pluck and the backbeat, then the hats and
 * the chime, then everything. Four steps, four bars, six cuts to cover.
 */
function intensityAt(seconds) {
  // Every step is a bar line. The earliest one that can be placed at all is `2.0 + LOOKAHEAD_SEC`
  // — the deck's first pump schedules a bar and a half in one go at whatever intensity is set
  // then — which is why the montage's first layer change is at 4 s and not at 3 s.
  if (seconds < 4) return 0.2;
  if (seconds < 6) return 0.4;
  if (seconds < 8) return 0.6;
  if (seconds < T_CUT) return 0.9;
  if (seconds < 14) return 0.25;
  if (seconds < 16) return 0.45;
  if (seconds < T_LIFT) return 0.7;
  return 1;
}

// ---------------------------------------------------------------------------
// The one-shots, in time order
// ---------------------------------------------------------------------------

/**
 * Which stem an event belongs to, so the edit can drop a layer without a re-render.
 *
 * `pulse` is the sequencer, `melody` is everything with a tune in it, `floor` is the three
 * events that carry weight — the opening root, the impact, and the chord under the card.
 */
export const STEMS = ['pulse', 'melody', 'floor'];

/**
 * The rate this score is rendered at. It has to be a constant here, and that is a bug's fault.
 *
 * See {@link onSampleGrid}. Nothing about the *music* depends on the sample rate; the workaround
 * immediately below it does, and there is no honest way to hide that.
 */
const RENDER_RATE = 48000;

/** The largest double strictly below `value`, for positive finite values. */
function nextDown(value) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  view.setBigUint64(0, view.getBigUint64(0) - 1n);
  return view.getFloat64(0);
}

/**
 * Move a start time a hair below its sample boundary, to stop the voice clicking.
 *
 * **This is a workaround for a defect in `@latticekit/audio`'s renderer, not a musical decision.**
 * `render.ts` builds a voice as `createGain()` — whose `gain` defaults to **1** — and then writes
 * `gain.setValueAtTime(0, start)` as the first point of the envelope. When `start × sampleRate`
 * lands a float hair *above* an integer, the browser resolves the source's first frame and the
 * automation's first frame to different samples, and exactly one sample of the source is
 * multiplied by that default 1 instead of by 0.
 *
 * For an oscillator that is harmless, because a sine at phase zero is zero. For a `noise` layer
 * it is one sample at **full scale**: measured at 0.72 unfiltered, 0.18 through the bell's
 * band-pass, against neighbouring samples of 0.005. It is a click, it is reproducible, and it
 * fires on roughly one start time in ten — which is exactly the shape of bug that gets reported
 * as "there's a crackle sometimes" and never reproduced.
 *
 * The fix belongs in the package and is one line: `gain.gain.value = 0` before the automation,
 * so the default the leak exposes is silence rather than unity. Until then, this nudges the time
 * down by one ULP until the two roundings agree — about 20 nanoseconds, and inaudible.
 *
 * The sequencer's notes are safe at this tempo by luck rather than by design: 120 bpm at 16
 * steps is a step of 0.125 s, which is exact in binary, so `startedAt + step × stepSec` is exact
 * too. At 130 bpm it would not be, and the deck offers no way to reach its note times at all.
 */
function onSampleGrid(seconds) {
  const frame = Math.round(seconds * RENDER_RATE);
  let time = frame / RENDER_RATE;
  for (let guard = 0; guard < 8 && Math.ceil(time * RENDER_RATE) > frame; guard += 1) time = nextDown(time);
  return time;
}

/** One struck note: when, which id, how hard, and where in the stereo field. */
function at(time, id, gain, pan, stem) {
  return { at: onSampleGrid(time), id, gain, pan, stem };
}

/** How long after a note its two reflections arrive, and how much of it survives the trip. */
const REFLECTIONS = [
  { delay: 0.09, gain: 0.34, pan: -1.15 },
  { delay: 0.21, gain: 0.17, pan: 0.55 },
];

/** A note and its reflections. `note` is a name, so the same call works for a bell or a spark. */
function struck(out, time, id, note, gain, pan) {
  out.push(at(time, `${id}${note}`, gain, pan, 'melody'));
  for (const reflection of REFLECTIONS) {
    const thrown = Math.max(-0.55, Math.min(0.55, pan * reflection.pan + (pan === 0 ? reflection.pan * 0.2 : 0)));
    out.push(at(time + reflection.delay, `ghost${note}`, gain * reflection.gain, thrown, 'melody'));
  }
}

/**
 * The four notes of the motif, and the accelerando the last statement of it is played with.
 *
 * Both are in one place because they are one idea: `A C E D` heard slowly at 0:00 and `C E G F`
 * heard three times as fast at 0:17 are the same shape, and if they drift apart the ending stops
 * being a payoff and becomes a different tune.
 */
const MOTIF_MINOR = ['A4', 'C5', 'E5', 'D5'];
const MOTIF_MAJOR = ['C5', 'E5', 'G5', 'F5'];

function events() {
  const out = [];

  // --- 0:00 establish -----------------------------------------------------
  // One low root, the air of the place, and a bell low enough to be a room rather than a note.
  out.push(at(T_ESTABLISH, 'lowA1', 0.6, 0, 'floor'));
  // `pan: undefined`, so the recipe's own layer pan survives: passing a number here would
  // override it and collapse the two noise layers onto each other.
  out.push(at(T_ESTABLISH, 'air', 0.7, undefined, 'floor'));
  struck(out, T_ESTABLISH + 0.02, 'bell', 'A3', 0.42, -0.28);

  // The motif, played by a hand rather than a grid: the gaps shorten — 0.45, 0.45, 0.45 — and
  // the last note lands exactly on the downbeat the pulse enters on. Rubato into tempo.
  const opening = [0.65, 1.1, 1.55, T_PULSE_IN];
  MOTIF_MINOR.forEach((note, index) => {
    struck(out, opening[index], 'bell', note, index === 3 ? 0.7 : 0.55, [-0.12, 0.16, -0.2, 0.06][index]);
  });

  // --- 0:03 the montage ---------------------------------------------------
  // One bell per bar, on the chord tone the sequencer cannot play: the third. Then a run of
  // sixteenths accelerating into the cut, all of it inside the pentatonic so nothing snags.
  // The gains climb from 0.55 to 1.0 across the seven seconds. The sequencer has no way to make
  // a crescendo — `intensity` gates whole tracks on and off and there is no per-track gain — so
  // every decibel of this build is in this column.
  // The first cut gets the root struck under it. Without it the montage starts 6 dB below the
  // shot before it, which reads as the music backing off at the exact moment the picture speeds
  // up — measured, not guessed.
  out.push(at(T_MONTAGE, 'lowA1', 0.46, 0, 'floor'));
  const line = [
    [T_MONTAGE, 'E5', 0.62, -0.18],
    [4, 'A5', 0.62, 0.22],
    [5, 'F5', 0.6, -0.1],
    [6, 'G5', 0.7, 0.16],
    [6.5, 'E5', 0.58, -0.22],
    [7, 'C6', 0.72, 0.1],
    [8, 'D5', 0.78, -0.16],
    [8.5, 'B5', 0.7, 0.24],
    [9, 'G5', 0.86, -0.08],
    [9.25, 'E5', 0.72, 0.18],
    [9.5, 'A5', 0.84, -0.14],
    [9.625, 'C6', 0.88, 0.1],
    [9.75, 'D6', 0.94, -0.1],
    [9.875, 'E6', 1, 0.08],
  ];
  for (const [time, note, gain, pan] of line) out.push(at(time, `spark${note}`, gain, pan, 'melody'));

  // --- 0:10 the turn ------------------------------------------------------
  // The impact lands on the cut, not before it. Then nothing for a second except the air the
  // impact displaced — which is the only reason the hole reads as a held breath rather than as a
  // file that stopped.
  out.push(at(T_CUT, 'impact', 1, 0, 'floor'));
  out.push(at(T_CUT + 0.18, 'air', 0.75, undefined, 'floor'));

  // --- 0:11 three cycles, accelerating ------------------------------------
  // Each cycle types faster and plays one note more of the motif in the major. The third
  // completes it — which is the first time in the piece the tune has an ending.
  const typing = [
    { from: T_CYCLE[0], to: T_PLAY[0], gap: 0.125 },
    { from: T_CYCLE[1], to: T_PLAY[1], gap: 0.0625 },
    { from: T_CYCLE[2], to: T_PLAY[2], gap: 0.03125 },
  ];
  typing.forEach((phase, cycle) => {
    let index = 0;
    for (let time = phase.from; time < phase.to - 1e-9; time += phase.gap) {
      // The keys walk up a pentatonic, so a sentence being typed is a run rather than a rattle,
      // and the run gets higher each cycle — the sound of something getting more confident.
      const key = (index + cycle * 2) % TICK_NOTES.length;
      out.push(at(time, `tick${key}`, 0.62 + cycle * 0.19, index % 2 === 0 ? -0.3 : 0.3, 'melody'));
      index += 1;
    }
  });

  const spoken = [
    { start: T_PLAY[0], gap: 0.5, notes: 2 },
    { start: T_PLAY[1], gap: 0.375, notes: 3 },
    { start: T_PLAY[2], gap: 0.25, notes: 4 },
  ];
  spoken.forEach((phrase, cycle) => {
    for (let index = 0; index < phrase.notes; index += 1) {
      const note = MOTIF_MAJOR[index];
      struck(out, phrase.start + index * phrase.gap, 'spark', note, 0.6 + cycle * 0.12, index % 2 === 0 ? -0.14 : 0.14);
    }
  });
  // The first cycle gets a floor under it, so the turn from typing to playing has weight the
  // first time as well as the third.
  out.push(at(T_PLAY[0], 'lowC2', 0.55, 0, 'floor'));

  // --- 0:17 the lift ------------------------------------------------------
  // The motif once more, on the warm bell, with the gaps closing: 0.375, 0.3125, 0.1875. The F
  // arrives an eighth before the card and falls to the E inside the chord that lands on it.
  const lift = [T_LIFT, 17.375, 17.6875, 17.875];
  MOTIF_MAJOR.forEach((note, index) => {
    struck(out, lift[index], 'bell', note, 0.66 + index * 0.06, [-0.16, 0.14, -0.1, 0.06][index]);
  });

  // --- 0:18 the end card --------------------------------------------------
  // C major, struck by a hand and not by a grid: eight milliseconds between the notes, low to
  // high, which is what a chord played by one person sounds like and is also worth about a
  // decibel of peak. Nothing is faded under the card: the tail is 2.9 s and the file has 2 s left
  // for it, so the chord is still ringing at −44 dBFS when the picture ends and the truncation is
  // a −57 dBFS step that no ear and no meter in `analyze.mjs` calls a click.
  out.push(at(T_LAND, 'lowC2', 1, 0, 'floor'));
  const chord = [
    ['C4', 0.008, 0.72, -0.1],
    ['G4', 0.018, 0.62, 0.12],
    ['C5', 0.028, 0.78, -0.06],
    ['E5', 0.04, 0.92, 0.04],
    ['G5', 0.052, 0.6, 0.18],
    ['C6', 0.07, 0.52, -0.16],
  ];
  for (const [note, offset, gain, pan] of chord) struck(out, T_LAND + offset, 'bell', note, gain, pan);

  out.sort((a, b) => a.at - b.at);
  return out;
}

export const EVENTS = events();

// ---------------------------------------------------------------------------
// Performing it
// ---------------------------------------------------------------------------

/**
 * The master fader, at the top of its range — and it is not enough.
 *
 * `Mixer.setGain` clamps into `[0, 1]`, `PlayOptions.gain` clamps into `[0, 1]`, and every recipe
 * gain is a fraction chosen so that {@link validateSounds} can prove one *sound* cannot clip. The
 * consequence is that the package has no gain stage anywhere that can be greater than one, so a
 * finished mix arrives wherever the arithmetic left it — here, −6.2 dBFS — and there is nothing
 * inside `@latticekit/audio` that can bring it up to a delivery level.
 *
 * Raising the recipes instead is not the answer: the two validators would then correctly refuse
 * the table, because they model the worst case *within one sound* and *within one step*, and the
 * thing that is actually quiet is the **mix**, which neither of them can see.
 */
export const MASTER_GAIN = 1;

/**
 * The one number in this score that came from a meter rather than from a decision.
 *
 * Applied to the rendered float buffer before it is written, identically to the master and to
 * every stem, so the stems still sum to the master sample for sample. It is a constant and not a
 * normalizer: an adaptive one would make the level a function of the loudest accident in the
 * take, and two renders of two edits of this score would then be at two different levels.
 *
 * 0.4887 measured × 1.823 = 0.891, which is −1.0 dBFS. `render.mjs` prints the result of
 * applying it, so this number is checked on every render rather than trusted.
 */
export const OUTPUT_TRIM = 1.823;

/**
 * The voice ceiling, raised, and the one place this score argues with the package.
 *
 * A voice is counted against the ceiling until its *scheduled end*, and a bell's scheduled end
 * is 2.9 s after it was struck. The default 24 therefore allows about six bells in any two-second
 * window across the whole piece — which is a sensible defense against a burst of gameplay sounds
 * and is not a budget a piece of music can be written inside. The sequencer bypasses the ceiling
 * entirely, so the same notes played from a song cost nothing; only music written as one-shots
 * pays. See the report.
 */
const MAX_VOICES = 192;

/** How often the deck is pumped, in seconds of the injected clock. Finer than the deck's own timer. */
const PUMP_SEC = 0.05;

/**
 * Build an engine on `context`, schedule the entire piece into it, and hand back the parts.
 *
 * The clock is injected and driven by hand, which is what makes this render offline and
 * deterministic: nothing here reads `currentTime`, so the whole twenty seconds is scheduled
 * before a single sample is computed and the result cannot depend on how fast the machine is.
 *
 * @param context an `OfflineAudioContext`, or a real one for an audition
 * @param options.stems which of {@link STEMS} to include — omit for all three
 * @param options.pumpAt a function returning the next clock time to pump the sequencer at, for
 *   the determinism check. The default is a steady {@link PUMP_SEC}. With the intensity held
 *   still, a jittering one produces the **same set of notes at the same times and gains** — only
 *   the order they are emitted in changes, which is the pump's order and not the music's. That
 *   is the property that says notes are pinned to the audio clock rather than to whoever asked.
 * @param options.plans an array to collect every {@link VoicePlan} into — the determinism check.
 *   The plan object is reused by the engine, so what is pushed is a copy.
 * @param options.intensity overrides {@link intensityAt}. Only the determinism check uses it:
 *   the deck reads its intensity at *schedule* time, so a score whose intensity moves cannot be
 *   compared across two pump cadences without holding it still first.
 */
export function schedule(context, options = {}) {
  const stems = new Set(options.stems ?? STEMS);
  const nextPump = options.pumpAt ?? ((previous) => previous + PUMP_SEC);
  const intensity = options.intensity ?? intensityAt;

  let clock = 0;
  const audio = createAudio({
    sounds: SOUNDS,
    context: () => context,
    now: () => clock,
    maxVoices: MAX_VOICES,
  });
  const deck = createDeck(audio, { autoPump: false });
  if (options.plans !== undefined) {
    audio.onScheduled((plan) => {
      options.plans.push(
        `${plan.source} ${plan.bus} ${plan.layer} ${plan.wave} ${plan.hz} ${plan.toHz} ${plan.gain} ${plan.pan} ${plan.start} ${plan.end}`,
      );
    });
  }

  audio.mixer.setGain('master', MASTER_GAIN);
  // The three buses flat. The mixer's defaults duck music under everything, which is right for a
  // game — the theme must not bury the alarm — and wrong for a trailer, where the theme is the
  // only thing there is.
  audio.mixer.setGain('music', 1);
  audio.mixer.setGain('sfx', 1);
  audio.mixer.setGain('ui', 1);
  audio.unlock();

  const refused = [];
  const withPulse = stems.has('pulse');

  /** Everything that happens, as one stream: notes, sequencer cues, and pumps. */
  const timeline = [];
  for (const event of EVENTS) {
    if (!stems.has(event.stem)) continue;
    timeline.push({
      at: event.at,
      order: 1,
      run: () => {
        if (!audio.play(event.id, { at: event.at, gain: event.gain, pan: event.pan })) {
          refused.push(event);
        }
      },
    });
  }
  if (withPulse) {
    // `fadeSec: 0`, and it is not a stylistic choice. The deck's fade-in is evaluated per note as
    // `(at - startedAt) / fadeSec`, which is exactly **0** on the first step — and a step whose
    // fade is zero is skipped outright. Any positive fade therefore silently deletes the downbeat
    // the song starts on; with 0.35 s the montage's pulse arrived half a bar late and the kick it
    // was supposed to arrive with never played at all.
    timeline.push({ at: DECK_BUILD.from, order: 0, run: () => deck.play(SONG_BUILD, { fadeSec: 0 }) });
    timeline.push({ at: DECK_RESOLVE.from, order: 0, run: () => deck.play(SONG_RESOLVE, { fadeSec: 0 }) });
    // Stopping the sequencer on an exact beat takes three steps and a subtraction, because there
    // is no "schedule up to time X": a pump always reaches LOOKAHEAD_SEC and no further. So the
    // last pump has to be forced at exactly `to - LOOKAHEAD_SEC`, where its horizon lands on the
    // landmark, and the stop has to follow it in the same instant. Leaving this to the ordinary
    // pump cadence instead makes the *music* a function of the timer — measured at 18 dB of
    // difference between a steady pump and a jittering one, which is a missing bar and a half.
    for (const window of [DECK_BUILD, DECK_RESOLVE]) {
      timeline.push({
        at: window.to - LOOKAHEAD_SEC,
        order: 4,
        run: () => {
          deck.setIntensity(intensity(window.to - 0.001));
          deck.pump();
          deck.stop({ fadeSec: 0 });
        },
      });
    }
  }

  for (let time = 0, guard = 0; time <= DURATION_SEC && guard < 100000; guard += 1) {
    timeline.push({
      at: time,
      order: 3,
      run: () => {
        if (!withPulse) return;
        // Everything a pump schedules lands in the next LOOKAHEAD_SEC, so the intensity that
        // governs it is the intensity of *then*, not of now. Reading it a hair early keeps a
        // step change on the bar it was written for instead of a bar and a half ahead of it.
        deck.setIntensity(intensity(clock + LOOKAHEAD_SEC - 0.001));
        deck.pump();
      },
    });
    const next = nextPump(time);
    if (!(next > time)) break;
    time = next;
  }

  timeline.sort((a, b) => a.at - b.at || a.order - b.order);
  for (const item of timeline) {
    clock = item.at;
    item.run();
  }

  return { audio, deck, refused };
}

/**
 * Everything the package can tell us about this score without rendering it.
 *
 * Run before every render. A table fault is a worse sound with no error, and the one class of
 * fault it cannot see — a sound declared and never played — is the last check here.
 */
export function problems() {
  const found = [
    ...validateSounds(SOUNDS).map((p) => `sound ${p.sound}: ${p.code} — ${p.message}`),
    ...validateSong(SONG_BUILD).map((p) => `build ${p.track ?? '(song)'}: ${p.code} — ${p.message}`),
    ...validateSong(SONG_RESOLVE).map((p) => `resolve ${p.track ?? '(song)'}: ${p.code} — ${p.message}`),
  ];
  const played = new Set(EVENTS.map((event) => event.id));
  for (const id of Object.keys(SOUNDS)) {
    if (!played.has(id)) found.push(`sound ${id}: declared and never struck`);
  }
  for (const event of EVENTS) {
    if (SOUNDS[event.id] === undefined) found.push(`event at ${event.at}: no sound called ${event.id}`);
    if (event.at < 0 || event.at > DURATION_SEC) found.push(`event ${event.id} at ${event.at} is outside the render`);
  }
  return found;
}

/** The landmarks, for the edit and for the analysis to assert transients against. */
export const CUES = {
  establish: T_ESTABLISH,
  pulseIn: T_PULSE_IN,
  montage: T_MONTAGE,
  bars: [T_PULSE_IN, T_PULSE_IN + BAR_SEC, T_PULSE_IN + 2 * BAR_SEC, T_PULSE_IN + 3 * BAR_SEC],
  beats: Array.from({ length: 16 }, (unused, index) => T_PULSE_IN + index * BEAT_SEC),
  cut: T_CUT,
  holeEnd: T_HOLE_END,
  cycles: T_CYCLE,
  plays: T_PLAY,
  lift: T_LIFT,
  land: T_LAND,
};
