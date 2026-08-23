/**
 * **Emberwake — twenty-eight seconds of music for the night-raid trailer.**
 *
 * Every sample is synthesized by `@latticekit/audio`. No sample file, no loop, no downloaded
 * instrument, no second runtime dependency. A kit whose first claim is *zero assets* cannot
 * advertise itself over a stock music download without contradicting itself in its own
 * soundtrack, so this is the whole point of the exercise and not a constraint imposed on it.
 *
 * ## The cut, and what the music does under it
 *
 * | time | on screen | music |
 * |---|---|---|
 * | 0:00–0:03 | night sea, the boat idling, one lamp | two engine thumps, sea air, and two struck notes a semitone apart. Nothing else |
 * | 0:03–0:07 | the first salvo | the piece starts. A struck hit and the sequencer's downbeat land together on the flash |
 * | 0:07–0:12 | escalation, a near miss at speed | a layer per bar, a bell per bar on the note the sequencer cannot play, and a run into the blast |
 * | 0:12–0:17 | **the magazine goes up** | the loudest event in the piece, one second of nothing but its own ring, then embers re-lighting |
 * | 0:17–0:21 | the gauntlet | a pedal D and continuous sixteenths. The motif, whole, twice. Denser, not louder |
 * | 0:21–0:23 | dawn | the pulse simply stops. Three bells falling, and the sea |
 * | 0:23–0:28 | the card, then the reveal | one struck D minor chord, ringing under the card and never faded |
 *
 * ## The decisions worth arguing with
 *
 * **One key: D Phrygian, and nothing modulates.** D–Eb–F–G–A–Bb–C. The flat second is the whole
 * mood: `Eb` over a `D` bass is the most direct "something is wrong out there" two notes can be,
 * it costs nothing to state, and twenty-eight seconds is not long enough to leave a key and be
 * understood coming back. The progression moves the bass a *semitone* (D → Eb) rather than the
 * usual fourth, which is the same idea at the bottom of the mix.
 *
 * **The ending is the first bar with no Eb in it.** Everything up to 0:21 leans on that
 * semitone. The card lands on a plain D minor — D, F, A, no flat second anywhere — so the
 * resolution is not a brighter chord arriving, it is the tension *stopping*. That reads as
 * relief rather than as triumph, which is what a raid that ends because the night ends needs.
 * There is no major chord in this file.
 *
 * **Struck and plucked, never sustained.** Bells, a low toll, a pluck, and drums. A synthesized
 * pad is what makes procedural audio sound like a screensaver, and the practical reason is
 * harder: a pad smears across a hard cut, where a bell simply stops being struck and its tail is
 * a decision the edit gets to make. The only sustained things here are three filtered-noise
 * gestures — sea, blast air, dawn — each with an attack and a decay, each struck once.
 *
 * **The harmony is implied and almost never stated by the sequencer.** The deck transposes a
 * whole track by the bar's root, so any interval a track plays must be consonant with *every*
 * root in the loop: roots, fifths and octaves only. A minor third over the `Eb` bar would be a
 * `Gb`, which is not in the key. Every third, every flat sixth and the entire tune are struck by
 * hand as one-shots.
 *
 * **The bell has a minor-third partial and that is why it sounds like a bell.** Real bells ring
 * at roughly 1 : 1.2 : 2 : 3 above the hum, and the 1.2 is a *minor* third — the interval this
 * whole piece is in. Take that layer out and the same six layers are a piano.
 *
 * @see render.mjs for how this becomes a WAV, analyze.mjs for how it is measured. This module
 *   reads no clock and no global; the same seed is the same twenty-eight seconds every time.
 */

import { createAudio, createDeck, validateSong, validateSounds, LOOKAHEAD_SEC, SEMITONE } from '@latticekit/audio';

// ---------------------------------------------------------------------------
// The cut. These seven numbers are the brief's and are not negotiable
// ---------------------------------------------------------------------------

/** Total length of the render. The trailer is twenty-eight seconds and the file is too. */
export const DURATION_SEC = 28;

/** 120 bpm. A bar is exactly 2 s, a sixteenth is exactly 0.125 s, and both are exact in binary. */
const BPM = 120;
const BEAT_SEC = 60 / BPM;
const BAR_SEC = BEAT_SEC * 4;

/** Cold open. Night sea, the boat idling, one lamp. Almost still, and the music is almost nothing. */
const T_OPEN = 0;
/** The first salvo. Muzzle flash, camera shake. The first real downbeat lands **on** the flash. */
const T_SALVO = 3;
/** Escalation. Enemy fire, a near miss at speed. The only stretch allowed to feel busy. */
const T_BUILD = 7;
/** The magazine. The single loudest instant in the piece, followed by a hole. */
const T_DETONATE = 12;
/** Embers: the shore alight. Not a crescendo through the blast — a separate thing re-lighting. */
const T_EMBERS = 13;
/** The gauntlet. Running the channel with everything burning. Relentless, not louder. */
const T_GAUNTLET = 17;
/** Dawn. The palette washes and it is over. Release, not resolution. */
const T_DAWN = 21;
/** The title card. One clean resolution, struck here and still ringing at 0:28. */
const T_CARD = 23;
/** The reveal, under the card's decay. One note, an octave over the chord that is still sounding. */
const T_REVEAL = 25.5;

/**
 * Where the sequencer runs, in three windows.
 *
 * Every `from` is a landmark and every `to` is either a landmark or a deliberate hair before one.
 * The raid stops at 11.875 rather than at 12.0 so there is a 125 ms hole in front of the blast:
 * an impact with music underneath it is a mix, and an impact with nothing in front of it is an
 * impact. See {@link schedule} for why hitting an exact `to` takes a forced pump.
 */
