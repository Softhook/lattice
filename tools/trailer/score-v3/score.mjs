/**
 * **"Lamp Road" — thirty seconds of music for the three-act Lattice trailer.**
 *
 * Every sample is synthesized by `@latticekit/audio`. There is no sample file, no loop, no
 * downloaded instrument and no second runtime dependency: a kit whose first claim is *zero
 * assets* cannot advertise itself over a stock music download without contradicting itself in
 * its own soundtrack.
 *
 * This is the **fourth** score in the repo and the second attempt at this picture.
 * `tools/trailer/score/` is the launch montage, `score-emberwake/` is the night raid, and
 * `score-v2/` is the first pass at this cut. Nothing here imports across; all four are separate
 * copies of the same six-file harness so that none of them can break the others.
 *
 * ## Why this one exists
 *
 * `score-v2` was rejected, in the owner's words, for two things: *"i like the audio of v1 better
 * than v2, its upbeat and fits nicely, game audio doesnt destroy the music."* Both halves of that
 * are diagnoses, and both are answered here structurally rather than by taste.
 *
 * **1. There is no sound design in this file.** Not quieter sound design — none. `score-v2`
 * carried `hull`, `strike`, `pass`, `ring`, `detonate`, `air`, `wash` and a typewriter `tick`:
 * engine thumps, sea, shell passes, hits, and band-passed noise beds. Measured, its sound-design
 * stem sat at −14 dB against a −13 dB melody during the gauntlet, so the tune was competing with
 * an engine. **Every event in this score is a named pitch on a musical instrument**, and
 * {@link problems} refuses the render if any event is not — see the `unpitched` and `off-key`
 * checks. Where the picture needs weight, it gets a struck chord and a low note that belong to
 * the harmony: the white flash at 21.73 is a fifteen-note G major, not a detonation.
 *
 * The only unpitched sound anywhere is the drum kit inside the sequencer — a kick with a
 * `fixedHz`, a beater, and two hi-hats — which is what `tools/trailer/score/` does and is the
 * reason that score reads as upbeat rather than as ambient. {@link problems} bounds it: **every
 * noise layer in the file holds for under 50 ms**, so there is no bed, only transients.
 *
 * **2. It is major, and it goes up.** `score-v2` was D Phrygian with a tritone as its central
 * interval and no major chord in twenty-eight seconds. This is C major for acts one and two and
 * **D major** for act three — a whole-tone lift at the turn, which is the oldest and most
 * reliable escalation there is. The seven things that make it upbeat rather than merely
 * not-dark are listed under {@link problems}, and five of them are assertions rather than claims.
 *
 * ## The shape
 *
 * | time | picture | music |
 * |---|---|---|
 * | 0.00–2.50 | Lamp Road at dusk | a struck root, two swelling fifths, and the motif entering on the wordmark |
 * | 2.50–8.50 | six shots in six seconds | 120 bpm. `C – F – G`, a layer added on every bar line, a bell on the shots that matter |
 * | 8.50 | — | a staccato C major, 75 ms long, so the black is silent rather than fading |
 * | 8.60–9.10 | cut to black | nothing. Measured, not assumed |
 * | 9.10–10.40 | a typed sentence | one bell and a rising scale on a celesta. The typewriter is a musical instrument now |
 * | 10.40–16.00 | three games | `F – Am – C`, light, and the motif stated whole and then withheld one note short |
 * | 16.00 | the turn | **D major.** A wide struck chord and an accelerating riser that lands the band on the next cut |
 * | 17.40–21.20 | the raid | 126.3 bpm — a bar is 1.9 s, so **every act-three cut is a downbeat**. The motif twice as fast, an octave up, then in rising sequence |
 * | 21.20–21.73 | the magazine | the sequencer stops dead. Six thinning notes climb and vanish |
 * | 21.73 | the white flash | **G major, fifteen bells and a low G1.** The file's peak, and the motif's hanging fourth becomes the root of the chord |
 * | 22.20–26.00 | embers, first light | `A – D`. The motif complete and warm |
 * | 26.00–29.92 | the end card | D major, and the G finally falls to F♯ |
 *
 * @see render.mjs for how this becomes a WAV. Impure only there — this module reads no clock and
 *   no global, and the same input produces the same thirty seconds every time.
 */

import { createAudio, createDeck, validateSong, validateSounds, LOOKAHEAD_SEC, SEMITONE } from '@latticekit/audio';

// ---------------------------------------------------------------------------
// The locked cut. Measured off the picture; none of it is negotiable
// ---------------------------------------------------------------------------

/**
 * The length of the file, and of the picture. 29.92 s is 1,436,160 frames at 48 kHz exactly.
 *
 * Written once, here, and read by the render, the analysis and the gate, because two places that
 * both claim to know the length of a master are one place too many.
 */
export const DURATION_SEC = 29.92;

// --- act one: what the kit does --------------------------------------------

/** Lamp Road at dusk, lamps lit. The beauty shot, and the only unhurried thing in the film. */
const T_LAMP = 0;
/** The wordmark fades in, and the motif starts on it. Nothing else is sounding. */
const T_WORDMARK = 0.9;
/** Crowd — 900 walkers. The pulse starts on this cut and the motif's fourth note lands with it. */
const T_CROWD = 2.5;
/** Canyon — a river cutting. */
const T_CANYON = 3.6;
/** Caverns — 692 light pools. */
const T_CAVERNS = 4.9;
/** Orbit — no ground at all. The one shot in act one that gets a swell instead of a strike. */
const T_ORBIT = 6;
/** Clay — terrain dragged by hand. Everything in, and a run out of it. */
const T_CLAY = 7.1;
/**
 * The button: a staccato C major on the bar line, a tenth of a second before the picture cuts.
 *
 * Music leads picture, always, and here it has to: every envelope in this package is an
 * exponential with a tail and no gate, so the only way to have half a second of true silence at
 * 8.60 is for the last thing struck to be **75 milliseconds long**. See {@link stab}.
 */
const T_BUTTON = 8.5;

// --- the hinge -------------------------------------------------------------

/**
 * Half a second of black, and the second most important instant in the film.
 *
 * `problems()` refuses any event inside it, and the gate measures the samples, because those are
 * two different claims: an empty event list says nothing about what is still ringing.
 */
const T_BLACK = 8.6;
const T_BLACK_END = 9.1;

// --- act two: who writes it ------------------------------------------------

/** A typed sentence. One bell and a rising celesta scale — no typewriter, by commission. */
const T_SENTENCE = 9.1;
/** Chime Path. The pulse returns here, on the cut. */
const T_CHIME_PATH = 10.4;
/** A second sentence, faster than the first: thirteen notes in three quarters of a second. */
const T_SENTENCE_TWO = 12.3;
/** Evenfall Orchard. */
const T_ORCHARD = 13.1;
/** Before the Bell, where the motif stops one note short and the bell does not ring. */
const T_BELL = 14.5;

// --- act three: everything at once -----------------------------------------

/**
 * The turn. C major becomes **D major**: up a whole tone, which is the lift the whole film is
 * built to earn. The sequencer has already stopped; what fills the next 1.4 s is a riser.
 */
const T_TURN = 16;
/** Emberwake — broadside. The band lands here, at a new tempo, on a downbeat. */
const T_EMBERWAKE = 17.4;
/** The gauntlet. The motif in rising sequence, four times in 1.9 s. Also a downbeat. */
const T_GAUNTLET = 19.3;
/** The magazine. The sequencer stops on this frame — this is the drop. Also a downbeat. */
const T_MAGAZINE = 21.2;
/**
 * **The white flash.** One frame of full-frame white, and the file's peak.
 *
 * It is not on the sixteenth grid and it is not supposed to be: the picture cuts where it cuts,
 * and a struck chord placed by hand can land anywhere. Everything around it is arranged so that
 * this is the loudest sample in the master and the 16.7 ms before it are nearly empty.
 */
const T_FLASH = 21.73;
/** The band comes back. Chosen so that the two bars after it land exactly on the next two cuts. */
const T_RETURN = 22.2;
/** Where the motif gets its short, hurried statement over the embers — two beats after the return. */
const T_EMBERS_PHRASE = 23.15;
/** First light. A downbeat, and the motif's last complete statement. */
const T_FIRST_LIGHT = 24.1;
/** The end card. The sequencer stops here and the resolution is struck by hand. */
const T_END_CARD = 26;
/**
 * The chord re-struck, twice, because a 3.92 s card outlasts every envelope in this package.
 *
 * The longest `hold` here is 2.6 s and the card needs 3.92, so a chord struck on the cut is at its
 * floor with a second and a half of picture left. Two quieter re-strikes a second apart carry the
 * ring to the final frame, and the second one is the last sound in the file.
 */
const T_RESTRIKE = 27.2;
const T_RESTRIKE_TWO = 28.35;
/** The last glint. Nothing after this, and nothing whose envelope reaches the final sample. */
const T_LAST = 28.6;

// ---------------------------------------------------------------------------
// Tempo, and the one arithmetic fact that decided act three
// ---------------------------------------------------------------------------

/**
 * Acts one and two: 120 bpm. A bar is 2.0 s, a sixteenth is 0.125 s, and both are exact in binary.
 *
 * Anchored at {@link T_CROWD}, the sixteenth grid lands within **25 ms** of every act-one cut but
 * one — 3.6, 4.9, 7.1 and 8.6 are all a thirty-second from a grid line, and 6.0 is exactly on one.
 * That is close enough that the pulse reads as *underneath* the edit rather than as fighting it,
 * which is what the brief asks for: give acts one and two a grid to cut against, and do not score
 * every cut.
 */
const BPM_OPEN = 120;
const BEAT_OPEN = 60 / BPM_OPEN;
const BAR_OPEN = BEAT_OPEN * 4;
const SIXTEENTH_OPEN = BEAT_OPEN / 4;

/**
 * **A bar is four beats regardless of `steps`**, so a bar lasts `240 / bpm` seconds and nothing
 * else about a song can change that.
 *
 * Act three's shots are 1.9 s each — 17.40, 19.30, 21.20 — and at 120 bpm a bar is 2.0 s, so the
 * harmony would be 100 ms out by the second cut and 200 ms out by the third, which is a bar line
 * arriving *after* the picture has already moved. `score-v2` accepted that and paid for it with a
 * static D pedal through the whole raid, because nothing else fits.
 *
 * Solving `240 / bpm = 1.9` gives 126.3158 bpm, and then **every cut in act three is a downbeat**:
 * 17.40, 19.30, 21.20, and — restarting the deck at 22.20 — 24.10 and 26.00. Five picture cuts,
 * five chord changes, no compromise. That is the whole reason act three has a progression at all.
 *
 * It is also 5% faster than acts one and two, and the change is masked by the 1.4 s riser at the
 * turn, where there is no pulse to compare it against.
 */