const DECK_RAID = { from: T_SALVO, to: 11.875 };
const DECK_EMBERS = { from: T_EMBERS, to: T_GAUNTLET };
const DECK_DRIVE = { from: T_GAUNTLET, to: T_DAWN };

// ---------------------------------------------------------------------------
// Pitch. One key, walked a semitone at a time
// ---------------------------------------------------------------------------

/** A2. Every frequency in the file is this multiplied or divided by {@link SEMITONE}. */
const A2_HZ = 110;

/** Semitones from A, per letter. `b` and `#` are parsed; this key needs the flats. */
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
  const letter = PITCH_CLASS[name[0]];
  if (letter === undefined) throw new RangeError(`hz: expected a note like "Eb5", got ${name}`);
  const flat = name[1] === 'b';
  const sharp = name[1] === '#';
  const octave = Number(name.slice(flat || sharp ? 2 : 1));
  if (!Number.isInteger(octave)) throw new RangeError(`hz: expected an integer octave, got ${name}`);
  const semis = (octave - 2) * 12 + letter + (flat ? -1 : 0) + (sharp ? 1 : 0);
  let f = A2_HZ;
  for (let i = 0; i < semis; i += 1) f *= SEMITONE;
  for (let i = 0; i > semis; i -= 1) f /= SEMITONE;
  return f;
}

// ---------------------------------------------------------------------------
// The instruments. Every pitch of each is its own sound id — see `table`
// ---------------------------------------------------------------------------

/**
 * A struck bell, and the piece's voice.
 *
 * Six layers: hum, the minor-third partial, the nominal octave, the twelfth, a hammer, and one
 * high inharmonic. The 1.2 ratio is the one that matters — it is what a founder's bell actually
 * does and it is a *minor* third, so it agrees with the key rather than fighting it. The 45 ms
 * noise hammer is the cheapest layer here and does the most work: without it the sound stops
 * being struck and becomes a sine that faded in.
 */
function bell(f) {
  return {
    bus: 'sfx',
    minGapMs: 70,
    layers: [
      { wave: 'sine', hz: f, gain: 0.15, hold: 3, cutoff: 2400 },
      { wave: 'sine', hz: f * 1.2, gain: 0.055, hold: 1.1, cutoff: 3200 },
      { wave: 'sine', hz: f * 2, gain: 0.07, hold: 1.4, cutoff: 5000, delay: 0.004 },
      // The twelfth is a triangle with its corner at 9 kHz, and it is where the top octave of
      // this whole mix comes from. Two sines and a hammer measured 30 dB down up there and read
      // as a muffled thud with tinkling over it.
      { wave: 'triangle', hz: f * 3, gain: 0.03, hold: 0.4, cutoff: 9000 },
      { wave: 'noise', hz: 0, gain: 0.04, hold: 0.045, highpass: 2400, cutoff: 11000 },
      // A real bell's upper partials die first, so this one is gone in a tenth of a second and
      // is not a whole-number ratio. Integer partials are an organ; 4.76 is metal.
      { wave: 'sine', hz: f * 4.76, gain: 0.02, hold: 0.12 },
    ],
  };
}

/**
 * The big one. Same physics, an octave of extra tail, and everything above 1.2 kHz taken off.
 *
 * Used exactly three times — the shockwave at 0:12 and the two lowest notes of the card — because
 * a 4.5 s tail struck twice is a chord by accident, and because the only reason to pay for four
 * and a half seconds of decay is that something has to still be ringing when the file ends.
 */
function toll(f) {
  return {
    bus: 'sfx',
    minGapMs: 150,
    layers: [
      { wave: 'sine', hz: f, gain: 0.16, hold: 4.5, cutoff: 1200 },
      { wave: 'sine', hz: f * 1.2, gain: 0.05, hold: 2.4, cutoff: 1800 },
      { wave: 'sine', hz: f * 2, gain: 0.06, hold: 1.8, cutoff: 3000, delay: 0.006 },
      { wave: 'sine', hz: f * 3, gain: 0.028, hold: 0.7, cutoff: 6000 },
      { wave: 'noise', hz: 0, gain: 0.05, hold: 0.055, highpass: 1200, cutoff: 7000 },
    ],
  };
}

/**
 * The reflection of a struck note off a shore that does not exist.
 *
 * `@latticekit/audio` has no reverb and cannot have one: a convolver needs an impulse response,
 * which is an audio file, and an algorithmic reverb needs feedback delay lines, which the fixed
 * `source → filter → envelope → pan → bus` chain refuses on purpose — the moment routing is
 * author-defined the clipping ceiling stops being provable.
 *
 * So the space is written into the score. Every exposed note is struck twice more, 105 ms and
 * 240 ms later, quieter, darker, softer-edged and thrown to the other side of the field. That is
 * what a channel between two shores does to a bell. It is applied only where the texture is
 * sparse — the open, the blast, the motif, the card — because under the sequencer the same
 * 250 ms is already full and the reflections would only be mud.
 */
function ghost(f) {
  return {
    bus: 'sfx',
    minGapMs: 60,
    layers: [
      { wave: 'sine', hz: f, gain: 0.15, hold: 2, attack: 0.022, cutoff: 1300 },
      { wave: 'sine', hz: f * 2, gain: 0.05, hold: 0.75, attack: 0.03, cutoff: 2400 },
    ],
  };
}

/**
 * Plucked, short, and the only thing fast enough for the run into the blast.
 *
 * A bell's 3 s tail struck every eighth of a second is a chord nobody wrote. Four tenths of a
 * second of decay is the longest a note can ring at this tempo and still leave the next one room.
 */
function glint(f) {
  return {
    bus: 'sfx',
    minGapMs: 40,
    layers: [
      { wave: 'triangle', hz: f, gain: 0.14, hold: 0.42, cutoff: 4200 },
      { wave: 'sine', hz: f * 2, gain: 0.05, hold: 0.2, cutoff: 6200 },
      { wave: 'noise', hz: 0, gain: 0.032, hold: 0.02, highpass: 3000, cutoff: 11000 },
    ],
  };
}

/** The floor: a struck low root with an octave over it, filtered down to a thud with a pitch. */
function low(f) {
  return {
    bus: 'sfx',
    minGapMs: 200,
    layers: [
      { wave: 'sine', hz: f, gain: 0.13, hold: 2.4, cutoff: 340 },
      { wave: 'triangle', hz: f * 2, gain: 0.045, hold: 0.8, cutoff: 600 },
    ],
  };
}

/**
 * The boat, idling. Two of these in the first three seconds and nothing else underneath.
 *
 * A slow sine falling a fourth with a rattle of low-passed noise on top of it. It is tuned to the
 * key — D2 — so the cold open is already in D before a single note is struck, which is what makes
 * the first bell at 0:00.6 sound like an answer rather than an entrance.
 */
function hull() {
  return {
    bus: 'sfx',
    minGapMs: 400,
    layers: [
      { wave: 'sine', hz: hz('D2'), toHz: hz('A1'), gain: 0.15, hold: 0.9, cutoff: 190 },
      { wave: 'triangle', hz: hz('D3'), gain: 0.035, hold: 0.35, cutoff: 420 },
      { wave: 'noise', hz: 0, gain: 0.02, hold: 0.12, highpass: 60, cutoff: 300 },
    ],
  };
}

/**
 * The hit on the muzzle flash. Percussion, not foley — the trailer has its own gunfire and a
 * score that also fires a gun is two guns.
 *
 * A body, a crack, and a low struck D twelve milliseconds behind them so that the loudest thing
 * in the first salvo has a pitch and belongs to the key.
 */
function strike() {
  return {
    bus: 'sfx',
    minGapMs: 250,
    layers: [
      { wave: 'sine', hz: hz('A2'), toHz: hz('A1'), gain: 0.17, hold: 0.35, cutoff: 280 },
      { wave: 'noise', hz: 0, gain: 0.075, hold: 0.14, highpass: 200, cutoff: 2600 },
      { wave: 'triangle', hz: hz('D4'), gain: 0.05, hold: 0.5, cutoff: 1800, delay: 0.012 },
    ],
  };
}

/**
 * The near miss at 0:10.4. One instance in the file; a second one would be a sound effect.
 *
 * A sawtooth falling two and a half octaves through a low-pass, which is a Doppler pass without a
 * Doppler. It has to be a *tone* and not noise, because `wave: 'noise'` ignores `hz` and `toHz`
 * outright — there is no way to sweep a filtered noise band in this package, so the pitch has to
 * carry the fall and the noise layer only rides along.
 */
function pass() {
  return {
    bus: 'sfx',
    minGapMs: 400,
    layers: [
      { wave: 'sawtooth', hz: 520, toHz: 95, gain: 0.075, hold: 0.55, cutoff: 1100, highpass: 140 },
      { wave: 'noise', hz: 0, gain: 0.06, hold: 0.5, highpass: 400, cutoff: 3400 },
    ],
  };
}

/**
 * The magazine, at 0:12. The loudest event in the piece and the only one that stops the trailer
 * rather than moving it.
 *
 * Sub falling from 96 Hz to 34, a body of low noise, a low triangle a beat behind so the blast has
 * a pitch, and — the layer that makes it a magazine rather than a kick drum — 1.1 s of high hiss
 * with a slow attack, which is debris. The sub is deliberately shorter than it wants to be: at
 * 1.5 s the hole after it measured 2 dB below the montage it was the opposite of, because the
 * impact was filling the silence it had just made.
 */
function detonate() {
  return {
    bus: 'sfx',
    minGapMs: 800,
    layers: [
      { wave: 'sine', hz: 96, toHz: 34, gain: 0.21, hold: 0.85, cutoff: 260 },
      { wave: 'noise', hz: 0, gain: 0.1, hold: 0.42, highpass: 90, cutoff: 1400 },
      { wave: 'triangle', hz: hz('D3'), toHz: hz('D2'), gain: 0.055, hold: 0.7, cutoff: 620, delay: 0.014 },
      { wave: 'noise', hz: 0, gain: 0.05, hold: 1.1, attack: 0.02, highpass: 1600, cutoff: 7000 },
    ],
  };
}

/**
 * Sea air. Struck three times in the file and never looped — the moment this repeats it is a pad.
 *
 * `pan` lives on the layers rather than on the play, so the two bands sit apart and the open has
 * width before anything is struck. Playing it with a `pan` option would collapse them onto each
 * other, which is why every `air` event below passes `undefined`.
 */
function air() {
  return {
    bus: 'sfx',
    minGapMs: 700,
    layers: [
      { wave: 'noise', hz: 0, gain: 0.032, hold: 1.7, attack: 0.5, highpass: 260, cutoff: 1300, pan: -0.3 },
      { wave: 'noise', hz: 0, gain: 0.02, hold: 1.3, attack: 0.75, highpass: 1500, cutoff: 4800, pan: 0.4 },
    ],
  };
}

/** Dawn: the same idea an octave brighter and twice as slow, so the palette washing has a sound. */
function wash() {
  return {
    bus: 'sfx',
    minGapMs: 700,
    layers: [
      { wave: 'noise', hz: 0, gain: 0.03, hold: 2.4, attack: 1, highpass: 400, cutoff: 2600, pan: -0.35 },
      { wave: 'noise', hz: 0, gain: 0.024, hold: 2, attack: 1.3, highpass: 2000, cutoff: 7000, pan: 0.35 },
    ],
  };
}