const BAR_DRIVE = 1.9;
const BPM_DRIVE = 240 / BAR_DRIVE;
const BEAT_DRIVE = BAR_DRIVE / 4;
const SIXTEENTH_DRIVE = BAR_DRIVE / 16;

/**
 * Where the sequencer runs, and where it stops.
 *
 * `pump` schedules `time < horizon` strictly, so a window ending exactly on a landmark excludes
 * any step falling on it — which is what leaves 8.50, 16.00, 21.20 and 26.00 free for a hand.
 */
const DECK_OPEN = { from: T_CROWD, to: T_BUTTON };
const DECK_WRITE = { from: T_CHIME_PATH, to: T_TURN };
const DECK_DRIVE = { from: T_EMBERWAKE, to: T_MAGAZINE };
const DECK_SURGE = { from: T_RETURN, to: T_END_CARD };
const DECK_WINDOWS = [DECK_OPEN, DECK_WRITE, DECK_DRIVE, DECK_SURGE];

// ---------------------------------------------------------------------------
// Pitch. Two keys, both major, and the second one higher
// ---------------------------------------------------------------------------

/** A2. Every frequency in the file is this multiplied or divided by {@link SEMITONE}. */
const A2_HZ = 110;

/** Semitones from A, per letter. `#` and `b` are parsed; act three needs the sharps. */
const PITCH_CLASS = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };

/** Semitones from A of a note *name*, ignoring its octave. `F#` is −3, `A` is 0. */
function classOf(name) {
  const base = PITCH_CLASS[name[0]];
  const accidental = name[1] === '#' ? 1 : name[1] === 'b' ? -1 : 0;
  return (((base + accidental) % 12) + 12) % 12;
}

/**
 * The frequency of a named note, by repeated multiplication rather than by `pow`.
 *
 * `SEMITONE` is exported by the package as a literal for exactly this reason: `Math.pow` is
 * Tier B, not required by ECMA-262 to be correctly rounded, and two renders that disagree in the
 * last bit are two renders whose plan hashes disagree — which would make the determinism check
 * meaningless the first time it ran on someone else's machine.
 */
function hz(name) {
  const accidental = name[1] === '#' ? 1 : name[1] === 'b' ? -1 : 0;
  const octave = Number(name.slice(accidental === 0 ? 1 : 2));
  const semis = (octave - 2) * 12 + PITCH_CLASS[name[0]] + accidental;
  let f = A2_HZ;
  for (let i = 0; i < semis; i += 1) f *= SEMITONE;
  for (let i = 0; i > semis; i -= 1) f /= SEMITONE;
  return f;
}

/**
 * The major scale, as semitones above its tonic. The only collection in this file.
 *
 * Acts one and two are C major and act three is D major. Same seven intervals, a whole tone
 * higher — which is why the turn reads as a *lift* rather than as a change of subject, and why
 * the motif can be transposed into it note for note.
 */
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

/** The tonic of each act, and the instant act three's key takes over. */
const KEY_OPEN = 'C';
const KEY_DRIVE = 'D';

/** How far above an act's tonic a note sounds, in semitones. */
function degreeIn(tonic, name) {
  return (((classOf(name) - classOf(tonic)) % 12) + 12) % 12;
}

// ---------------------------------------------------------------------------
// The instruments. Seven of them, and every one plays a pitch
// ---------------------------------------------------------------------------

/**
 * Everything here is on the `sfx` bus with `spatial` set by hand, and both are load-bearing.
 *
 * `spatial` defaults to **`bus === 'sfx'`**, and with it off `PlayOptions.pan` is *silently
 * ignored* rather than refused — so a score written on the `music` bus would render in mono with
 * nothing anywhere saying why, and the fake reverb below would do nothing at all. Saying it out
 * loud costs one line per recipe and makes the dependency visible.
 *
 * The sequencer is a different matter: `Track` has no pan and the deck writes `pan = 0` for every
 * note it schedules, so the entire sequenced half of any Lattice soundtrack is dead center by
 * construction. That is a gap in the package, not a decision here.
 */
const SPATIAL = { bus: 'sfx', spatial: true };

/**
 * The main struck voice: a bell hit with a hard mallet. The motif, the chords, the flash.
 *
 * Four tuned partials at exact small-integer ratios — so the timbre is built with `*` and only
 * the *interval* between notes is Tier B — and a 42 ms noise transient which is the mallet. Take
 * the mallet out and the sound stops being struck and becomes a sine that faded in; it is the
 * cheapest layer here and it does the most work. It is a *layer of an instrument*, not an event:
 * nothing in this score plays noise on its own.
 */
function bell(f) {
  return {
    ...SPATIAL,
    minGapMs: 60,
    layers: [
      { wave: 'sine', hz: f, gain: 0.15, hold: 2.6, cutoff: 2800 },
      { wave: 'sine', hz: f * 2, gain: 0.07, hold: 1.15, cutoff: 5400, delay: 0.004 },
      // The twelfth is a triangle behind a 9 kHz low-pass, and it is where all of this score's
      // air comes from. Two sines and a mallet measure 30 dB down in the top octave and read as
      // a muffled kick with tinkling over it.
      { wave: 'triangle', hz: f * 3, gain: 0.03, hold: 0.42, cutoff: 9000 },
      { wave: 'noise', hz: 0, gain: 0.04, hold: 0.042, highpass: 2600, cutoff: 11000 },
      // A real bell's upper partials die first. Without this the top octave measures 28 dB under
      // the mids: dull in the specific way that reads as synthetic rather than as quiet.
      { wave: 'sine', hz: f * 5, gain: 0.022, hold: 0.13 },
    ],
  };
}

/**
 * **The flash chord's voice, and the one instrument here whose envelope was set by a meter.**
 *
 * It is a {@link bell} with a 1.5 ms attack instead of 6, and a 1.2 s ring instead of 2.6, and
 * both numbers exist because of what a *harmonic* chord does to a peak meter.
 *
 * Fifteen bells spelling G major over five octaves are near-harmonics of the G1 underneath them —
 * 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 36, 40, 48 — so the sum is quasi-periodic at 49 Hz and
 * crests every 20 ms. Equal temperament makes it *quasi*-periodic rather than periodic, so the
 * crests beat against each other by a decibel or two and which one is the loudest is effectively
 * arbitrary. With a 2.6 s ring the decay across the first sixty milliseconds is 1.4 dB, less than
 * that beating, and the file's loudest sample landed on the fourth crest — 63 ms after the
 * picture, which is four frames late.
 *
 * A 1.2 s ring decays 3.6 dB over the same sixty milliseconds, which is more than the beating, so
 * the earliest crest wins and it is inside the white frame. The 1.5 ms attack is the other half:
 * with the package's default 6 ms the crest at 11 ms is still on the ramp.
 *
 * This is a real, non-obvious property of scoring a *pitched* climax rather than an explosion, and
 * it is the one thing here that `score-v2` never had to solve — a noise blast peaks on its first
 * sample by construction.
 */