/**
 * The reveal, and the only note in the file that is allowed to be bright.
 *
 * A bell with the hum taken out and the octave brought forward — two and a bit seconds of decay
 * rather than three, which is what lets it be struck at 0:25.5 and still reach its floor before
 * the file ends at 0:28. Everything else on the card is already ringing; this has to be *heard*
 * over a decaying D minor chord without restating it, so it is the fifth and nothing else.
 */
function chime(f) {
  return {
    bus: 'sfx',
    minGapMs: 120,
    layers: [
      { wave: 'sine', hz: f, gain: 0.11, hold: 2.2, cutoff: 3000 },
      { wave: 'sine', hz: f * 2, gain: 0.055, hold: 1.1, cutoff: 6000, delay: 0.004 },
      { wave: 'triangle', hz: f * 3, gain: 0.022, hold: 0.35, cutoff: 10000 },
      { wave: 'noise', hz: 0, gain: 0.03, hold: 0.035, highpass: 3200, cutoff: 12000 },
    ],
  };
}

/** Pitched instruments, by the name an event names them with. */
const PITCHED = { bell, toll, chime, ghost, glint, low };
/** Unpitched instruments. Their id is just the instrument name. */
const FIXED = { hull, strike, pass, detonate, air, wash };

// ---------------------------------------------------------------------------
// The one-shots, in time order
// ---------------------------------------------------------------------------

/**
 * Which stem an event belongs to, so the edit can duck a layer without a re-render.
 *
 * `pulse` is the sequencer, `melody` is everything with a tune in it, `floor` is everything that
 * carries weight or air — the engine, the subs, the hit, the blast, and the two washes.
 */
export const STEMS = ['pulse', 'melody', 'floor'];

/** One struck note. `note` is absent for the unpitched instruments. */
function at(time, kind, note, gain, pan, stem) {
  return { at: time, kind, note, id: note === undefined ? kind : `${kind}${note}`, gain, pan, stem };
}

/**
 * How long after a note its two reflections arrive, and how much of it survives the trip.
 *
 * 105 ms and 240 ms. Longer than a room and shorter than a canyon, which is a channel with a
 * shore on each side — and the second one is thrown across the field from the first, so the two
 * do not read as a single flam.
 */
const REFLECTIONS = [
  { delay: 0.105, gain: 0.34, pan: -1.15 },
  { delay: 0.24, gain: 0.16, pan: 0.55 },
];

/** A note and its reflections. Works for a bell or a toll; the reflection is a `ghost` either way. */
function struck(out, time, kind, note, gain, pan) {
  out.push(at(time, kind, note, gain, pan, 'melody'));
  for (const reflection of REFLECTIONS) {
    const thrown = Math.max(-0.55, Math.min(0.55, pan * reflection.pan + (pan === 0 ? reflection.pan * 0.2 : 0)));
    out.push(at(time + reflection.delay, 'ghost', note, gain * reflection.gain, thrown, 'melody'));
  }
}

/**
 * The four notes of Emberwake, and the four it becomes.
 *
 * `D Eb A F` — root, flat second, fifth, minor third. The second interval, `Eb` up to `A`, is a
 * tritone, and it is the only one in the piece: stated once slowly and once fast, it is the thing
 * a viewer would hum back. `D F A D` is the same shape with the flat second taken out, which is
 * the whole ending in one line — the tune does not get happier, it gets *safe*.
 */
const MOTIF = ['D5', 'Eb5', 'A5', 'F5'];
const MOTIF_HIGH = ['D6', 'Eb6', 'A6', 'F6'];
const DAWN_FALL = ['D6', 'A5', 'F5'];

function events() {
  const out = [];

  // --- 0:00 cold open -----------------------------------------------------
  // Two engine thumps and the sea. The whole act is four events, because everything after 0:03
  // depends on there being somewhere to go; open big here and the blast at 0:12 is a level.
  out.push(at(T_OPEN, 'air', undefined, 0.72, undefined, 'floor'));
  out.push(at(T_OPEN + 0.15, 'hull', undefined, 0.85, 0, 'floor'));
  out.push(at(1.7, 'hull', undefined, 0.72, 0, 'floor'));
  // The lamp, and the thing out past it. Two notes a semitone apart is the entire piece stated
  // before the piece starts, and it costs twenty voices.
  struck(out, 0.6, 'bell', 'D5', 0.5, -0.22);
  struck(out, 2.1, 'bell', 'Eb5', 0.44, 0.18);
  // The inhale. Air has a 0.5 s attack and a 1.7 s hold, so struck here it peaks exactly on the
  // flash and is already falling when the sequencer takes over. Nothing else lifts into 0:03.
  out.push(at(2.35, 'air', undefined, 0.6, undefined, 'floor'));

  // --- 0:03 the first salvo -----------------------------------------------
  // The hit, the root, and a low toll, all on the same instant as the sequencer's downbeat.
  out.push(at(T_SALVO, 'strike', undefined, 1, 0, 'floor'));
  out.push(at(T_SALVO, 'low', 'D2', 0.62, 0, 'floor'));
  struck(out, T_SALVO, 'toll', 'D3', 0.5, 0.1);
  // One bell a bar, each on the note the sequencer is forbidden: F is the minor third over the D
  // bars, G is the third of the Eb bar, Bb is the flat sixth. The sequencer plays roots, fifths
  // and octaves and *cannot* play any of these — a third transposed by the progression would be
  // a Gb over the Eb bar, which is not in the key.
  out.push(at(3.5, 'glint', 'A5', 0.46, 0.2, 'melody'));
  struck(out, 4, 'bell', 'F5', 0.52, -0.16);
  out.push(at(4.5, 'glint', 'D6', 0.4, 0.24, 'melody'));
  struck(out, 5, 'bell', 'G5', 0.52, 0.14);
  out.push(at(6, 'glint', 'Bb5', 0.46, -0.2, 'melody'));
  out.push(at(6.5, 'glint', 'F5', 0.42, 0.18, 'melody'));
  out.push(at(6.75, 'glint', 'A5', 0.48, -0.12, 'melody'));

  // --- 0:07 escalation ----------------------------------------------------
  // The sequencer gains a layer on every bar line; this column supplies the crescendo, because
  // `intensity` gates whole tracks on and off and there is no per-track gain anywhere in the
  // package. Every decibel of the build between 0:07 and 0:12 is written here by hand.
  const climb = [
    [7, 'A5', 0.5, -0.18],
    [7.25, 'F5', 0.46, 0.16],
    [7.5, 'D6', 0.54, -0.1],
    [8, 'Bb5', 0.54, 0.2],
    [8.375, 'G5', 0.5, -0.16],
    [8.75, 'Eb6', 0.6, 0.12],
    [9, 'C6', 0.6, -0.14],
    [9.25, 'G5', 0.52, 0.18],
    [9.5, 'Eb6', 0.64, -0.1],
    [9.75, 'C6', 0.58, 0.14],
    [10.5, 'D6', 0.68, 0.16],
    [10.625, 'A5', 0.6, -0.18],
    [10.75, 'F6', 0.72, 0.1],
  ];
  for (const [time, note, gain, pan] of climb) out.push(at(time, 'glint', note, gain, pan, 'melody'));
  // The near miss. Hard left, because the boat went past on one side and not on both.
  out.push(at(10.4, 'pass', undefined, 0.95, -0.55, 'floor'));

  // --- 0:11 the run into the blast ----------------------------------------
  // Sixteenths into thirty-seconds up the scale, gain climbing, and it stops at 11.84 — 160 ms
  // of nothing in front of the magazine. An impact with music under it is a mix.
  const run = [
    [11, 'D5'],
    [11.125, 'F5'],
    [11.25, 'G5'],
    [11.375, 'A5'],
    [11.5, 'Bb5'],
    [11.5625, 'C6'],
    [11.625, 'D6'],
    [11.6875, 'Eb6'],
    [11.75, 'F6'],
    [11.78125, 'G6'],
    [11.8125, 'A6'],
  ];
  run.forEach(([time, note], index) => {
    out.push(at(time, 'glint', note, 0.62 + index * 0.032, index % 2 === 0 ? -0.16 : 0.16, 'melody'));
  });

  // --- 0:12 the magazine --------------------------------------------------
  // The blast, and a toll struck with it whose 4.5 s tail *is* the content of the silence after
  // it. Without that, the hole is a file that stopped rather than a shockwave.
  out.push(at(T_DETONATE, 'detonate', undefined, 1, 0, 'floor'));
  struck(out, T_DETONATE, 'toll', 'D3', 0.92, 0);
  // The air rushing back, 350 ms behind the blast, peaking three quarters of a second after it.
  out.push(at(T_DETONATE + 0.35, 'air', undefined, 0.8, undefined, 'floor'));

  // --- 0:13 the shore alight ----------------------------------------------
  // A single low fifth under it, then five bells climbing and accelerating — 1.5 s, 1.0, 0.75,
  // 0.5 — so the four seconds before the gauntlet lean forward without getting louder. The
  // sequencer comes back at a quarter of its intensity and adds one layer at 0:15.
  out.push(at(T_EMBERS, 'low', 'A1', 0.55, 0, 'floor'));
  struck(out, T_EMBERS, 'bell', 'A3', 0.5, -0.2);
  struck(out, 14.5, 'bell', 'D4', 0.5, 0.16);
  struck(out, 15.5, 'bell', 'F4', 0.52, -0.14);
  struck(out, 16.25, 'bell', 'A4', 0.54, 0.12);
  struck(out, 16.75, 'bell', 'D5', 0.56, -0.1);

  // --- 0:17 the gauntlet --------------------------------------------------
  // The motif, whole, for the first time: D Eb A F on the half beat. Then the same four notes an
  // octave up at twice the speed, on the pluck, and then nothing — the melody runs out before the
  // pulse does, which is what makes 0:21 read as an ending rather than as a fade.
  out.push(at(T_GAUNTLET, 'low', 'D2', 0.66, 0, 'floor'));
  MOTIF.forEach((note, index) => {
    struck(out, T_GAUNTLET + index * 0.5, 'bell', note, 0.58 + index * 0.04, [-0.18, 0.16, -0.12, 0.1][index]);
  });
  MOTIF_HIGH.forEach((note, index) => {
    out.push(at(19.5 + index * 0.25, 'glint', note, 0.6 + index * 0.05, index % 2 === 0 ? -0.2 : 0.2, 'melody'));
  });

  // --- 0:21 dawn ----------------------------------------------------------
  // The sequencer stops on the bar line and is not faded. Three bells falling, slowing, and the
  // wash under them. The fourth note of the fall is the card, two seconds later.
  out.push(at(T_DAWN, 'wash', undefined, 0.95, undefined, 'floor'));
  out.push(at(T_DAWN, 'low', 'D2', 0.4, 0, 'floor'));
  const falling = [T_DAWN + 0.05, 21.6, 22.25];
  DAWN_FALL.forEach((note, index) => {
    struck(out, falling[index], 'bell', note, 0.5 - index * 0.04, [0.14, -0.12, 0.08][index]);
  });

  // --- 0:23 the card ------------------------------------------------------
  // D minor, struck low to high by one hand: eight to seventy milliseconds apart, which is what a
  // person playing a chord sounds like and is also worth about a decibel of peak against striking
  // them together. No Eb anywhere in it — that absence is the resolution.
  out.push(at(T_CARD, 'low', 'D2', 0.95, 0, 'floor'));
  const chord = [
    ['toll', 'D3', 0.008, 0.62, -0.08],
    ['toll', 'D4', 0.02, 0.46, 0.1],
    ['bell', 'A4', 0.032, 0.44, -0.14],
    ['bell', 'D5', 0.044, 0.52, 0.06],
    ['bell', 'F5', 0.058, 0.48, -0.05],
    ['bell', 'A5', 0.07, 0.36, 0.16],
    ['bell', 'D6', 0.086, 0.3, -0.18],
  ];
  for (const [kind, note, offset, gain, pan] of chord) struck(out, T_CARD + offset, kind, note, gain, pan);
  // The reveal, two and a half seconds later, on the fifth that is still ringing underneath. One
  // note: the card has a chord already and a second chord here would be a second ending.
  struck(out, T_REVEAL, 'chime', 'A5', 0.4, 0.1);

  out.sort((a, b) => a.at - b.at);
  return out;
}