function blaze(f) {
  return {
    ...SPATIAL,
    minGapMs: 60,
    layers: [
      { wave: 'sine', hz: f, gain: 0.15, hold: 1.2, attack: 0.0015, cutoff: 3200 },
      { wave: 'sine', hz: f * 2, gain: 0.07, hold: 0.6, attack: 0.0015, cutoff: 6000 },
      { wave: 'triangle', hz: f * 3, gain: 0.032, hold: 0.3, attack: 0.0015, cutoff: 10000 },
      { wave: 'noise', hz: 0, gain: 0.042, hold: 0.04, attack: 0.0015, highpass: 2600, cutoff: 12000 },
      { wave: 'sine', hz: f * 5, gain: 0.024, hold: 0.12, attack: 0.0015 },
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
 * So the room is written into the score. Every exposed note is struck twice more, at **45 ms** and
 * 235 ms, quieter, darker, softer-edged and thrown across the field. 45 ms is inside the fusion
 * window, so the first reflection thickens the note instead of repeating it; 235 ms is meant to be
 * heard as a far wall. It is applied where the texture is sparse and withheld where it is not —
 * the gauntlet and the two sentences are dry, because there the reflections are only mud.
 */
function ghost(f) {
  return {
    ...SPATIAL,
    minGapMs: 50,
    layers: [
      { wave: 'sine', hz: f, gain: 0.15, hold: 1.8, attack: 0.02, cutoff: 1500 },
      { wave: 'sine', hz: f * 2, gain: 0.055, hold: 0.62, attack: 0.03, cutoff: 2800 },
    ],
  };
}

/**
 * A celesta: plucked, bright, and gone in four hundred milliseconds.
 *
 * The runs are written on this and not on {@link bell} for one reason — a 2.6 s tail struck every
 * eighth of a second is a chord by accident.
 */
function pluck(f) {
  return {
    ...SPATIAL,
    minGapMs: 50,
    layers: [
      { wave: 'triangle', hz: f, gain: 0.145, hold: 0.42, cutoff: 4800 },
      { wave: 'sine', hz: f * 2, gain: 0.05, hold: 0.2, cutoff: 6800 },
      { wave: 'noise', hz: 0, gain: 0.032, hold: 0.02, highpass: 3400, cutoff: 12000 },
    ],
  };
}

/**
 * Act three's celesta: the same idea two thousand hertz brighter and a third shorter.
 *
 * The turn has to sound like *more*, and one honest way to spend that is on the top octave. This
 * has a third partial where {@link pluck} has two, and its mallet is band-passed an octave up.
 */
function glass(f) {
  return {
    ...SPATIAL,
    minGapMs: 50,
    layers: [
      { wave: 'triangle', hz: f, gain: 0.13, hold: 0.34, cutoff: 8000 },
      { wave: 'sine', hz: f * 2, gain: 0.058, hold: 0.16, cutoff: 10500 },
      { wave: 'sine', hz: f * 3, gain: 0.036, hold: 0.09, cutoff: 13000 },
      { wave: 'noise', hz: 0, gain: 0.038, hold: 0.016, highpass: 5200, cutoff: 15000 },
    ],
  };
}

/** The floor: a struck low root with one octave over it, filtered down to a thud with a pitch. */
function low(f) {
  return {
    ...SPATIAL,
    minGapMs: 180,
    layers: [
      { wave: 'sine', hz: f, gain: 0.135, hold: 2.2, cutoff: 400 },
      { wave: 'triangle', hz: f * 2, gain: 0.05, hold: 0.8, cutoff: 640 },
    ],
  };
}

/**
 * A staccato chord voice — 75 ms, and the reason the cut to black is silent.
 *
 * Act one has to end on something with weight, and the only weight this package can make is an
 * envelope. A bell struck at 8.50 is still 19 dB down at 8.60, which is not a hole; this is at its
 * exponential floor by 8.58. It is a pitched instrument playing a C major triad, not a hit.
 */
function stab(f) {
  return {
    ...SPATIAL,
    minGapMs: 30,
    layers: [
      { wave: 'triangle', hz: f, gain: 0.13, hold: 0.075, cutoff: 3600 },
      { wave: 'sine', hz: f * 2, gain: 0.05, hold: 0.05, cutoff: 5200 },
      { wave: 'noise', hz: 0, gain: 0.028, hold: 0.014, highpass: 2200, cutoff: 10000 },
    ],
  };
}

/** The button's floor. A {@link low} would still be sounding at 10.7 s; this one is done at 8.59. */
function thud(f) {
  return {
    ...SPATIAL,
    minGapMs: 30,
    layers: [
      { wave: 'sine', hz: f, gain: 0.16, hold: 0.085, cutoff: 300 },
      { wave: 'triangle', hz: f * 2, gain: 0.05, hold: 0.06, cutoff: 500 },
    ],
  };
}

/**
 * The one sustained thing in the file, and it is a gesture rather than a bed.
 *
 * A 420 ms attack onto a pitch in the chord, then a decay. It is used seven times — the beauty
 * shot, the orbit, after the black, the orchard, the turn, first light and the end card — and it
 * is never re-triggered while it is still sounding. The moment this loops it is a pad, and a pad
 * is what makes procedural audio sound like a screensaver.
 *
 * It is also what replaced `score-v2`'s `air` and `wash`, which were band-passed noise. The
 * difference is not level: it is that this one has a **note name** and belongs to the chord.
 */
function swell(f) {
  return {
    ...SPATIAL,
    minGapMs: 300,
    layers: [
      { wave: 'triangle', hz: f, gain: 0.075, hold: 1.5, attack: 0.42, cutoff: 1600 },
      { wave: 'sine', hz: f * 2, gain: 0.032, hold: 1.1, attack: 0.55, cutoff: 3200 },
    ],
  };
}

/**
 * The end card's second strike. Softer-edged, no mallet, and long enough to reach the last frame.
 *
 * The card is held for 3.92 s and the longest envelope in this package is 2.6 s, so a chord struck
 * on the cut is at its floor with a second and a half of picture left. `hold` is the **whole**
 * envelope with no second stage and it is a property of the *recipe*, never of the play — there is
 * no sustain, no release and no way to ask one note to ring longer than another of the same
 * sound. So a resolution that has to survive is re-struck, and this is what it is re-struck with.
 */
function glow(f) {
  return {
    ...SPATIAL,
    minGapMs: 200,
    layers: [
      { wave: 'sine', hz: f, gain: 0.13, hold: 2.2, attack: 0.02, cutoff: 2400 },
      { wave: 'sine', hz: f * 2, gain: 0.055, hold: 1.2, attack: 0.03, cutoff: 4800 },
      { wave: 'triangle', hz: f * 3, gain: 0.022, hold: 0.35, cutoff: 8000 },
    ],
  };
}

/** Every instrument in the file. There is no second table: nothing here is unpitched. */
const INSTRUMENTS = { bell, blaze, ghost, pluck, glass, low, stab, thud, swell, glow };

/** Which echo an instrument gets. A lookup, so it cannot be got wrong one call at a time. */
const ECHO_OF = { bell: 'ghost', blaze: 'ghost', pluck: 'ghost', glass: 'ghost', glow: 'ghost' };

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * The three stems, split by *musical function* rather than by loudness.
 *
 * `score-v2` shipped `pulse / melody / floor`, where `floor` meant "the subs and the sound
 * design" — which made it useless for the one job a stem has, because the thing the mix needed to
 * turn down was spread across two of the three. Here the split is the one an arranger would make:
 *
 * | stem | what is in it |
 * |---|---|
 * | `pulse` | the sequencer, entire — drums, bass, ostinato, hats. The rhythmic engine |
 * | `melody` | the single line: the motif, the runs, the risers, and their reflections |
 * | `harmony` | everything sustained or chordal — the low roots, the swells, the struck chords at 8.50, 16.00, 21.73, 24.10 and 26.00, and their reflections |
 *
 * So the two questions an edit actually asks — *"less drums under the voiceover"* and *"more
 * weight on the flash"* — are each one fader, and neither needs a re-render.
 */
export const STEMS = ['pulse', 'melody', 'harmony'];

/** One struck note: when, on what, which pitch, how hard, where, and which stem. */
function at(time, kind, note, gain, pan, stem) {
  return { at: time, kind, note, id: `${kind}${note}`, gain, pan, stem };
}

/**
 * The pan limit, widened, and the second place this score argues with the package.
 *
 * The default is **0.6**, and that is a *game* default rather than a wrong one: a panner at 1.0
 * removes a sound from one ear, and a player who cannot hear the alarm because it happened on
 * their left is the player the ceiling exists for. A trailer master has the opposite problem — it
 * is heard once, on two speakers a meter apart or on headphones — and the entire point of writing
 * a reverb into the score as opposite-panned reflections is width it cannot have at 0.6.
 */
const MAX_PAN = 0.85;

/**
 * How long after a note its two reflections arrive, and how much survives the trip.
 *
 * The near wall is on the left and the far wall on the right, and neither moves — a reflection
 * comes off a wall, and where the wall is does not depend on where the note is. `score-emberwake`
 * computed this as `sourcePan × reflectionPan`, which mirrors the source and does almost nothing:
 * with notes panned between ±0.1 and ±0.3 the reflections came back inside ±0.4 and the side
 * channel measured 21 dB under the mid, which is a chorus rather than a room.
 */
const REFLECTIONS = [
  { delay: 0.045, gain: 0.34, pan: -0.72 },
  { delay: 0.235, gain: 0.16, pan: 0.4 },
];

/** Where a reflection lands, given where its source is. The near wall at −0.72 needs `maxPan` up. */
function reflectionPan(sourcePan, reflection) {
  return Math.max(-MAX_PAN, Math.min(MAX_PAN, reflection.pan - sourcePan * 0.45));
}

/** A note and its two reflections, all in the caller's stem so the split stays meaningful. */
function struck(out, time, kind, note, gain, pan, stem) {
  const echo = ECHO_OF[kind];
  if (echo === undefined) throw new RangeError(`struck: ${kind} has no reflection instrument`);
  out.push(at(time, kind, note, gain, pan, stem));
  for (const reflection of REFLECTIONS) {
    out.push(at(time + reflection.delay, echo, note, gain * reflection.gain, reflectionPan(pan, reflection), stem));
  }
}

/** A dry note — no reflections. Used wherever the texture is already filling the same 200 ms. */
function dry(out, time, kind, note, gain, pan, stem) {
  out.push(at(time, kind, note, gain, pan, stem));
}

/**
 * A chord, rolled low to high by a hand rather than played by a grid.
 *
 * Eight milliseconds between notes is what one person striking a chord sounds like, and it is
 * also worth about a decibel of peak. The flash uses two, because a climax is simultaneous.
 *
 * Every chord here is *n* sound ids, and it has to be: `minGapMs` is keyed on the sound **id**, so
 * a chord spelled as one recipe played six times at six detunes is six plays of the same sound in
 * the same instant and five of them are thrown away. That is right for a COLLECT ALL button and
 * wrong for music, and there is no way to tell the package which one you meant.
 */
function chord(out, time, kind, notes, roll, stem, echo) {
  notes.forEach(([note, gain, pan], index) => {
    const when = time + index * roll;
    // `echo` may be a *number*, meaning "reflect from this note upward". That exists for the
    // flash and for one measured reason: fifteen reflections all arriving 45 ms later, all thrown
    // at the same wall, sum more coherently than the fifteen notes that caused them, and the
    // file's loudest sample moved out of the white frame and into the echo of it. A wall absorbs
    // low frequencies anyway, so reflecting only the top half is both the fix and the truth.
    const wants = echo === true || (typeof echo === 'number' && index >= echo);
    if (wants) struck(out, when, kind, note, gain, pan, stem);
    else dry(out, when, kind, note, gain, pan, stem);
  });
}

/**
 * **The motif.** Scale degrees **5 – 1 – 3 – 4**, and the fourth is the whole point.
 *
 * In C that is `G4 C5 E5 F5`: it rises through the major third — so the shape says *major* before
 * it says anything else — and then hangs on the fourth degree, which is the one note of the seven
 * that cannot sit still over the tonic. Every statement in acts one and two leaves it hanging.
 *
 * In D, an octave up, it is `A5 D6 F♯6 G6`, and act three transforms it by **lifting**: up a whole
 * tone, up an octave, and from half-notes to sixteenths — a 4.2× rhythmic diminution. Nothing is
 * flattened and nothing is darkened; it is the same four degrees, higher and faster.
 *
 * Then the two ends of the film meet. The hanging fourth of the D-major motif is **G**, and the
 * chord on the white flash is **G major** — so the note that has been unresolved for twenty-one
 * seconds becomes the root of the biggest chord in the piece. It only truly resolves on the end
 * card, where the G falls to F♯ inside a D major triad. That is the "something recognizable
 * arrives" the film needs, and there is nothing else in here to recognize.
 */
const MOTIF_OPEN = ['G4', 'C5', 'E5', 'F5'];
const MOTIF_DRIVE = ['A5', 'D6', 'F#6', 'G6'];

/** The rising sequence in the gauntlet: the motif's contour, started three degrees higher each time. */
const SEQUENCE = [
  ['A5', 'D6', 'F#6', 'G6'],
  ['B5', 'E6', 'G6', 'A6'],
  ['D6', 'F#6', 'A6', 'B6'],
  ['E6', 'G6', 'B6', 'D7'],
];

/** The riser at the turn: thirteen notes up three octaves of D major, each gap 90% of the last. */
const RISER = ['D4', 'F#4', 'A4', 'D5', 'E5', 'F#5', 'A5', 'B5', 'D6', 'E6', 'F#6', 'A6', 'D7'];
const RISER_FROM = 16.1;
const RISER_GAP = 0.18;
const RISER_RATIO = 0.9;

/** The first sentence: a C major scale, one sixteenth apart, arriving on the cut it precedes. */
const SENTENCE_ONE = ['E5', 'F5', 'G5', 'A5', 'B5', 'C6', 'D6', 'E6'];
/** The second sentence, faster: thirty-seconds over the A minor bar. */
const SENTENCE_TWO = ['A5', 'C6', 'E6', 'C6', 'A5', 'C6', 'E6', 'G6', 'E6', 'C6', 'A5', 'C6', 'E6'];

/** The magazine: six notes climbing out of the mix and taking it with them. */
const VANISH = [
  [21.2, 'A6', 0.32],
  [21.31, 'B6', 0.3],
  [21.41, 'D7', 0.27],
  [21.5, 'E7', 0.24],
  [21.575, 'F#7', 0.21],
  [21.635, 'A7', 0.18],
];

/**
 * **The white flash.** G major over five octaves, fifteen bells and one low G1, rolled 1.8 ms.
 *
 * It is IV of D and not I, and that is deliberate: a plagal chord is the brightest triad in a
 * major key and it *opens out* rather than concluding, which is what a film with eight seconds
 * still to run needs from its biggest moment. The A is the added ninth. The resolution is 4.3 s
 * later, on the card.
 *
 * There is no impact sound here and no noise layer beyond the fifteen mallets. The weight is the
 * G1 — 49 Hz, a pitch, the root of the chord.
 */
const FLASH_CHORD = [
  ['G2', 0.5, -0.06], ['D3', 0.46, 0.08], ['G3', 0.58, -0.1], ['B3', 0.54, 0.12],
  ['D4', 0.58, -0.14], ['G4', 0.66, 0.1], ['B4', 0.62, -0.16], ['D5', 0.66, 0.14],
  ['G5', 0.78, -0.12], ['B5', 0.74, 0.18], ['D6', 0.72, -0.18], ['G6', 0.88, -0.08],
  ['A6', 0.5, 0.22], ['B6', 0.66, 0.2], ['D7', 0.56, -0.2],
];

/** Which note of {@link FLASH_CHORD} the reflections start at. See {@link chord}. */
const FLASH_ECHO_FROM = 8;

function events() {
  const out = [];

  // --- 0:00 Lamp Road at dusk ----------------------------------------------
  // A struck root, an open fifth swelling in behind it, and one bell low enough to be a room
  // rather than a note. Three sounds in two and a half seconds: this shot has to buy the next
  // twenty-seven, and the way to do that is to leave space in it.
  out.push(at(T_LAMP, 'low', 'C2', 0.52, 0, 'harmony'));
  out.push(at(T_LAMP, 'swell', 'C3', 0.72, -0.3, 'harmony'));
  out.push(at(T_LAMP, 'swell', 'G3', 0.62, 0.34, 'harmony'));
  struck(out, T_LAMP + 0.02, 'bell', 'C4', 0.4, -0.2, 'harmony');

  // --- 0:00.9 the wordmark, and the motif ----------------------------------
  // Rubato into tempo: 0.60, 0.50, 0.50, so the last note lands exactly on the cut the pulse
  // starts on. The gaps shorten rather than lengthen, which is the difference between a phrase
  // that is arriving somewhere and one that is running down.
  const opening = [T_WORDMARK, 1.5, 2, T_CROWD];
  const openingGain = [0.5, 0.54, 0.58, 0.72];
  const openingPan = [-0.18, 0.16, -0.14, 0.08];
  MOTIF_OPEN.forEach((note, index) => {
    struck(out, opening[index], 'bell', note, openingGain[index], openingPan[index], 'melody');
  });

  // --- 0:02.5 the montage --------------------------------------------------
  // The pulse starts on the cut, not before it, and the root is struck under it. Without that the
  // montage opens 6 dB below the shot in front of it, which reads as the music backing off at the
  // exact moment the picture speeds up.
  out.push(at(T_CROWD, 'low', 'C2', 0.5, 0, 'harmony'));

  // One bell on each of the three cuts that carry an idea, always on the chord's *third* — the
  // note the sequencer is not allowed to play, and the note that decides major from minor.
  struck(out, T_CANYON, 'bell', 'C6', 0.5, -0.16, 'melody');
  struck(out, T_CAVERNS, 'bell', 'A5', 0.6, 0.14, 'melody');
  // The clay shot lands on **plucks and not bells**, and that is the cut to black's doing rather
  // than a colour choice. A bell holds for 2.6 s, so one struck on this cut is still at −62 dBFS
  // at 8.95 — measured — and it took the hinge from −72 dBFS rms to −64. Act one therefore stops
  // ringing at 7.53 and everything after it is either short or already decaying, which is the only
  // way this package can produce half a second of true silence. The swell underneath is safe: it
  // is a 1.92 s envelope and it is at its floor by 9.02.
  chord(out, T_CLAY, 'pluck', [['B5', 0.72, 0.12], ['D6', 0.6, -0.14]], 0.01, 'melody', true);
  out.push(at(T_CLAY, 'low', 'G2', 0.58, 0, 'harmony'));
  out.push(at(T_CLAY, 'swell', 'B3', 0.56, 0.3, 'harmony'));

  // "No ground at all" is the one shot in act one that is not struck: the sequencer drops to its
  // floor and a fifth swells in underneath. It is the only moment in six seconds that breathes.
  struck(out, T_ORBIT, 'bell', 'G5', 0.52, -0.1, 'melody');
  out.push(at(T_ORBIT, 'swell', 'D4', 0.5, 0.3, 'harmony'));


  // The line between the cuts: a celesta, dry, because the sequencer is already filling the same
  // two hundred milliseconds and the reflections would only be mud.
  const line = [
    [2.875, 'G5', 0.34], [3.125, 'E5', 0.32], [3.875, 'D6', 0.38], [4.25, 'A5', 0.4],
    [4.625, 'F5', 0.4], [5.25, 'C6', 0.46], [5.5, 'A5', 0.44], [5.75, 'F5', 0.44],
    [6.375, 'D6', 0.4], [6.75, 'B5', 0.42], [7.375, 'D6', 0.56], [7.625, 'G6', 0.6],
  ];
  line.forEach(([time, note, gain], index) => {
    dry(out, time, 'pluck', note, gain, index % 2 === 0 ? -0.26 : 0.26, 'melody');
  });

  // Five sixteenths out of the clay shot and into the button. Every one of them is D, G, A or B —
  // the G major bar it runs over — so the run is a chord being spelled rather than a scale.
  const runOut = [['D6', 0.62], ['G6', 0.66], ['A6', 0.7], ['B6', 0.76], ['D7', 0.82]];
  runOut.forEach(([note, gain], index) => {
    dry(out, 7.875 + index * SIXTEENTH_OPEN, 'pluck', note, gain, index % 2 === 0 ? -0.2 : 0.2, 'melody');
  });

  // --- 0:08.5 the button ---------------------------------------------------
  // C major, staccato, on the bar line and 100 ms ahead of the picture. Nothing rings into black.
  out.push(at(T_BUTTON, 'thud', 'C2', 0.92, 0, 'harmony'));
  chord(out, T_BUTTON, 'stab', [
    ['C3', 0.62, -0.22], ['G3', 0.58, 0.2], ['C4', 0.66, -0.16], ['E4', 0.62, 0.14],
    ['G4', 0.62, -0.1], ['C5', 0.7, 0.12], ['E5', 0.66, -0.08], ['G5', 0.58, 0.16],
    ['C6', 0.54, -0.12],
  ], 0.003, 'harmony', false);

  // --- 0:08.6 the cut to black ---------------------------------------------
  // Nothing. `problems()` refuses an event in this window and the gate measures the samples,
  // because an empty event list says nothing about what is still ringing.

  // --- 0:09.1 a typed sentence ---------------------------------------------
  // One bell and a swell after half a second of silence, then a C major scale climbing eight
  // notes into the next cut. `score-v2` played a typewriter here, on noise, at a gain chosen to
  // be peak-hot; this plays the same rhythm on an instrument with note names.
  struck(out, T_SENTENCE, 'bell', 'C5', 0.36, -0.22, 'melody');
  out.push(at(T_SENTENCE, 'swell', 'G3', 0.52, 0.3, 'harmony'));
  SENTENCE_ONE.forEach((note, index) => {
    const when = T_CHIME_PATH - (SENTENCE_ONE.length - index) * SIXTEENTH_OPEN;
    struck(out, when, 'pluck', note, 0.3 + index * 0.029, index % 2 === 0 ? -0.24 : 0.24, 'melody');
  });

  // --- 0:10.4 Chime Path ---------------------------------------------------
  // The pulse returns on the cut and the motif is stated whole, in the middle of the register, at
  // half the volume of act one. A game called Chime Path gets three chimes over the top of it.
  //
  // It is also the one statement in the film whose fourth note is *consonant*: the bar is F, so
  // the F5 that hangs everywhere else lands on the root of the chord. That is act two's whole
  // argument — this is the part where the thing you are making simply works — and it is why the
  // next statement, at 14.50, has to take the note away again.
  out.push(at(T_CHIME_PATH, 'low', 'C2', 0.44, 0, 'harmony'));
  MOTIF_OPEN.forEach((note, index) => {
    struck(out, T_CHIME_PATH + index * 0.5, 'bell', note, 0.46 + index * 0.034, index % 2 === 0 ? -0.18 : 0.18, 'melody');
  });
  [[10.65, 'E6', 0.34], [11.15, 'G6', 0.34], [11.65, 'C7', 0.32]].forEach(([time, note, gain], index) => {
    dry(out, time, 'pluck', note, gain, index % 2 === 0 ? 0.3 : -0.3, 'melody');
  });

  // --- 0:12.3 a second sentence, faster ------------------------------------
  // Thirteen thirty-seconds in three quarters of a second, over the A minor bar. Dry: at 62 ms
  // apart a reflection at 45 ms lands between the notes and turns the figure into a smear.
  SENTENCE_TWO.forEach((note, index) => {
    dry(out, T_SENTENCE_TWO + index * 0.0625, 'pluck', note, 0.24 + index * 0.009, index % 2 === 0 ? -0.28 : 0.28, 'melody');
  });

  // --- 0:13.1 Evenfall Orchard ---------------------------------------------
  // Three bells falling through A minor — the only minor colour in the film, and it is the
  // relative minor of the key it is already in rather than a change of mode.
  chord(out, T_ORCHARD, 'bell', [['A5', 0.6, -0.18], ['C6', 0.54, 0.2], ['E6', 0.46, -0.08]], 0.012, 'melody', true);
  out.push(at(T_ORCHARD, 'swell', 'A3', 0.5, -0.32, 'harmony'));
  struck(out, 13.6, 'bell', 'G5', 0.48, 0.14, 'melody');
  struck(out, 14, 'bell', 'E5', 0.36, -0.16, 'melody');

  // --- 0:14.5 Before the Bell ----------------------------------------------
  // The motif's first three degrees, an octave up, on the slowest bells in the film — and no
  // fourth note. The shot is called Before the Bell and the bell does not ring; the two withheld
  // things are the same withheld thing. What answers it is 16.00, in a different key.
  out.push(at(T_BELL, 'low', 'C2', 0.42, 0, 'harmony'));
  [['G5', 0.68, -0.16], ['C6', 0.68, 0.14], ['E6', 0.68, -0.1]].forEach(([note, gain, pan], index) => {
    struck(out, T_BELL + index * 0.5, 'bell', note, gain, pan, 'melody');
  });

  // --- 0:16.0 the turn -----------------------------------------------------
  // D major, struck across three octaves, with the C major bells from Before the Bell still
  // ringing over it. That leftover C is the seventh of the new chord, so the turn arrives as a
  // **D7** — a dominant, which points at G, which is where the flash lands 5.7 s later.
  out.push(at(T_TURN, 'low', 'D2', 0.66, 0, 'harmony'));
  out.push(at(T_TURN, 'swell', 'A3', 0.44, -0.32, 'harmony'));
  out.push(at(T_TURN, 'swell', 'F#4', 0.4, 0.34, 'harmony'));
  chord(out, T_TURN, 'bell', [
    ['D4', 0.46, -0.18], ['F#4', 0.44, 0.16], ['A4', 0.46, -0.12], ['D5', 0.54, 0.14],
    ['F#5', 0.56, -0.1], ['A5', 0.58, 0.18], ['D6', 0.6, -0.14], ['F#6', 0.52, 0.12],
  ], 0.007, 'harmony', true);

  // The riser. Thirteen notes up three octaves of D major with every gap 90% of the last, landing
  // 8 ms short of the downbeat at 17.40. There is no pulse under it, which is what hides the 5%
  // tempo change: with nothing steady to compare against, 120 and 126.3 are the same tempo.
  let when = RISER_FROM;
  let gap = RISER_GAP;
  RISER.forEach((note, index) => {
    const late = index >= RISER.length - 4;
    const gain = 0.3 + index * 0.031;
    if (late) struck(out, when, 'glass', note, gain, index % 2 === 0 ? -0.3 : 0.3, 'melody');
    else dry(out, when, 'glass', note, gain, index % 2 === 0 ? -0.3 : 0.3, 'melody');
    when += gap;
    gap *= RISER_RATIO;
  });

  // --- 0:17.4 Emberwake ----------------------------------------------------
  // The band lands on a downbeat in a new key, and the motif is restated **lifted**: a whole tone
  // up, an octave up, and in sixteenths where act one had half notes.
  out.push(at(T_EMBERWAKE, 'low', 'D2', 0.8, 0, 'harmony'));
  // Two swells under the raid, and they are the reason it has a body. Everything hand-struck in
  // act three is a 340 ms `glass`, and a bar of those over a sequencer measured 2 dB *under* the
  // 1.4 s riser that introduced it — the drive was all transient and no tone. A held fifth fixes
  // that with two events, and it is still a pitch in the chord rather than a bed.
  out.push(at(T_EMBERWAKE, 'swell', 'D4', 0.6, -0.3, 'harmony'));
  out.push(at(T_EMBERWAKE, 'swell', 'A4', 0.54, 0.32, 'harmony'));
  chord(out, T_EMBERWAKE, 'bell', [
    ['D4', 0.5, -0.16], ['F#4', 0.48, 0.14], ['A4', 0.5, -0.1], ['D5', 0.6, 0.14], ['A5', 0.58, -0.12], ['D6', 0.62, 0.1],
  ], 0.006, 'harmony', true);
  MOTIF_DRIVE.forEach((note, index) => {
    dry(out, T_EMBERWAKE + index * SIXTEENTH_DRIVE * 2, 'glass', note, 0.6 + index * 0.05, index % 2 === 0 ? -0.2 : 0.18, 'melody');
  });
  // The answer: the same four notes coming back down, so the phrase is a phrase and not a fanfare.
  [['F#6', 0.58], ['D6', 0.56], ['A5', 0.54], ['D6', 0.6]].forEach(([note, gain], index) => {
    dry(out, 18.35 + index * SIXTEENTH_DRIVE * 2, 'glass', note, gain, index % 2 === 0 ? -0.16 : 0.14, 'melody');
  });

  // --- 0:19.3 the gauntlet -------------------------------------------------
  // The chord moves to B minor on the cut — vi, the only minor triad in act three, which adds
  // urgency without adding darkness — and the motif is played four times in 1.9 s, each statement
  // starting three degrees above the last. Rising sequence is escalation by *density and
  // register*, which is what the brief asked for instead of a flattened degree.
  out.push(at(T_GAUNTLET, 'low', 'B1', 0.7, 0, 'harmony'));
  out.push(at(T_GAUNTLET, 'swell', 'B3', 0.6, 0.3, 'harmony'));
  out.push(at(T_GAUNTLET, 'swell', 'F#4', 0.54, -0.32, 'harmony'));
  chord(out, T_GAUNTLET, 'bell', [
    ['B3', 0.5, -0.16], ['F#4', 0.48, 0.14], ['B4', 0.56, -0.1], ['D5', 0.54, 0.16], ['F#5', 0.58, -0.12], ['B5', 0.56, 0.1],
  ], 0.006, 'harmony', true);
  SEQUENCE.forEach((statement, group) => {
    statement.forEach((note, index) => {
      dry(
        out,
        T_GAUNTLET + group * BEAT_DRIVE + index * SIXTEENTH_DRIVE,
        'glass',
        note,
        0.55 + group * 0.075 + index * 0.022,
        index % 2 === 0 ? -0.22 : 0.2,
        'melody',
      );
    });
  });

  // --- 0:21.2 the magazine, and the drop -----------------------------------
  // The sequencer stops on this frame. Six notes climb out of the top of the mix, each quieter
  // than the last, and the final 95 ms have nothing in them at all. That hole is the only reason
  // the next event reads as big: the step is measured, and it is what makes the moment have shape.
  VANISH.forEach(([time, note, gain], index) => {
    dry(out, time, 'glass', note, gain, index % 2 === 0 ? -0.3 : 0.3, 'melody');
  });

  // --- 0:21.73 the white flash ---------------------------------------------
  // G major, fifteen bells and a low G1, rolled 1.8 ms so the peak lands inside the one white
  // frame. The motif's hanging fourth is G, and this is a G chord: the note that has been
  // unresolved since 0:02.5 is now the root of the loudest thing in the film.
  out.push(at(T_FLASH, 'low', 'G1', 0.95, 0, 'harmony'));
  chord(out, T_FLASH, 'blaze', FLASH_CHORD, 0.0002, 'harmony', FLASH_ECHO_FROM);
  struck(out, T_FLASH, 'glass', 'G7', 0.5, 0.24, 'melody');

  // --- 0:22.2 embers -------------------------------------------------------
  // A major, on the beat the deck restarts on, chosen so that its next two downbeats fall exactly
  // on first light and on the end card. Three notes of the motif over it, hanging on G again.
  out.push(at(T_RETURN, 'low', 'A2', 0.5, 0, 'harmony'));
  chord(out, T_RETURN, 'bell', [['A4', 0.44, -0.16], ['C#5', 0.42, 0.14], ['E5', 0.46, -0.1]], 0.008, 'harmony', true);
  dry(out, 22.675, 'glass', 'A6', 0.4, 0.28, 'melody');
  dry(out, 22.9125, 'glass', 'E6', 0.38, -0.28, 'melody');
  MOTIF_DRIVE.forEach((note, index) => {
    struck(out, T_EMBERS_PHRASE + index * BEAT_DRIVE / 2, 'bell', note, 0.5 + index * 0.034, index % 2 === 0 ? -0.18 : 0.16, 'melody');
  });

  // --- 0:24.1 first light --------------------------------------------------
  // Home, on a downbeat, with the motif stated complete and slowly for the only time in act three
  // — one note per beat. It still ends on the G.
  out.push(at(T_FIRST_LIGHT, 'low', 'D2', 0.62, 0, 'harmony'));
  out.push(at(T_FIRST_LIGHT, 'swell', 'A4', 0.5, -0.3, 'harmony'));
  out.push(at(T_FIRST_LIGHT, 'swell', 'D5', 0.45, 0.32, 'harmony'));
  chord(out, T_FIRST_LIGHT, 'bell', [['D4', 0.5, -0.16], ['F#4', 0.48, 0.14], ['A4', 0.5, -0.1], ['D5', 0.54, 0.12]], 0.008, 'harmony', true);
  MOTIF_DRIVE.forEach((note, index) => {
    struck(out, T_FIRST_LIGHT + index * BEAT_DRIVE, 'bell', note, 0.56 + index * 0.04, index % 2 === 0 ? -0.18 : 0.16, 'melody');
  });
  dry(out, 24.8125, 'glass', 'D7', 0.34, 0.3, 'melody');
  dry(out, 25.2875, 'glass', 'A6', 0.36, -0.3, 'melody');

  // --- 0:26.0 the end card -------------------------------------------------
  // D major, and the G6 that has been hanging since 25.525 falls to F♯6 inside it. That is the
  // whole argument of the piece in one semitone, and it is the last melodic event in the file.
  out.push(at(T_END_CARD, 'low', 'D2', 0.85, 0, 'harmony'));
  out.push(at(T_END_CARD, 'swell', 'D3', 0.6, -0.3, 'harmony'));
  out.push(at(T_END_CARD, 'swell', 'A3', 0.55, 0.32, 'harmony'));
  chord(out, T_END_CARD, 'bell', [
    ['D3', 0.58, -0.2], ['A3', 0.54, 0.18], ['D4', 0.62, -0.14], ['F#4', 0.58, 0.16],
    ['A4', 0.6, -0.1], ['D5', 0.66, 0.12], ['A5', 0.62, -0.16],
  ], 0.009, 'harmony', true);
  struck(out, T_END_CARD + 0.014, 'bell', 'F#6', 0.74, 0.06, 'melody');

  // The chord re-struck, because 3.92 s of card outlasts a 2.6 s envelope by a second and a half
  // and there is no sustain stage anywhere in this package to hold it with.
  chord(out, T_RESTRIKE, 'glow', [
    ['D5', 0.36, -0.12], ['F#5', 0.34, 0.14], ['A5', 0.32, -0.08], ['D6', 0.36, 0.1], ['F#6', 0.38, 0.06],
  ], 0.012, 'harmony', false);
  chord(out, T_RESTRIKE_TWO, 'glow', [
    ['D5', 0.2, 0.12], ['F#5', 0.19, -0.14], ['A5', 0.18, 0.08], ['D6', 0.21, -0.1],
  ], 0.012, 'harmony', false);
  // One glint over the second re-strike, and then the file is over. Nothing struck anywhere here
  // has an envelope that reaches the final sample, which is what makes the truncation silent.
  dry(out, T_LAST, 'pluck', 'D6', 0.22, -0.18, 'melody');
  dry(out, T_LAST + 0.15, 'pluck', 'F#6', 0.2, 0.16, 'melody');

  out.sort((a, b) => a.at - b.at);
  return out;
}

export const EVENTS = events();

/** The whole sound table, generated from the events, so a declared-and-never-played is impossible. */
function table(from) {
  const out = {};
  for (const event of from) {
    if (out[event.id] !== undefined) continue;
    const make = INSTRUMENTS[event.kind];
    if (make === undefined) throw new RangeError(`table: no instrument called ${event.kind}`);
    out[event.id] = make(hz(event.note));
  }
  return out;
}

export const SOUNDS = table(EVENTS);

// ---------------------------------------------------------------------------
// The sequencer
// ---------------------------------------------------------------------------

/**
 * A kick out of one oscillator: a sine swept to a third of itself in a tenth of a second.
 *
 * A sequencer track is **one voice with no layers**, so a drum that needs a body *and* an attack
 * has to be spelled as two tracks on the same steps. There is no other way to put a click on a
 * kick, and the two can drift apart the moment anything mutes one of them.
 */
const KICK_SOFT = { wave: 'sine', gain: 0.13, hold: 0.11, cutoff: 380, sweepTo: 0.36, fixedHz: 96 };
const KICK_HARD = { wave: 'sine', gain: 0.15, hold: 0.115, cutoff: 400, sweepTo: 0.34, fixedHz: 104 };
const BEATER = { wave: 'noise', gain: 0.024, hold: 0.012, highpass: 900, cutoff: 4200 };

/**
 * **What the deck can and cannot spell, and why act one gets a major third.**
 *
 * The deck transposes an entire track by the bar's root, so an interval written into a track must
 * be consonant with *every* chord in the progression. The usual consequence — and it is what
 * `tools/trailer/score/` and `score-v2` both concluded — is roots, fifths and octaves only, with
 * the thirds struck by hand.
 *
 * That is true in general and false for a progression built on I, IV and V. Over `C F G` the major
 * third above each root is `E A B`, and all three are in C major; over `A D` in act three's second
 * window they are `C♯ F♯`, and both are in D major. So those two songs may state the third and are
 * unambiguously major without a single hand-struck note — which is a real, cheap, upbeat lever.
 *
 * Over `F Am C` and `D Bm` the thirds are `A C♯ E` and `F♯ D♯`, and two of those are outside the
 * key. Those songs get roots, fifths, octaves and **ninths** instead (`G B D` and `E C♯`), which
 * are all diatonic and are the next brightest thing available.
 *
 * `problems()` checks the whole claim from the arrays rather than trusting this paragraph.
 */

/** **Act one.** `C – F – G`, one bar each, which is the entire montage. A layer arrives on each bar. */
export const SONG_OPEN = {
  bpm: BPM_OPEN,
  steps: 16,
  rootHz: hz('C2'),
  progression: [0, 5, 7],
  seed: 11,
  tracks: [
    { id: 'kick', voice: KICK_SOFT, notes: [{ step: 0 }, { step: 8 }], minIntensity: 0.2 },
    { id: 'beat', voice: BEATER, notes: [{ step: 0 }, { step: 8 }], minIntensity: 0.2 },
    {
      id: 'bass',
      voice: { wave: 'triangle', gain: 0.07, hold: 0.4, cutoff: 320 },
      notes: [{ step: 0 }, { step: 3, semis: 7 }, { step: 6, semis: 12 }, { step: 8 }, { step: 11, semis: 7 }, { step: 14, semis: 12 }],
      minIntensity: 0.15,
    },
    {
      id: 'hat',
      voice: { wave: 'noise', gain: 0.04, hold: 0.028, highpass: 7500, cutoff: 13500 },
      notes: [{ step: 2 }, { step: 6 }, { step: 10 }, { step: 14 }],
      minIntensity: 0.35,
    },
    {
      // The arpeggio, and the only sequenced third in the first half of the film. `+28` is a major
      // third two octaves up; over `C F G` it spells `E A B` and every one of them is in the key.
      id: 'arp',
      voice: { wave: 'triangle', gain: 0.075, hold: 0.28, cutoff: 4400 },
      notes: [
        { step: 1, semis: 24 }, { step: 2, semis: 28 }, { step: 4, semis: 31 }, { step: 5, semis: 36 },
        { step: 7, semis: 28 }, { step: 9, semis: 24 }, { step: 10, semis: 31 }, { step: 12, semis: 36 },
        { step: 13, semis: 31 }, { step: 15, semis: 28 },
      ],
      melodic: true,
      drop: 0.1,
      minIntensity: 0.5,
    },
    { id: 'kick2', voice: KICK_SOFT, notes: [{ step: 4 }, { step: 12 }], minIntensity: 0.75 },
    {
      // A held fifth and octave in the steps nothing else speaks on. Emberwake learned this the
      // expensive way: its escalation measured 1 dB *quieter* than the bar before it, because
      // every sequenced part was short and the hand-struck line was carrying the crescendo alone.
      id: 'shine',
      voice: { wave: 'triangle', gain: 0.055, hold: 0.8, cutoff: 2400 },
      notes: [{ step: 5, semis: 19 }, { step: 12, semis: 24 }],
      melodic: true,
      minIntensity: 0.65,
    },
    {
      id: 'shake',
      voice: { wave: 'noise', gain: 0.032, hold: 0.018, highpass: 9000, cutoff: 15000 },
      notes: [{ step: 1 }, { step: 3 }, { step: 5 }, { step: 7 }, { step: 9 }, { step: 11 }, { step: 13 }, { step: 15 }],
      minIntensity: 0.8,
    },
  ],
};

/**
 * **Act two.** `F – Am – C`, one bar each, and the whole act is a third the weight of act one.
 *
 * The loudest step here sums to 0.16 where act one's sums to 0.22 and act three's to 0.30. The act
 * is one person at a desk, and the only thing that should be able to compete with what they are
 * writing is what they are writing.
 *
 * The plagal opening matters more than it looks. `F` under Chime Path, `Am` under the second
 * sentence and the orchard, `C` under Before the Bell — and then `C` moving to `D` at 16.00 is a
 * whole-tone lift, which is the single most recognizable "and now everything is bigger" move in
 * the language and costs one number in this array.
 */
export const SONG_WRITE = {
  bpm: BPM_OPEN,
  steps: 16,
  rootHz: hz('C2'),
  progression: [5, 9, 0],
  seed: 7,
  tracks: [
    {
      id: 'desk',
      voice: { wave: 'sine', gain: 0.08, hold: 0.45, cutoff: 260 },
      notes: [{ step: 0 }, { step: 8, semis: 12 }],
    },
    { id: 'kick', voice: KICK_SOFT, notes: [{ step: 0 }, { step: 8 }], minIntensity: 0.3 },
    {
      id: 'tap',
      voice: { wave: 'noise', gain: 0.022, hold: 0.012, highpass: 3200, cutoff: 9000 },
      notes: [{ step: 4 }, { step: 12 }],
    },
    {
      // Ninths only, never thirds: over `F Am C` a third would be `A C♯ E` and the second of those
      // is outside the key, so the film would leave C major inside its own quietest act.
      id: 'walk',
      voice: { wave: 'triangle', gain: 0.06, hold: 0.24, cutoff: 3000 },
      notes: [{ step: 2, semis: 24 }, { step: 6, semis: 31 }, { step: 10, semis: 26 }, { step: 14, semis: 31 }],
      melodic: true,
      minIntensity: 0.38,
    },
    {
      id: 'glassy',
      voice: { wave: 'triangle', gain: 0.05, hold: 0.45, cutoff: 4600 },
      notes: [{ step: 1, semis: 36 }, { step: 5, semis: 43 }, { step: 9, semis: 38 }, { step: 11, semis: 36 }, { step: 13, semis: 43 }],
      melodic: true,
      drop: 0.12,
      minIntensity: 0.5,
    },
    {
      // Under the whole act rather than only the last shot. A game called Chime Path is the one
      // thing in this film that is not allowed to be dull on top.
      id: 'hat',
      voice: { wave: 'noise', gain: 0.028, hold: 0.03, highpass: 6800, cutoff: 13500 },
      notes: [{ step: 2 }, { step: 6 }, { step: 10 }, { step: 14 }],
      minIntensity: 0.44,
    },
    {
      id: 'shake',
      voice: { wave: 'noise', gain: 0.026, hold: 0.016, highpass: 9000, cutoff: 15000 },
      notes: [{ step: 3 }, { step: 7 }, { step: 11 }, { step: 15 }],
      minIntensity: 0.72,
    },
  ],
};

/**
 * **Act three, the raid.** `D – Bm`, one bar per picture cut, at 126.3 bpm so that both land.
 *
 * Double-time is what makes this read as faster rather than as 5% faster: four on the floor, an
 * ostinato on ten of sixteen steps, and two hi-hat parts. The tempo barely moves; the *pulse* the
 * ear counts doubles.
 */
export const SONG_DRIVE = {
  bpm: BPM_DRIVE,
  steps: 16,
  rootHz: hz('D2'),
  progression: [0, -3],
  seed: 19,
  tracks: [
    { id: 'kick', voice: KICK_HARD, notes: [{ step: 0 }, { step: 4 }, { step: 8 }, { step: 12 }] },
    { id: 'beat', voice: BEATER, notes: [{ step: 0 }, { step: 4 }, { step: 8 }, { step: 12 }] },
    {
      id: 'bass',
      voice: { wave: 'triangle', gain: 0.095, hold: 0.36, cutoff: 340 },
      notes: [{ step: 0 }, { step: 3 }, { step: 6, semis: 12 }, { step: 8 }, { step: 11, semis: 7 }, { step: 14, semis: 12 }],
    },
    {
      // Roots, fifths, octaves and the ninth. Over `D Bm` a third would be `F♯ D♯` and the second
      // of those is not in D major.
      id: 'ost',
      voice: { wave: 'triangle', gain: 0.11, hold: 0.24, cutoff: 6000 },
      notes: [
        { step: 1, semis: 24 }, { step: 2, semis: 31 }, { step: 4, semis: 26 }, { step: 5, semis: 36 },
        { step: 7, semis: 31 }, { step: 9, semis: 24 }, { step: 10, semis: 31 }, { step: 12, semis: 38 },
        { step: 13, semis: 36 }, { step: 15, semis: 31 },
      ],
      melodic: true,
      drop: 0.08,
      minIntensity: 0.5,
    },
    {
      // Eighths from the first bar, sixteenths from the second. The escalation between 17.40 and
      // 19.30 has to be audible as *more* rather than as louder, and the top octave is where a
      // listener counts density: two hi-hat parts is the cheapest air there is.
      id: 'hat',
      voice: { wave: 'noise', gain: 0.055, hold: 0.03, highpass: 7500, cutoff: 13500 },
      notes: [{ step: 0 }, { step: 2 }, { step: 4 }, { step: 6 }, { step: 8 }, { step: 10 }, { step: 12 }, { step: 14 }],
      minIntensity: 0.4,
    },
    {
      id: 'shake',
      voice: { wave: 'noise', gain: 0.042, hold: 0.018, highpass: 9500, cutoff: 15500 },
      notes: [{ step: 1 }, { step: 3 }, { step: 5 }, { step: 7 }, { step: 9 }, { step: 11 }, { step: 13 }, { step: 15 }],
      minIntensity: 0.9,
    },
    {
      id: 'ring',
      voice: { wave: 'triangle', gain: 0.09, hold: 0.85, cutoff: 4800 },
      notes: [{ step: 0, semis: 36 }, { step: 9, semis: 43 }],
      melodic: true,
      minIntensity: 0.8,
    },
  ],
};

/**
 * **Act three, the resolution.** `A – D` — V then I — and its two downbeats are first light and
 * the end card.
 *
 * This is the one song that may state a third, because over `A D` the thirds are `C♯ F♯` and both
 * are in the key. So the brightest section of the film is also the only sequenced one that spells
 * a major triad by itself. It is a little lighter than the raid and considerably higher.
 */
export const SONG_SURGE = {
  bpm: BPM_DRIVE,
  steps: 16,
  rootHz: hz('D2'),
  progression: [7, 0],
  seed: 23,
  tracks: [
    { id: 'kick', voice: KICK_HARD, notes: [{ step: 0 }, { step: 4 }, { step: 8 }, { step: 12 }] },
    { id: 'beat', voice: BEATER, notes: [{ step: 0 }, { step: 8 }] },
    {
      id: 'bass',
      voice: { wave: 'triangle', gain: 0.09, hold: 0.4, cutoff: 340 },
      notes: [{ step: 0 }, { step: 4, semis: 7 }, { step: 8 }, { step: 11, semis: 12 }, { step: 14, semis: 7 }],
    },
    {
      id: 'ost',
      voice: { wave: 'triangle', gain: 0.105, hold: 0.26, cutoff: 6400 },
      notes: [
        { step: 1, semis: 28 }, { step: 2, semis: 31 }, { step: 4, semis: 36 }, { step: 6, semis: 31 },
        { step: 8, semis: 28 }, { step: 10, semis: 36 }, { step: 12, semis: 40 }, { step: 14, semis: 36 },
      ],
      melodic: true,
      drop: 0.06,
      minIntensity: 0.45,
    },
    {
      id: 'hat',
      voice: { wave: 'noise', gain: 0.05, hold: 0.03, highpass: 7500, cutoff: 13500 },
      notes: [{ step: 0 }, { step: 2 }, { step: 4 }, { step: 6 }, { step: 8 }, { step: 10 }, { step: 12 }, { step: 14 }],
      minIntensity: 0.4,
    },
    {
      id: 'shake',
      voice: { wave: 'noise', gain: 0.038, hold: 0.018, highpass: 9500, cutoff: 15500 },
      notes: [{ step: 1 }, { step: 3 }, { step: 5 }, { step: 7 }, { step: 9 }, { step: 11 }, { step: 13 }, { step: 15 }],
      minIntensity: 0.85,
    },
    {
      id: 'ring',
      voice: { wave: 'triangle', gain: 0.085, hold: 0.9, cutoff: 5000 },
      notes: [{ step: 0, semis: 40 }, { step: 9, semis: 43 }],
      melodic: true,
      minIntensity: 0.65,
    },
  ],
};

/** Every song, with its key and its window, so {@link problems} can audit it from the arrays. */
const SONGS = [
  { name: 'open', song: SONG_OPEN, tonic: KEY_OPEN, root: 'C2', window: DECK_OPEN },
  { name: 'write', song: SONG_WRITE, tonic: KEY_OPEN, root: 'C2', window: DECK_WRITE },
  { name: 'drive', song: SONG_DRIVE, tonic: KEY_DRIVE, root: 'D2', window: DECK_DRIVE },
  { name: 'surge', song: SONG_SURGE, tonic: KEY_DRIVE, root: 'D2', window: DECK_SURGE },
];

/**
 * How busy the sequencer is at a given moment. A staircase, and every riser is a bar line.
 *
 * **The earliest riser a window can hold is `from + LOOKAHEAD_SEC`**, and this is the sharpest edge
 * in the deck's API. `deck.play` pumps immediately and schedules a bar and a half in one go at
 * whatever the intensity happens to be *then*, so a change written inside the first 1.5 s of a
 * song is read too late to affect anything and is silently ignored.
 *
 * Act one gets three risers because it is six seconds long. Act three's windows are 1.9 s each,
 * which is 0.4 s of room, so each is played at one level and the escalation lives between them.
 */
function intensityAt(seconds) {
  // Act one: kick and bass, then the hat, then the arpeggio, then everything.
  if (seconds < 4.5) return 0.25;
  if (seconds < T_ORBIT) return 0.55;
  // "No ground at all": the floor is pulled out for one shot and the bass is the only thing left.
  if (seconds < T_CLAY) return 0.18;
  if (seconds < T_BUTTON) return 0.9;
  // Act two: thin, then a layer for the orchard, then one more into the turn.
  if (seconds < T_SENTENCE_TWO) return 0.4;
  if (seconds < T_BELL) return 0.55;
  if (seconds < T_TURN) return 0.8;
  // Act three: one level per window, because a 1.9 s window cannot hold a riser.
  if (seconds < T_GAUNTLET) return 0.85;
  if (seconds < T_MAGAZINE) return 1;
  if (seconds < T_FIRST_LIGHT) return 0.7;
  return 0.9;
}

// ---------------------------------------------------------------------------
// Performing it
// ---------------------------------------------------------------------------

/**
 * The master fader, at the top of its range — and it is not enough.
 *
 * `Mixer.setGain` clamps into `[0, 1]`, `PlayOptions.gain` clamps into `[0, 1]`, and every recipe
 * gain is a fraction chosen so that {@link validateSounds} can prove one *sound* cannot clip.
 * Nothing in the package has a gain stage that can exceed one, so a finished mix arrives wherever
 * the arithmetic left it and there is nothing inside `@latticekit/audio` that can bring it to a
 * delivery level. Raising the recipes is not the answer: the validators would then correctly
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
 * and two renders of two edits would then sit at two different levels. `render.mjs` prints the
 * peak after applying it and `build.mjs` refuses a master outside a window around −1.00 dBFS.
 */
export const OUTPUT_TRIM = 1.205;

/**
 * The voice ceiling, raised, and the first place this score argues with the package.
 *
 * A voice is counted against the ceiling until its **scheduled end**, and a bell's scheduled end
 * is 2.6 s after it was struck. The default 24 therefore permits about four bells in any
 * three-second window across the entire piece, which is a sensible defense against a burst of
 * gameplay sounds and is not a budget a piece of music can be written inside. The flash alone is
 * sixteen sounds and forty-eight reflections. The sequencer bypasses the ceiling entirely, so the
 * same notes played from a song cost nothing; only music written as one-shots pays.
 */
const MAX_VOICES = 768;

/** How often the deck is pumped, in seconds of the injected clock. Finer than the deck's own timer. */
const PUMP_SEC = 0.05;

/**
 * Build an engine on `context`, schedule the whole piece into it, and hand back the parts.
 *
 * The clock is injected and driven by hand, which is what makes this render offline and
 * deterministic: nothing here reads `currentTime`, so all thirty seconds are scheduled before a
 * single sample is computed and the result cannot depend on how fast the machine is.
 *
 * @param context an `OfflineAudioContext`, or a real one for an audition
 * @param options.stems which of {@link STEMS} to include — omit for all three
 * @param options.pumpAt a function returning the next clock time to pump at, for the determinism
 *   check. With the intensity held still a jittering cadence must produce the **same set of notes
 *   at the same times and gains**; only the order they are emitted in may change, and that is the
 *   pump's order rather than the music's
 * @param options.plans an array to collect a line per `VoicePlan` into. The plan object is reused
 *   by the engine, so what is pushed is a string and not the object
 * @param options.intensity overrides {@link intensityAt}. Only the determinism check uses it: the
 *   deck reads its intensity at *schedule* time, so a score whose intensity moves cannot be
 *   compared across two pump cadences without holding it still first
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
    maxPan: MAX_PAN,
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
  // game — the theme must not bury the alarm — and wrong for a trailer, where the theme is all
  // there is.
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
    for (const { song, window } of SONGS.map(({ song, window }) => ({ song, window }))) {
      // No `fadeSec`, and it is not a stylistic choice. The deck's fade-in is evaluated per note as
      // `(at - startedAt) / fadeSec`, which is exactly **0** on the first step, and a step whose
      // fade is zero is skipped outright. Any positive fade therefore silently deletes the
      // downbeat the song starts on — which here is the hit on every act-three picture cut.
      timeline.push({ at: window.from, order: 0, run: () => deck.play(song, { fadeSec: 0 }) });
      // Stopping the sequencer on an exact instant takes three calls and a subtraction, because
      // there is no "schedule up to time X": a pump always reaches LOOKAHEAD_SEC and no further.
      // So the last pump is forced at exactly `to - LOOKAHEAD_SEC`, where its horizon lands on the
      // landmark, and the stop follows it in the same instant. Left to the ordinary cadence the
      // *music* becomes a function of the timer, which is a missing bar and a half.
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

// ---------------------------------------------------------------------------
// Everything that can be checked without listening
// ---------------------------------------------------------------------------

/**
 * The exponential floor every decay in this package lands on. `render.ts` writes
 * `exponentialRampToValueAtTime(0.0001, end)` because a ramp to zero is a spec violation, so this
 * is the shape of *every* envelope here and there is no way to ask for another.
 */
const GAIN_FLOOR = 0.0001;

/** How loud one event still is at `when`, in linear gain, summed over its layers. */
function levelAt(event, definition, when) {
  let total = 0;
  for (const layer of definition.layers) {
    const life = (layer.attack ?? 0.006) + Math.max(0, layer.hold);
    const begins = event.at + (layer.delay ?? 0);
    const t = when - begins;
    if (t <= 0 || t >= life) continue;
    const peak = layer.gain * (event.gain ?? 1);
    if (peak <= GAIN_FLOOR) continue;
    // @tier-b: presentation only. Printed to a human, never hashed and never persisted.
    total += peak * (GAIN_FLOOR / peak) ** (t / life);
  }
  return total;
}

/** Anything quieter than this at a hard edge is inaudible under a cut. −60 dBFS. */
const TRUNCATION_CEILING = 0.001;

/** The longest a noise layer may hold anywhere in the file. Past this it stops being a transient. */
const NOISE_TRANSIENT_SEC = 0.05;

/** Every pitch class an act can sound, as semitones above that act's tonic. */
function degrees() {
  const open = new Set();
  const drive = new Set();
  for (const event of EVENTS) {
    if (event.at >= T_TURN) drive.add(degreeIn(KEY_DRIVE, event.note));
    else open.add(degreeIn(KEY_OPEN, event.note));
  }
  for (const { song, tonic, root } of SONGS) {
    const into = tonic === KEY_DRIVE ? drive : open;
    const offset = (((classOf(root) - classOf(tonic)) % 12) + 12) % 12;
    for (const track of song.tracks) {
      if (track.voice.fixedHz !== undefined) continue;
      for (const bar of song.progression) {
        for (const note of track.notes) into.add((((offset + bar + (note.semis ?? 0)) % 12) + 12) % 12);
      }
    }
  }
  return { open, drive };
}

/** The highest pitch, in semitones above A2, that a set of events reaches. */
function ceilingOf(from, predicate) {
  let best = -Infinity;
  for (const event of from) {
    if (!predicate(event)) continue;
    const accidental = event.note[1] === '#' ? 1 : event.note[1] === 'b' ? -1 : 0;
    const octave = Number(event.note.slice(accidental === 0 ? 1 : 2));
    best = Math.max(best, (octave - 2) * 12 + PITCH_CLASS[event.note[0]] + accidental);
  }
  return best;
}

/**
 * Everything the package can tell us about this score without rendering it, plus the eleven things
 * it cannot. Run before every render — a table fault is a worse sound with no error, and
 * `build.mjs` exits non-zero if this returns anything at all.
 *
 * The extra checks exist because this commission is a set of *claims about the music*, and a claim
 * that is only written in a comment is a claim that stops being true in the first edit after it.
 *
 * | check | what it would otherwise cost |
 * |---|---|
 * | every event is a named pitch | the whole commission — sound design creeping back in one hit at a time |
 * | every noise layer holds under 50 ms | a noise *bed*, which is the same defect wearing a different hat |
 * | no pitch sweep outside a kick drum | a falling-pitch "impact", which is sound design spelled as music |
 * | acts one and two inside C major, act three inside D major | the harmonic argument, silently |
 * | both tonic **major thirds** actually sound | "in a major scale" is not the same as "major" |
 * | every song's progression has two distinct roots | a pedal drone, which is what dark scores default to |
 * | act three's motif is higher and faster than act one's | the transformation being a lift rather than a flattening |
 * | the last melodic note is the tonic's major third | the film ending somewhere that feels good |
 * | nothing struck inside the cut to black | the hinge of the film, played through |
 * | nothing above −60 dBFS on the final sample | a click instead of an ending |
 * | every event inside the render | a note written into a file that has already finished |
 *
 * The fault `validateSounds` documents as the one it *cannot* see — a sound declared and never
 * played — is inexpressible here, because {@link SOUNDS} is generated from {@link EVENTS}.
 */
export function problems() {
  const found = [
    ...validateSounds(SOUNDS).map((p) => `sound ${p.sound}: ${p.code} — ${p.message}`),
    ...SONGS.flatMap(({ name, song }) =>
      validateSong(song).map((p) => `song ${name} ${p.track ?? '(song)'}: ${p.code} — ${p.message}`),
    ),
  ];

  // --- there is no sound design in this file, and that is checkable ---------
  for (const event of EVENTS) {
    if (typeof event.note !== 'string' || PITCH_CLASS[event.note[0]] === undefined) {
      found.push(`event ${event.id} at ${event.at} s has no note name — every event in this score is a pitch`);
    }
    if (INSTRUMENTS[event.kind] === undefined) {
      found.push(`event at ${event.at} s names no instrument called ${event.kind}`);
    }
  }
  for (const [id, definition] of Object.entries(SOUNDS)) {
    for (const layer of definition.layers) {
      if (layer.wave === 'noise' && layer.hold > NOISE_TRANSIENT_SEC) {
        found.push(`sound ${id} holds noise for ${layer.hold} s — over ${NOISE_TRANSIENT_SEC} it is a bed, not a mallet`);
      }
    }
  }
  for (const { name, song } of SONGS) {
    for (const track of song.tracks) {
      if (track.voice.wave === 'noise' && track.voice.hold > NOISE_TRANSIENT_SEC) {
        found.push(`song ${name} track ${track.id} holds noise for ${track.voice.hold} s — that is a bed`);
      }
      if (track.voice.sweepTo !== undefined && !track.id.startsWith('kick')) {
        found.push(`song ${name} track ${track.id} sweeps its pitch — a falling-pitch gesture outside a kick drum is an effect`);
      }
    }
    const roots = new Set(song.progression);
    if (roots.size < 2) {
      found.push(`song ${name} sits on ${roots.size} root — a progression that does not move is a drone`);
    }
  }

  // --- it is major, in both keys, and the second key is higher --------------
  const { open, drive } = degrees();
  const NAMES = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];
  for (const degree of open) {
    if (!MAJOR.includes(degree)) found.push(`the ${NAMES[degree]} sounds before ${T_TURN} s — acts one and two are C major and nothing else`);
  }
  for (const degree of drive) {
    if (!MAJOR.includes(degree)) found.push(`the ${NAMES[degree]} sounds after ${T_TURN} s — act three is D major and nothing else`);
  }
  if (!open.has(4)) found.push('the major third of C never sounds — "in a major scale" is not the same as "major"');
  if (!drive.has(4)) found.push('the major third of D never sounds in act three');

  // --- the motif is lifted, not flattened ----------------------------------
  const actOne = ceilingOf(EVENTS, (event) => event.at < T_BLACK && event.stem === 'melody');
  const actThree = ceilingOf(EVENTS, (event) => event.at >= T_TURN && event.stem === 'melody');
  if (!(actThree > actOne)) {
    found.push(`act three tops out at ${actThree} semitones over A2 and act one at ${actOne} — the transformation has to go up`);
  }
  const openGap = 0.5;
  if (!(SIXTEENTH_DRIVE * 2 < openGap)) {
    found.push('act three states the motif no faster than act one — the transformation has to be a diminution');
  }
  const last = [...EVENTS].reverse().find((event) => event.stem === 'melody' && event.kind === 'bell');
  if (last === undefined || degreeIn(KEY_DRIVE, last.note) !== 4) {
    found.push(`the last struck melody note is ${last?.note ?? 'nothing'} — the film has to end on the major third of D`);
  }

  // --- the hinge, the edges, and the ending ---------------------------------
  for (const event of EVENTS) {
    const definition = SOUNDS[event.id];
    if (definition === undefined) {
      found.push(`event at ${event.at} s: no sound called ${event.id}`);
      continue;
    }
    if (event.at < 0 || event.at > DURATION_SEC) {
      found.push(`event ${event.id} at ${event.at} s is outside the render`);
    }
    if (event.at >= T_BLACK && event.at < T_BLACK_END) {
      found.push(`event ${event.id} at ${event.at} s is inside the cut to black — that half second is the hinge of the film`);
    }
    const level = levelAt(event, definition, DURATION_SEC);
    if (level > TRUNCATION_CEILING) {
      found.push(
        `event ${event.id} at ${event.at} s is still at ${(20 * Math.log10(level)).toFixed(1)} dBFS when the file ends — that step is a click`,
      );
    }
  }

  return found;
}

/** The landmarks, for the edit and for the analysis to rule onto the picture. */
export const CUES = {
  lamp: T_LAMP,
  wordmark: T_WORDMARK,
  crowd: T_CROWD,
  canyon: T_CANYON,
  caverns: T_CAVERNS,
  orbit: T_ORBIT,
  clay: T_CLAY,
  button: T_BUTTON,
  /** The hinge. Half a second of nothing. */
  black: [T_BLACK, T_BLACK_END],
  sentence: T_SENTENCE,
  chimePath: T_CHIME_PATH,
  sentenceTwo: T_SENTENCE_TWO,
  orchard: T_ORCHARD,
  beforeTheBell: T_BELL,
  /** Where D major arrives. The third sync point. */
  turn: T_TURN,
  emberwake: T_EMBERWAKE,
  gauntlet: T_GAUNTLET,
  magazine: T_MAGAZINE,
  /** The one instant that cannot move. Everything else here is allowed to breathe. */
  flash: T_FLASH,
  /** The run-up the drop lives in, and the frame before the chord. */
  drop: [T_MAGAZINE, T_FLASH],
  returnAt: T_RETURN,
  firstLight: T_FIRST_LIGHT,
  endCard: T_END_CARD,
  restrike: T_RESTRIKE,
  /** Every bar line the sequencer actually plays, in all four windows. */
  bars: SONGS.flatMap(({ song, window }) => {
    const bar = 240 / song.bpm;
    return Array.from({ length: Math.ceil((window.to - window.from) / bar) }, (unused, index) => window.from + index * bar);
  }),
  /** Where each sequencer window stops scheduling. */
  stops: DECK_WINDOWS.map((window) => window.to),
  /** The sixteenth grid, per window, for the transient alignment check. */
  grid: SONGS.flatMap(({ song, window }) => {
    const step = 60 / song.bpm;
    return Array.from({ length: Math.ceil((window.to - window.from) / step) + 1 }, (unused, index) => window.from + index * step);
  }),
};