export const EVENTS = events();

/**
 * The sound table, **generated from the score rather than written beside it.**
 *
 * `validateSounds` documents the one fault it cannot see — a sound declared and never played —
 * and recommends grepping the source for every key. Deriving the table from the events makes that
 * fault inexpressible instead: an id exists here if and only if something strikes it. It also
 * makes the real cost visible, which is that **a chord is n different sound ids**: `minGapMs` is
 * keyed on the id, so six notes of one recipe at six detunes would be six plays of the same sound
 * in the same instant and five of them would be thrown away. Forty-odd rows is what that costs.
 */
function table(from) {
  const out = {};
  for (const event of from) {
    if (out[event.id] !== undefined) continue;
    if (event.note === undefined) {
      const make = FIXED[event.kind];
      if (make === undefined) throw new RangeError(`table: no unpitched instrument called ${event.kind}`);
      out[event.id] = make();
    } else {
      const make = PITCHED[event.kind];
      if (make === undefined) throw new RangeError(`table: no pitched instrument called ${event.kind}`);
      out[event.id] = make(hz(event.note));
    }
  }
  return out;
}

export const SOUNDS = table(EVENTS);

// ---------------------------------------------------------------------------
// The sequencer's two songs
// ---------------------------------------------------------------------------

/**
 * A kick out of one oscillator: a sine at 92 Hz swept to a third of that in an eighth of a
 * second. There is no other way to get a drum out of a table of ten numbers, and a sample would
 * mean shipping a binary for the sake of one thud.
 */
const KICK = { wave: 'sine', gain: 0.15, hold: 0.12, cutoff: 380, sweepTo: 0.38, fixedHz: 92 };

/**
 * A sequencer track is **one voice with no layers**, so a drum that needs a body *and* an attack
 * has to be spelled as two tracks on the same steps. There is no other way to put a click on a
 * kick, and the two can drift apart the moment anything mutes one of them.
 */
const BEATER = { wave: 'noise', gain: 0.03, hold: 0.014, highpass: 700, cutoff: 4000 };

/**
 * The raid, 0:03–0:12 and again under the embers at 0:13.
 *
 * `D – Eb – D – C`: the bass moves a *semitone* and then a whole tone down, which is a chase and
 * not a cadence. The same four bars started on the Eb would read as a resolution arriving; started
 * on the D they read as a thing that has not happened yet.
 *
 * Intensity is a staircase and not a ramp — {@link Track.minIntensity} is a threshold — so what
 * this actually schedules is one more layer arriving on every bar line. Five bars, five steps,
 * and the escalation has a grid to cut against.
 */
export const SONG_RAID = {
  bpm: BPM,
  steps: 16,
  rootHz: hz('D2'),
  progression: [0, 1, 0, -2],
  seed: 19,
  tracks: [
    { id: 'kick', voice: KICK, notes: [{ step: 0 }, { step: 8 }] },
    { id: 'beat', voice: BEATER, notes: [{ step: 0 }, { step: 8 }] },
    {
      id: 'bass',
      voice: { wave: 'triangle', gain: 0.075, hold: 0.5, cutoff: 300 },
      notes: [{ step: 0 }, { step: 8, semis: 12 }, { step: 11, semis: 7 }],
    },
    {
      // The offbeat. First layer in, and the one that turns a pulse into a boat moving.
      id: 'tick',
      voice: { wave: 'noise', gain: 0.045, hold: 0.022, highpass: 5200, cutoff: 12000 },
      notes: [{ step: 2 }, { step: 6 }, { step: 10 }, { step: 14 }],
      minIntensity: 0.4,
    },
    {
      id: 'drive',
      voice: { wave: 'triangle', gain: 0.085, hold: 0.16, cutoff: 3600 },
      // Roots, fifths and octaves only. The deck transposes the whole track by the bar's root, so
      // a third here would be minor over the D bars and diminished over the Eb.
      notes: [
        { step: 1, semis: 24 },
        { step: 3, semis: 31 },
        { step: 4, semis: 36 },
        { step: 6, semis: 31 },
        { step: 7, semis: 24 },
        { step: 10, semis: 36 },
        { step: 11, semis: 31 },
        { step: 13, semis: 24 },
        { step: 14, semis: 31 },
      ],
      melodic: true,
      drop: 0.12,
      minIntensity: 0.6,
    },
    { id: 'kick2', voice: KICK, notes: [{ step: 4 }, { step: 12 }], minIntensity: 0.8 },
    {
      id: 'hat',
      voice: { wave: 'noise', gain: 0.05, hold: 0.026, highpass: 7500, cutoff: 13500 },
      notes: [{ step: 0 }, { step: 2 }, { step: 4 }, { step: 6 }, { step: 8 }, { step: 10 }, { step: 12 }, { step: 14 }],
      minIntensity: 0.85,
    },
    {
      // A struck double octave on the downbeat of the Eb and C bars only, so the loop stops
      // announcing where it begins.
      id: 'clang',
      voice: { wave: 'triangle', gain: 0.09, hold: 0.7, cutoff: 4200 },
      notes: [{ step: 0, semis: 36 }],
      bars: [1, 3],
      minIntensity: 0.7,
    },
  ],
};

/**
 * The gauntlet, 0:17–0:21. Two bars, both on D.
 *
 * The pedal is the whole idea. *Relentless, not louder* means the harmony stops moving and the
 * rhythm does not: four on the floor, ten sixteenths of ostinato a bar, and a second hat that
 * arrives only in the second bar. Nothing here is louder than the raid — measure it — and it is
 * about twice as dense.
 */
export const SONG_DRIVE = {
  bpm: BPM,
  steps: 16,
  rootHz: hz('D2'),
  progression: [0, 0],
  seed: 23,
  tracks: [
    { id: 'kick', voice: KICK, notes: [{ step: 0 }, { step: 4 }, { step: 8 }, { step: 12 }] },
    { id: 'beat', voice: BEATER, notes: [{ step: 0 }, { step: 4 }, { step: 8 }, { step: 12 }] },
    {
      id: 'bass',
      voice: { wave: 'triangle', gain: 0.07, hold: 0.28, cutoff: 320 },
      notes: [{ step: 0 }, { step: 3 }, { step: 6 }, { step: 8, semis: 12 }, { step: 11 }, { step: 14 }],
    },
    {
      id: 'ost',
      voice: { wave: 'triangle', gain: 0.075, hold: 0.14, cutoff: 3800 },
      notes: [
        { step: 1, semis: 24 },
        { step: 2, semis: 31 },
        { step: 4, semis: 24 },
        { step: 5, semis: 36 },
        { step: 7, semis: 31 },
        { step: 9, semis: 24 },
        { step: 10, semis: 31 },
        { step: 12, semis: 36 },
        { step: 13, semis: 31 },
        { step: 15, semis: 24 },
      ],
      melodic: true,
      drop: 0.08,
    },
    {
      id: 'hat',
      voice: { wave: 'noise', gain: 0.05, hold: 0.024, highpass: 7500, cutoff: 13500 },
      notes: [{ step: 2 }, { step: 6 }, { step: 10 }, { step: 14 }],
    },
    {
      id: 'hat2',
      voice: { wave: 'noise', gain: 0.034, hold: 0.018, highpass: 9000, cutoff: 15000 },
      notes: [{ step: 1 }, { step: 3 }, { step: 5 }, { step: 7 }, { step: 9 }, { step: 11 }, { step: 13 }, { step: 15 }],
      bars: [1],
    },
  ],
};

/**
 * How busy the sequencer is, at a given moment. A staircase, and every riser is a bar line.
 *
 * The earliest riser that can be placed *at all* is `songStart + LOOKAHEAD_SEC`: `deck.play`
 * pumps immediately and schedules a bar and a half in one go at whatever the intensity is then.
 * That is why the raid's first layer change is at 0:05 and not at 0:04, and why the embers'
 * change is at 0:15 rather than 0:14.
 */
function intensityAt(seconds) {
  if (seconds < 5) return 0.25;
  if (seconds < 7) return 0.45;
  if (seconds < 9) return 0.65;
  if (seconds < 11) return 0.85;
  if (seconds < T_DETONATE) return 1;
  if (seconds < 15) return 0.3;
  if (seconds < T_GAUNTLET) return 0.6;
  return 1;
}

// ---------------------------------------------------------------------------
// Performing it
// ---------------------------------------------------------------------------

/**
 * The master fader, at the top of its range — and it is not enough.
 *
 * `Mixer.setGain` clamps into `[0, 1]`, `PlayOptions.gain` clamps into `[0, 1]`, and every recipe
 * gain is a fraction chosen so {@link validateSounds} can prove one *sound* cannot clip. Nothing
 * in the package has a gain stage that can exceed one, so a finished mix arrives wherever the
 * arithmetic left it and there is nothing inside `@latticekit/audio` that can bring it up to a
 * delivery level. Raising the recipes is not the answer: the two validators would then correctly
 * refuse the table, because they model the worst case *within one sound* and *within one step*,
 * and the thing that is quiet is the **mix**, which neither of them can see.
 */
export const MASTER_GAIN = 1;

/**
 * The one number here that came from a meter rather than from a decision.
 *
 * Applied to the rendered float buffer before it is written, identically to the master and to
 * every stem, so the stems still sum to the master sample for sample. A constant and not a
 * normalizer: an adaptive one would make the level a function of the loudest accident in the take,
 * and two renders of two edits would then sit at two different levels.
 *
 * `render.mjs` prints the peak after applying it, so this number is checked on every render
 * rather than trusted. See the report for the measurement it came from.
 */
export const OUTPUT_TRIM = 2.27;

/**
 * The voice ceiling, raised, and the one place this score argues with the package.
 *
 * A voice is counted against the ceiling until its **scheduled end**, and a bell's scheduled end
 * is three seconds after it was struck. The default 24 therefore permits about four bells in any
 * three-second window across the entire piece, which is a sensible defense against a burst of
 * gameplay sounds and is not a budget a piece of music can be written inside. The card chord
 * alone is seventy-two voices. The sequencer bypasses the ceiling entirely, so the same notes
 * played from a song cost nothing; only music written as one-shots pays.
 */
const MAX_VOICES = 320;

/** How often the deck is pumped, in seconds of the injected clock. Finer than the deck's own timer. */
const PUMP_SEC = 0.05;

/**
 * Build an engine on `context`, schedule the whole piece into it, and hand back the parts.
 *
 * The clock is injected and driven by hand, which is what makes this render offline and
 * deterministic: nothing here reads `currentTime`, so all twenty-eight seconds are scheduled
 * before a single sample is computed and the result cannot depend on how fast the machine is.
 *
 * @param context an `OfflineAudioContext`, or a real one for an audition
 * @param options.stems which of {@link STEMS} to include — omit for all three
 * @param options.pumpAt a function returning the next clock time to pump at, for the determinism
 *   check. With the intensity held still, a jittering cadence must produce the **same set of
 *   notes at the same times and gains**; only the order they are emitted in may change, and that
 *   is the pump's order rather than the music's.
 * @param options.plans an array to collect a line per {@link VoicePlan} into. The plan object is
 *   reused by the engine, so what is pushed is a string and not the object.
 * @param options.intensity overrides {@link intensityAt}. Only the determinism check uses it: the
 *   deck reads its intensity at *schedule* time, so a score whose intensity moves cannot be
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
        if (!audio.play(event.id, { at: event.at, gain: event.gain, pan: event.pan })) refused.push(event);
      },
    });
  }

  if (withPulse) {
    // No `fadeSec`, and that is not a stylistic choice. The deck's fade-in is evaluated per note
    // as `(at - startedAt) / fadeSec`, which is exactly **0** on the first step, and a step whose
    // fade is zero is skipped outright. Any positive fade therefore silently deletes the downbeat
    // the song starts on — which here is the hit on the muzzle flash.
    const windows = [
      { window: DECK_RAID, song: SONG_RAID },
      { window: DECK_EMBERS, song: SONG_RAID },
      { window: DECK_DRIVE, song: SONG_DRIVE },
    ];
    for (const { window, song } of windows) {
      timeline.push({ at: window.from, order: 0, run: () => deck.play(song, { fadeSec: 0 }) });
      // Stopping the sequencer on an exact instant takes three calls and a subtraction, because
      // there is no "schedule up to time X": a pump always reaches LOOKAHEAD_SEC and no further.
      // So the last pump is forced at exactly `to - LOOKAHEAD_SEC`, where its horizon lands on the
      // landmark, and the stop follows it in the same instant. Left to the ordinary cadence the
      // *music* becomes a function of the timer, which the determinism check would then catch as
      // a missing bar and a half.
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
        // governs it is the intensity of *then* and not of now. Reading it a hair early keeps a
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

/** The last instant a sound is still ramping, measured from its play. Longest layer wins. */
function tailSec(definition) {
  let longest = 0;
  for (const layer of definition.layers) {
    const end = (layer.delay ?? 0) + (layer.attack ?? 0.006) + layer.hold;
    if (end > longest) longest = end;
  }
  return longest;
}

/**
 * Everything the package can tell us about this score without rendering it, plus two things it
 * cannot. Run before every render — a table fault is a worse sound with no error.
 *
 * The two extra checks are both about the file's edges, which no validator in the package knows
 * exist: an event outside `[0, DURATION_SEC]` is written to a file that has already ended, and a
 * *tail* that runs past the end is a decay chopped mid-air. The card chord's tail lands at 27.5 s
 * and the reveal's at 27.7 s precisely so this check stays quiet; the last 20 ms of the file is
 * the exponential floor, which is −80 dBFS and inaudible, rather than a step.
 */
export function problems() {
  const found = [
    ...validateSounds(SOUNDS).map((p) => `sound ${p.sound}: ${p.code} — ${p.message}`),
    ...validateSong(SONG_RAID).map((p) => `raid ${p.track ?? '(song)'}: ${p.code} — ${p.message}`),
    ...validateSong(SONG_DRIVE).map((p) => `drive ${p.track ?? '(song)'}: ${p.code} — ${p.message}`),
  ];
  for (const event of EVENTS) {
    const definition = SOUNDS[event.id];
    if (definition === undefined) {
      found.push(`event at ${event.at}: no sound called ${event.id}`);
      continue;
    }
    if (event.at < 0 || event.at > DURATION_SEC) {
      found.push(`event ${event.id} at ${event.at} s is outside the render`);
    }
    const ends = event.at + tailSec(definition);
    if (ends > DURATION_SEC) {
      found.push(`event ${event.id} at ${event.at} s rings until ${ends.toFixed(3)} s and is cut off by the file end`);
    }
  }
  return found;
}

/** The landmarks, for the edit and for the analysis to rule onto the picture. */
export const CUES = {
  open: T_OPEN,
  salvo: T_SALVO,
  build: T_BUILD,
  detonate: T_DETONATE,
  embers: T_EMBERS,
  gauntlet: T_GAUNTLET,
  dawn: T_DAWN,
  card: T_CARD,
  reveal: T_REVEAL,
  /** Every bar line the sequencer actually plays, across all three windows. */
  bars: [
    ...Array.from({ length: 5 }, (unused, index) => DECK_RAID.from + index * BAR_SEC),
    ...Array.from({ length: 2 }, (unused, index) => DECK_EMBERS.from + index * BAR_SEC),
    ...Array.from({ length: 2 }, (unused, index) => DECK_DRIVE.from + index * BAR_SEC),
  ],
  /** Where each sequencer window stops scheduling. */
  stops: [DECK_RAID.to, DECK_EMBERS.to, DECK_DRIVE.to],
  /** The sixteenth-note grid, per window, for the transient alignment check. */
  grid: [DECK_RAID, DECK_EMBERS, DECK_DRIVE].flatMap((window) =>
    Array.from({ length: Math.ceil((window.to - window.from) / 0.125) + 1 }, (unused, index) => window.from + index * 0.125),
  ),
};
