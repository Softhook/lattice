/**
 * **Lattice — thirty seconds of music for the three-act trailer.**
 *
 * Every sample is synthesized by `@latticekit/audio`. No sample file, no loop, no downloaded
 * instrument, no second runtime dependency. A kit whose first claim is *zero assets* cannot
 * advertise itself over a stock music download without contradicting itself in its own
 * soundtrack, so this is the whole point of the exercise and not a constraint imposed on it.
 *
 * This is the **third** score in the repo and it deliberately quotes the second.
 * `tools/trailer/score/` is the launch montage; `tools/trailer/score-emberwake/` is the
 * night-raid piece whose D Phrygian material *is* this film's third act. Nothing here imports
 * across — all three directories are separate copies of the same five-file harness so that
 * none of them can break the others.
 *
 * ## The one musical idea
 *
 * The trailer's third act is a raid, and its material already existed: Emberwake's four-note
 * motif **D E♭ A F** over a D pedal, whose second interval — E♭ up to A — is a tritone.
 *
 * So the job of acts one and two is to make that arrival feel *implied* rather than bolted on.
 * The same four-note shape is stated in the first two and a half seconds with the second
 * degree **natural**:
 *
 * | | shape | 2nd interval | mode |
 * |---|---|---|---|
 * | 0:00.9 the wordmark | `D E A F` | E→A, a perfect fourth | D minor, no B at all |
 * | 0:16.0 the turn | `D E♭ A F` | E♭→A, **the tritone** | D Phrygian |
 *
 * Same rhythm — two half-notes and a longer fourth that lands on the next picture cut, at 0:02.5
 * and at 0:17.4 respectively. Same register. Same contour. **One note moves down a semitone**,
 * and a perfect fourth becomes the only tritone in the file.
 *
 * Three quieter things move with it, and none of them is nameable by a listener:
 *
 * 1. **The scale.** Acts one and two are `D E F G A C` — D minor with the sixth degree simply
 *    absent, which makes the collection *literally tritone-free*: no two of those six notes are
 *    six semitones apart. {@link problems} proves it rather than claiming it. Act three adds
 *    E♭ and B♭ and becomes D Phrygian, which has exactly one tritone in it.
 * 2. **The instrument's own third.** A bell rings at roughly 1 : 1.2 : 2 : 3 above its hum, and
 *    the 1.2 is a *minor* third — it is what makes a bell sound like a bell and it is inherently
 *    dark. Act one's {@link open} replaces that partial with a **1.5, a perfect fifth**, so the
 *    instrument has no third at all and cannot be major or minor. At 0:16 {@link bell} arrives
 *    and the partial flattens too. The timbre performs the same semitone the tune does.
 * 3. **The reflections.** Every exposed note is struck twice more (see {@link REFLECTIONS});
 *    acts one and two echo through {@link ghost}, which is open at 1.7 kHz, and act three
 *    through {@link shade}, which is the same idea with 400 Hz taken off the top.
 *
 * And one thing is withheld. The last statement before the turn — *Before the Bell*, 0:14.5 —
 * plays `D E A` and **stops**, so the ear is waiting for the fourth note when 0:16.0 answers
 * with a flattened one. The shot is called Before the Bell; the bell does not ring.
 *
 * ## The cut, and what the music does under it
 *
 * Timings are the locked ones, measured off the cut file. Every one of them is a named constant
 * below and nothing in this file uses a bare number for a landmark.
 *
 * | time | on screen | music |
 * |---|---|---|
 * | 0:00–0:02.5 | Lamp Road at dusk, the wordmark at 0:00.9 | dusk air, one low D, an open fifth for the lamps, and the four-note shape stated slowly |
 * | 0:02.5–0:08.6 | five cuts: crowd, canyon, caverns, orbit, clay | the sequencer, three bars, `D–C–F`. A layer and a chord change together on the middle bar line, and **the floor removed entirely for the orbit shot** |
 * | **0:08.6–0:09.1** | **cut to black** | nothing. The last thing struck is at 0:08.5 and it is 85 ms long |
 * | 0:09.1–0:10.4 | a typed sentence | typewriter keys walking a pentatonic, and nothing else in the file |
 * | 0:10.4–0:12.3 | Chime Path | the machine's pulse, and `D E` on chimes — the head of the shape |
 * | 0:12.3–0:13.1 | a second sentence | keys again, faster and higher. The pulse stops for it |
 * | 0:13.1–0:14.5 | Evenfall Orchard | `A F D` falling — the tail of the shape |
 * | 0:14.5–0:16.0 | Before the Bell | `D E A`, and the fourth note is withheld |
 * | **0:16.0–0:17.4** | the card | **the door.** The pedal drops to D2, the bell turns metal, and the shape returns as `D E♭ A F` |
 * | 0:17.4–0:19.3 | Emberwake, broadside | Emberwake's raid, whole: a hit, a toll, four-on-the-floor and the flat sixth |
 * | 0:19.3–0:21.2 | the gauntlet, under fire | the pedal song. The motif again, an octave up and twice as fast, then a near miss |
 * | 0:21.2–0:21.61 | the magazine | everything stops but a run of plucks climbing. It ends 124 ms before the flash |
 * | **0:21.73** | **the whole frame goes white** | the loudest instant in the file, and a hole behind it |
 * | 0:22.4–0:24.1 | embers | the same machine restarting at a quarter strength, three slow bells |
 * | 0:24.1–0:26.0 | first light | the pulse is cut rather than faded. `D A F` falling, and the wash |
 * | 0:26.0–0:29.92 | the end card | D minor with no E♭ in it, and two chimes over its decay |
 *
 * ## The decisions worth arguing with
 *
 * **One tempo for all three acts.** 120 bpm start to finish, so a bar is exactly 2 s and a
 * sixteenth exactly 0.125 s, both exact in binary. Act three's shots are 1.9 s each, which is a
 * bar *minus a sixteenth*, so every one of them is cut a hair early — that reads as urgency and
 * it is the only rhythmic difference between the acts. Retuning act three to 126.3 bpm would
 * have made its shots whole bars and would have thrown away the one thing binding the film.
 *
 * **The harmony is implied and almost never stated by the sequencer.** The deck transposes a
 * whole track by the bar's root, so any interval a track plays must be consonant with *every*
 * root in its loop: roots, fifths, octaves and — in acts one and two only, where the roots are
 * `D C F` — the major second, which lands on `E D G` and is diatonic everywhere. Every third,
 * every flat second and the entire tune are struck by hand as one-shots.
 *
 * **Struck and plucked, never sustained.** Bells, chimes, plucks, a low toll, typewriter keys
 * and drums. A synthesized pad is what makes procedural audio sound like a screensaver, and the
 * practical reason is harder: a pad smears across a hard cut, where a bell simply stops being
 * struck and its tail is a decision the edit gets to make. The only sustained things here are two
 * filtered-noise gestures — `air` and `wash` — struck seven times between them and never looped.
 * The moment either of them repeats it is a pad.
 *
 * **The ending is the first bar since 0:16 with no E♭ in it.** The card lands on a plain D
 * minor — D, F, A — so the resolution is not a brighter chord arriving, it is the tension
 * *stopping*. There is no major chord anywhere in this file.
 *
 * @see render.mjs for how this becomes a WAV, analyze.mjs for how it is measured, build.mjs for
 *   the gate. This module reads no clock and no global; the same seed is the same thirty
 *   seconds every time.
 */

import { createAudio, createDeck, validateSong, validateSounds, LOOKAHEAD_SEC, SEMITONE } from '@latticekit/audio';

// ---------------------------------------------------------------------------
// The cut. Measured off the locked edit, and not negotiable
// ---------------------------------------------------------------------------

/**
 * Total length of the render.
 *
 * The picture is 1,795 frames at 60 fps — 29.9166… s — and this is the next round number of
 * samples above it: 1,436,160 frames at 48 kHz, three and a third milliseconds long. A file
 * shorter than the picture is a hole at the end of the trailer; a file longer than it is a trim
 * in the edit, which is free.
 */
export const DURATION_SEC = 29.92;

/** 120 bpm. A bar is exactly 2 s, a sixteenth exactly 0.125 s, and both are exact in binary. */
const BPM = 120;
const BEAT_SEC = 60 / BPM;
const BAR_SEC = BEAT_SEC * 4;

// --- act one: what it does -------------------------------------------------

/** Lamp Road at dusk, lamps lit. The beauty shot, and the only slow thing in the first act. */
const T_LAMP = 0;
/** The wordmark fades in. It gets the first note of the motif and nothing else is sounding. */
const T_WORDMARK = 0.9;
/** Crowd — 900 walkers. The sequencer starts here, on the cut, and the shape's last note lands with it. */
const T_CROWD = 2.5;
/** Canyon — a river cutting. */
const T_CANYON = 3.6;
/** Caverns — 692 light pools. */
const T_CAVERNS = 4.9;
/**
 * Orbit — no ground at all, and the music says so.
 *
 * The intensity drops to 0.1 here, which is under the threshold of every track in
 * {@link SONG_OPEN} except `drift`. Kick, beater and bass all stop; a high sparse triangle is
 * the only thing left. It costs one line in {@link intensityAt} and it is the best sync in act one.
 */
const T_ORBIT = 6;
/** Clay — terrain dragged by hand. Everything back, at full, for the last second and a half. */
const T_CLAY = 7.1;
/** The last thing struck in act one: a dry, dark 85 ms accent on the bar line. Music leads picture. */
const T_SHUT = 8.5;

// --- the hinge -------------------------------------------------------------

/**
 * **Cut to black.** Half a second of nothing between *what it does* and *who writes it*.
 *
 * The second most important instant in the film after the flash, and the only way to get it
 * right is to not play. Nothing is struck at or after this time and before {@link T_SENTENCE};
 * {@link problems} refuses a score that puts anything here, and `build.mjs` measures the hole in
 * the rendered samples rather than trusting the event list.
 */
const T_BLACK = 8.6;
const T_BLACK_END = 9.1;

// --- act two: who writes it ------------------------------------------------

/** A typed sentence. Typewriter keys, alone. The most exposed thirteen hundred milliseconds here. */
const T_SENTENCE = 9.1;
/** Chime Path — the game that sentence produced. The pulse arrives with it. */
const T_CHIME_PATH = 10.4;
/** A second sentence, faster than the first. The pulse stops for it; a writer is not a montage. */
const T_SENTENCE_TWO = 12.3;
/**
 * Evenfall Orchard, and where the second pulse window actually starts — a tenth of a second
 * earlier, at {@link DECK_WRITE_B}, so its first intensity riser can land exactly on
 * {@link T_BELL}. See {@link intensityAt} for why a riser cannot be closer than
 * `LOOKAHEAD_SEC` to a `play`.
 */
const T_ORCHARD = 13.1;
/** Before the Bell. The last statement of the open shape, and it stops one note short. */
const T_BELL = 14.5;

// --- act three: the raid ---------------------------------------------------

/**
 * **The turn.** The card — *"And then — one more, with everything the kit has, all at once."*
 *
 * Where the E♭ arrives, and the third of the three sync points. Everything about the sound gets
 * colder on this frame at once: the pedal drops an octave, the bell's minor-third partial
 * replaces the fifth, the reflections darken, and the second degree flattens.
 */
const T_TURN = 16;
/** Emberwake — broadside on a burning shoreline. The motif's fourth note lands on this cut. */
const T_EMBERWAKE = 17.4;
/** The gauntlet, under fire. Pedal D, four on the floor, the motif twice as fast an octave up. */
const T_GAUNTLET = 19.3;
/** The magazine. The sequencer stops on this frame and a run of plucks climbs alone. */
const T_MAGAZINE = 21.2;
/**
 * **The white flash.** One frame of full-frame white, and the one instant in this file that
 * cannot drift by a single frame.
 *
 * The file's peak belongs exactly here and a real hole belongs behind it. `build.mjs` refuses a
 * master whose loudest sample is anywhere else, whose step across this one frame is under
 * 22.5 dB, or whose {@link CUES.blind} window is above −31.7 dBFS. Everything else in this score
 * is allowed to breathe; this is not.
 */
const T_FLASH = 21.73;
/**
 * Where the pulse comes back after the magazine, and it is deliberately not the end of the blind
 * stretch. A kick drum is the one thing that would fill the hole the flash just made.
 */
const T_PULSE_RETURN = 22.4;
/** First light — mauve over a burning archipelago. The pulse is cut here, not faded. */
const T_FIRST_LIGHT = 24.1;
/** The end card. One clean resolution, struck here and still ringing when the file ends. */
const T_END_CARD = 26;
/** The reveal. A chime and a re-struck bass over the chord's decay; nothing new is stated. */
const T_REVEAL = 27.5;
/** The install line. The last sound in the file, and the quietest struck one. */
const T_INSTALL = 28.6;

/**
 * Where the sequencer runs, in six windows.
 *
 * Every `from` is a picture cut and every window restarts its song, so each act's pulse begins
 * with a downbeat *on* an edit. Two of them start a tenth of a second before their cut, which is
 * not sloppiness: an intensity riser cannot be placed closer than `LOOKAHEAD_SEC` to a `play`
 * (see {@link intensityAt}), so a window that needs a layer change 1.5 s in has to open 1.5 s
 * before it. `DECK_WRITE_B` opens at 13.0 so its riser can land exactly on {@link T_BELL}.
 *
 * Hitting an exact `to` takes a forced pump and a subtraction — see {@link schedule}.
 */
const DECK_MONTAGE = { from: T_CROWD, to: T_SHUT };
const DECK_WRITE_A = { from: T_CHIME_PATH, to: T_SENTENCE_TWO };
const DECK_WRITE_B = { from: T_ORCHARD - 0.1, to: T_TURN };
const DECK_RAID = { from: T_EMBERWAKE, to: T_GAUNTLET };
const DECK_DRIVE = { from: T_GAUNTLET, to: T_MAGAZINE };
const DECK_EMBERS = { from: T_PULSE_RETURN, to: T_FIRST_LIGHT };

// ---------------------------------------------------------------------------
// Pitch. One key, walked a semitone at a time
// ---------------------------------------------------------------------------

/** A2. Every frequency in the file is this multiplied or divided by {@link SEMITONE}. */
const A2_HZ = 110;

/** Semitones from A, per letter. `b` and `#` are parsed; this film needs the flats. */
const PITCH_CLASS = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };

/** Semitones from A of a note *name*, ignoring its octave. `Eb` is −6, `A` is 0. */
function classOf(name) {
  const letter = PITCH_CLASS[name[0]];
  if (letter === undefined) throw new RangeError(`classOf: expected a note like "Eb5", got ${name}`);
  return letter + (name[1] === 'b' ? -1 : name[1] === '#' ? 1 : 0);
}

/**
 * Semitones above D — the number the whole harmonic argument of this film is made in.
 *
 * `D` is 0, `E♭` is 1, `E` is 2, `F` is 3, `G` is 5, `A` is 7, `B♭` is 8, `C` is 10.
 */
function degreeOf(name) {
  return (((classOf(name) - PITCH_CLASS.D) % 12) + 12) % 12;
}

/**
 * The frequency of a named note, by repeated multiplication rather than by `pow`.
 *
 * `SEMITONE` is exported by the package as a literal for exactly this reason: `Math.pow` is Tier
 * B, not required by ECMA-262 to be correctly rounded, and two renders that disagree in the last
 * bit are two renders whose plan hashes disagree — which would make the determinism check
 * meaningless the first time it ran on someone else's machine.
 */
function hz(name) {
  const flat = name[1] === 'b';
  const sharp = name[1] === '#';
  const octave = Number(name.slice(flat || sharp ? 2 : 1));
  if (!Number.isInteger(octave)) throw new RangeError(`hz: expected an integer octave, got ${name}`);
  const semis = (octave - 2) * 12 + classOf(name);
  let f = A2_HZ;
  for (let i = 0; i < semis; i += 1) f *= SEMITONE;
  for (let i = 0; i > semis; i -= 1) f /= SEMITONE;
  return f;
}

/**
 * **Acts one and two: `D E F G A C`.** D minor with the sixth degree simply absent.
 *
 * Six notes, and no two of them are six semitones apart — the differences that occur are
 * 1, 2, 3, 4, 5, 7, 8, 9, 10 and 11, and never 6. So this collection cannot state a tritone
 * however it is voiced, which is what "bright and open, no tritone" means when it has to be
 * *checked* rather than felt. {@link problems} proves the property from this array rather than
 * taking the comment's word for it.
 */
const OPEN_SCALE = [0, 2, 3, 5, 7, 10];

/** **Act three: D Phrygian.** `D E♭ F G A B♭ C`. Its one tritone is E♭–A, and that is the point. */
const DARK_SCALE = [0, 1, 3, 5, 7, 8, 10];

/** The flat second, as a degree. The single note this whole score is organized around. */
const FLAT_SECOND = 1;

// ---------------------------------------------------------------------------
// The instruments. Every pitch of each is its own sound id — see `table`
// ---------------------------------------------------------------------------

/**
 * Acts one and two's voice: a struck bell **with no third in it**.
 *
 * A real founder's bell rings at roughly 1 : 1.2 : 2 : 3 above the hum, and that 1.2 is a *minor*
 * third — it is why a bell sounds like a bell, and it is inherently dark. This one puts a
 * **1.5, a perfect fifth**, where the third would be, so the instrument is modally neutral: it
 * cannot be major and it cannot be minor, and whatever mode the music is in comes entirely from
 * the notes. Warm, open, and a little like struck glass. The 5.02 partial is a light inharmonic
 * that keeps it from being an organ pipe.
 *
 * At {@link T_TURN} it is replaced by {@link bell}, whose third is the ordinary flat one, and the
 * timbre performs the same semitone the tune does.
 */
function open(f) {
  return {
    bus: 'sfx',
    minGapMs: 70,
    layers: [
      { wave: 'sine', hz: f, gain: 0.15, hold: 3, cutoff: 2600 },
      { wave: 'sine', hz: f * 1.5, gain: 0.05, hold: 1.3, cutoff: 3600 },
      { wave: 'sine', hz: f * 2, gain: 0.07, hold: 1.5, cutoff: 5200, delay: 0.004 },
      // The twelfth is a triangle with its corner at 12 kHz, and it is where the top octave of
      // the first two acts comes from. Sines and a hammer alone measure 30 dB down up there and
      // read as a muffled thud with tinkling over it.
      { wave: 'triangle', hz: f * 3, gain: 0.034, hold: 0.45, cutoff: 12000 },
      { wave: 'noise', hz: 0, gain: 0.05, hold: 0.045, highpass: 2800, cutoff: 14000 },
      { wave: 'sine', hz: f * 5.02, gain: 0.018, hold: 0.13 },
    ],
  };
}

/**
 * Act three's voice, and Emberwake's, quoted intact: the same six layers with **1.2** where
 * {@link open} has 1.5.
 *
 * That is the whole difference and it is a minor third against a perfect fifth. The 45 ms noise
 * hammer is the cheapest layer here and does the most work: without it the sound stops being
 * struck and becomes a sine that faded in.
 */
function bell(f) {
  return {
    bus: 'sfx',
    minGapMs: 70,
    layers: [
      { wave: 'sine', hz: f, gain: 0.15, hold: 3, cutoff: 2400 },
      { wave: 'sine', hz: f * 1.2, gain: 0.055, hold: 1.1, cutoff: 3200 },
      { wave: 'sine', hz: f * 2, gain: 0.07, hold: 1.4, cutoff: 5000, delay: 0.004 },
      { wave: 'triangle', hz: f * 3, gain: 0.036, hold: 0.4, cutoff: 12000 },
      { wave: 'noise', hz: 0, gain: 0.05, hold: 0.045, highpass: 3000, cutoff: 14000 },
      // A real bell's upper partials die first, so this one is gone in a sixth of a second and is
      // not a whole-number ratio. Integer partials are an organ; 4.76 is metal.
      { wave: 'sine', hz: f * 4.76, gain: 0.024, hold: 0.16 },
    ],
  };
}

/**
 * The big one. Same physics as {@link bell}, an octave of extra tail, everything above 1.2 kHz
 * taken off.
 *
 * Used five times — the turn at 0:16, the broadside, the shockwave and the two lowest notes of the
 * end card — because a 4.5 s tail struck twice is a chord by accident, and because the only reason
 * to pay for four and a half seconds of decay is that something has to still be ringing when the
 * file ends. The reveal's re-strike wants the same sound and cannot have it; see {@link tollShort}.
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
      { wave: 'sine', hz: f * 4.76, gain: 0.018, hold: 0.22 },
      { wave: 'noise', hz: 0, gain: 0.055, hold: 0.055, highpass: 1600, cutoff: 11000 },
    ],
  };
}

/**
 * The same toll, cut to fit what is left of the file — and it is **a third table row that exists
 * only because `hold` is not a `PlayOptions` field**.
 *
 * The reveal at 0:27.5 has to leave something ringing under the end card, and a {@link toll}'s
 * 4.5 s hum is still at −56 dBFS on the last sample of a file that ends 2.42 s later. That is a
 * step into digital silence, which is a click. There is no way to say "that sound, shorter": the
 * envelope belongs to the recipe, so the answer is another sixty-byte object with one number
 * changed. This one reaches the envelope floor 64 ms before the file does.
 */
function tollShort(f) {
  return {
    bus: 'sfx',
    minGapMs: 150,
    layers: [
      { wave: 'sine', hz: f, gain: 0.16, hold: 2.35, cutoff: 1200 },
      { wave: 'sine', hz: f * 1.2, gain: 0.05, hold: 1.6, cutoff: 1800 },
      { wave: 'sine', hz: f * 2, gain: 0.06, hold: 1.3, cutoff: 3000, delay: 0.006 },
      { wave: 'sine', hz: f * 3, gain: 0.028, hold: 0.6, cutoff: 6000 },
      { wave: 'sine', hz: f * 4.76, gain: 0.018, hold: 0.2 },
      { wave: 'noise', hz: 0, gain: 0.055, hold: 0.055, highpass: 1600, cutoff: 11000 },
    ],
  };
}

/**
 * The reflection of a struck note off a wall that does not exist, in the first two acts.
 *
 * `@latticekit/audio` has no reverb and cannot have one: a convolver needs an impulse response,
 * which is an audio file, and an algorithmic reverb needs feedback delay lines, which the fixed
 * `source → filter → envelope → pan → bus` chain refuses on purpose — the moment routing is
 * author-defined the clipping ceiling stops being provable.
 *
 * So the space is written into the score, as {@link REFLECTIONS}. This is the open, bright
 * version: 1.7 kHz, which is a room made of stone with the roof off.
 */
function ghost(f) {
  return {
    bus: 'sfx',
    minGapMs: 60,
    layers: [
      { wave: 'sine', hz: f, gain: 0.15, hold: 2, attack: 0.022, cutoff: 1700 },
      { wave: 'sine', hz: f * 2, gain: 0.05, hold: 0.75, attack: 0.03, cutoff: 2900 },
    ],
  };
}

/**
 * The same reflection with 400 Hz taken off the top, for act three.
 *
 * Identical delays, identical gains, identical panning — the only thing that changes at 0:16 is
 * how much of the note survives the trip. That is what a burning shoreline does to a bell and a
 * courtyard does not, and it is one of the three things that get colder on that frame without a
 * listener being able to name any of them.
 */
function shade(f) {
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
 * Plucked and short: acts one and two's running note.
 *
 * A bell's three-second tail struck every eighth of a second is a chord nobody wrote. Four tenths
 * of a second of decay is the longest a note can ring at this tempo and still leave the next one
 * room, and this one is a little brighter than its act-three counterpart {@link glint} for the
 * same reason everything else in the first two acts is.
 */
function pluck(f) {
  return {
    bus: 'sfx',
    minGapMs: 40,
    layers: [
      { wave: 'triangle', hz: f, gain: 0.14, hold: 0.4, cutoff: 5200 },
      { wave: 'sine', hz: f * 2, gain: 0.05, hold: 0.18, cutoff: 7000 },
      { wave: 'noise', hz: 0, gain: 0.035, hold: 0.02, highpass: 3600, cutoff: 15000 },
    ],
  };
}

/** Act three's pluck, quoted from Emberwake: the same idea a thousand hertz darker. */
function glint(f) {
  return {
    bus: 'sfx',
    minGapMs: 40,
    layers: [
      { wave: 'triangle', hz: f, gain: 0.14, hold: 0.42, cutoff: 4200 },
      { wave: 'sine', hz: f * 2, gain: 0.05, hold: 0.2, cutoff: 6200 },
      { wave: 'noise', hz: 0, gain: 0.04, hold: 0.022, highpass: 3400, cutoff: 14000 },
    ],
  };
}

/** The floor: a struck low root with an octave over it, filtered down to a thud with a pitch. */
function low(f) {
  return {
    bus: 'sfx',
    minGapMs: 200,
    layers: [
      { wave: 'sine', hz: f, gain: 0.115, hold: 2, cutoff: 300 },
      { wave: 'triangle', hz: f * 2, gain: 0.045, hold: 0.8, cutoff: 600 },
    ],
  };
}

/**
 * A typewriter key that happens to be in the key. Five of them, ascending, cycled by the sentence.
 *
 * `spatial` is set by hand because these are on the `ui` bus, where it defaults to **off** — and
 * with it off, `PlayOptions.pan` is silently ignored rather than refused. Left alone, the
 * alternating left/right of a sentence being typed simply does not happen and nothing says why.
 *
 * The noise layer is peak-hot on purpose. A 14 ms click at the same peak as a bell is heard as far
 * quieter than the bell, because loudness integrates over about 100 ms and a click does not last
 * that long. Mixed by RMS these vanish; mixed by peak they are a typewriter.
 */
function tick(f) {
  return {
    bus: 'ui',
    minGapMs: 20,
    spatial: true,
    layers: [
      { wave: 'noise', hz: 0, gain: 0.115, hold: 0.014, highpass: 2600, cutoff: 9500 },
      { wave: 'triangle', hz: f, gain: 0.1, hold: 0.05, cutoff: 5000 },
    ],
  };
}

/**
 * The reveal chime, and the only note in the file allowed to be bright after 0:16.
 *
 * A bell with the hum taken out and the octave brought forward. Everything else on the end card
 * is already ringing; this has to be *heard* over a decaying D minor without restating it, so it
 * is the fifth and nothing else.
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

/**
 * The same chime, half as long, and it is **a different table row because it has to be**.
 *
 * `hold` belongs to the recipe and there is no `PlayOptions.hold`, so "the same sound but
 * shorter" is not something a caller can ask for. The install line is struck 1.32 s before the
 * file ends; a {@link chime} there is at −39 dBFS on the last sample, which is a click. This one
 * has reached the envelope floor with 200 ms to spare.
 */
function chimeShort(f) {
  return {
    bus: 'sfx',
    minGapMs: 120,
    layers: [
      { wave: 'sine', hz: f, gain: 0.11, hold: 1.05, cutoff: 3000 },
      { wave: 'sine', hz: f * 2, gain: 0.05, hold: 0.5, cutoff: 6000, delay: 0.004 },
      { wave: 'triangle', hz: f * 3, gain: 0.02, hold: 0.2, cutoff: 10000 },
      { wave: 'noise', hz: 0, gain: 0.028, hold: 0.03, highpass: 3200, cutoff: 12000 },
    ],
  };
}

/**
 * The film stopping. Struck once, at 0:08.5, and it is the whole reason the cut to black works.
 *
 * **Every hold here is chosen against a stopwatch rather than a taste.** The longest layer lives
 * 106 ms, so 100 ms after it is struck — on the frame the picture goes black — the loudest thing
 * left in the file is 78 dB down. That is what makes 0:08.6 to 0:09.1 measurable silence rather
 * than a fade somebody described as silence.
 */
function shut() {
  return {
    bus: 'sfx',
    minGapMs: 400,
    layers: [
      { wave: 'sine', hz: 88, toHz: 44, gain: 0.2, hold: 0.085, cutoff: 220 },
      { wave: 'noise', hz: 0, gain: 0.085, hold: 0.038, highpass: 180, cutoff: 1500 },
      { wave: 'triangle', hz: hz('D3'), toHz: hz('D2'), gain: 0.05, hold: 0.1, cutoff: 500, delay: 0.008 },
    ],
  };
}

/**
 * The hit on the broadside, quoted from Emberwake. Percussion, not foley — the trailer has its
 * own gunfire and a score that also fires a gun is two guns.
 *
 * A body, a crack, and a low struck D twelve milliseconds behind them so the loudest thing in the
 * broadside has a pitch and belongs to the key. Struck twice: on the broadside at 0:17.4, and
 * again in the gauntlet at 0:20.4 where it is a hull against rock.
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
 * The near miss in the gauntlet. One instance in the file; a second one would be a sound effect.
 *
 * A sawtooth falling two and a half octaves through a low-pass, which is a Doppler pass without a
 * Doppler. It has to be a *tone* and not noise, because `wave: 'noise'` ignores `hz` and `toHz`
 * outright — there is no way to sweep a filtered noise band in this package, so the pitch carries
 * the fall and the noise layer only rides along.
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
 * What is left in your ears after the magazine. One sine, one and a half seconds, once.
 *
 * Emberwake found this with a picture rather than a number: after the blast the top three octaves
 * of the spectrogram were the darkest in the file, so the hole read as a *dull* rumble rather than
 * as a held breath, which is the opposite of what a shockwave does to a listener. A lone D two
 * octaves over the tune, with a 50 ms attack so it swells in behind the blast rather than being
 * struck with it, is the whole fix and it is one oscillator.
 */
function ring() {
  return {
    bus: 'sfx',
    minGapMs: 900,
    layers: [{ wave: 'sine', hz: hz('D7'), gain: 0.042, hold: 1.8, attack: 0.05 }],
  };
}

/**
 * The magazine. The loudest event in the piece and the only one that stops the trailer rather
 * than moving it.
 *
 * Sub falling from 96 Hz to 34, a body of low noise, a low triangle behind them so the blast has a
 * pitch, and — the layer that makes it a magazine rather than a kick drum — a quarter of a second
 * of high hiss with a slow attack, which is debris.
 *
 * **Every hold here is shorter than it wants to be, and both numbers are measured rather than
 * tasteful.** Emberwake's first pass ran the sub for 0.85 s and the debris for 1.1, and the stretch
 * behind the flash then measured 1 dB *louder than the gauntlet it had just interrupted*: the
 * impact was filling the silence it had itself made. It halved them. This blast is 3 dB bigger than
 * that one — it has to be, because the file's peak has to belong to this frame and the broadside
 * was winning — so its tails had to come down again, to 0.19 and 0.26. The hole went from
 * −30.1 dBFS to −33.2 on that change alone and the peak did not move a decibel, because a 16 ms
 * frame is over long before an envelope's shape matters.
 */
function detonate() {
  return {
    bus: 'sfx',
    minGapMs: 800,
    layers: [
      { wave: 'sine', hz: 96, toHz: 34, gain: 0.48, hold: 0.19, cutoff: 260 },
      { wave: 'noise', hz: 0, gain: 0.19, hold: 0.16, highpass: 90, cutoff: 1400 },
      { wave: 'triangle', hz: hz('D3'), toHz: hz('D2'), gain: 0.085, hold: 0.2, cutoff: 620, delay: 0.014 },
      { wave: 'noise', hz: 0, gain: 0.065, hold: 0.26, attack: 0.02, highpass: 1600, cutoff: 7000 },
    ],
  };
}

/**
 * Evening air. Struck five times in the file and never looped — the moment this repeats it is a pad.
 *
 * `pan` lives on the *layers* rather than on the play, so the two bands sit apart and the opening
 * has width before anything is struck. Playing it with a `pan` option would collapse them onto
 * each other, which is why every `air` event below passes `undefined`.
 */
function air() {
  return {
    bus: 'sfx',
    minGapMs: 700,
    layers: [
      { wave: 'noise', hz: 0, gain: 0.032, hold: 1.7, attack: 0.5, highpass: 260, cutoff: 1300, pan: -0.3 },
      { wave: 'noise', hz: 0, gain: 0.024, hold: 1.3, attack: 0.75, highpass: 1800, cutoff: 6500, pan: 0.4 },
    ],
  };
}

/** First light: the same idea an octave brighter and twice as slow, so the palette washing has a sound. */
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

/** Pitched instruments, by the name an event names them with. */
const PITCHED = { open, bell, toll, tollShort, chime, chimeShort, ghost, shade, pluck, glint, low, tick };
/** Unpitched instruments. Their id is just the instrument name. */
const FIXED = { shut, strike, pass, ring, detonate, air, wash };

/**
 * Which echo an instrument gets. This is the third of the three things that darken at 0:16, and
 * it is a lookup rather than a parameter so that it cannot be got wrong one call at a time.
 */
const ECHO_OF = {
  open: 'ghost',
  pluck: 'ghost',
  chime: 'ghost',
  chimeShort: 'ghost',
  bell: 'shade',
  toll: 'shade',
  tollShort: 'shade',
  glint: 'shade',
};

// ---------------------------------------------------------------------------
// The one-shots, in time order
// ---------------------------------------------------------------------------

/**
 * Which stem an event belongs to, so the edit can duck a layer without a re-render.
 *
 * `pulse` is the sequencer, `melody` is everything with a tune in it including the typewriter,
 * `floor` is everything that carries weight or air — the subs, the hits, the blast and the washes.
 */
export const STEMS = ['pulse', 'melody', 'floor'];

/** One struck note. `note` is absent for the unpitched instruments. */
function at(time, kind, note, gain, pan, stem) {
  return { at: time, kind, note, id: note === undefined ? kind : `${kind}${note}`, gain, pan, stem };
}

/**
 * How long after a note its two reflections arrive, and how much of it survives the trip.
 *
 * **45 ms and 240 ms.** Emberwake used 105 and 240 and flagged in its own report that it could
 * not verify whether 105 ms reads as space or as slapback — 105 ms is over the fusion window, so
 * it is heard as a distinct second event rather than as the room the first one is in. 45 ms is
 * inside it: it thickens and widens the note instead of repeating it, which is what a first
 * reflection is supposed to do. The 240 ms is left alone, because that one is *meant* to be heard
 * as a far wall, and it is thrown across the field so the two do not read as a single flam.
 *
 * I cannot verify this by ear either. What I can say is that it is the correction that agent
 * recommended to itself, and that the numbers do not distinguish the two cases at all.
 */
const REFLECTIONS = [
  { delay: 0.045, gain: 0.34, pan: -0.72 },
  { delay: 0.24, gain: 0.16, pan: 0.4 },
];

/**
 * Where a reflection lands in the field, given where its source is.
 *
 * Emberwake computed this as `sourcePan * reflectionPan`, which mirrors the source and pushes it
 * 15% further out. That is geometrically reasonable and it does almost nothing: this film's notes
 * are panned between ±0.1 and ±0.34, so the reflections came back between ±0.12 and ±0.39 and the
 * side channel measured 21 dB under the mid. A reverb that is 21 dB down and in the middle is not
 * a room, it is a chorus.
 *
 * A reflection comes off a **wall**, and where the wall is does not depend on where the player is
 * standing. So the position is a fixed offset with the source's own pan subtracted from it — near
 * wall on the left at 45 ms, far wall on the right at 240 — which is a listener standing left of
 * center in a hall, consistently, all film.
 */
function reflectionPan(sourcePan, reflection) {
  return Math.max(-0.85, Math.min(0.85, reflection.pan - sourcePan * 0.45));
}

/** A note and its two reflections. The echo instrument comes from {@link ECHO_OF}, never from a caller. */
function struck(out, time, kind, note, gain, pan) {
  const echo = ECHO_OF[kind];
  if (echo === undefined) throw new RangeError(`struck: ${kind} has no reflection instrument`);
  out.push(at(time, kind, note, gain, pan, 'melody'));
  for (const reflection of REFLECTIONS) {
    out.push(at(time + reflection.delay, echo, note, gain * reflection.gain, reflectionPan(pan, reflection), 'melody'));
  }
}

/**
 * **The shape, and the shape turned dark.** The two lines this whole commission is about.
 *
 * `D E A F` is root, second, fifth, minor third. Its middle interval, `E` up to `A`, is a perfect
 * fourth: the most open two notes there are. `D E♭ A F` is the same four scale degrees with the
 * second flattened, and that same middle interval is now `E♭` up to `A`, a tritone — the only one
 * in the file. Nothing else about the phrase moves: same register, same contour, same rhythm, and
 * in both cases the fourth note lands on the next picture cut rather than on a beat.
 */
const SHAPE_OPEN = ['D5', 'E5', 'A5', 'F5'];
const SHAPE_DARK = ['D5', 'Eb5', 'A5', 'F5'];
/** The same four notes an octave up and twice as fast, for the gauntlet. Emberwake's, exactly. */
const SHAPE_DARK_HIGH = ['D6', 'Eb6', 'A6', 'F6'];
/** Three notes falling into first light, and the fourth of them is the end card. Emberwake's, exactly. */
const DAWN_FALL = ['D6', 'A5', 'F5'];

/**
 * Where the shape's four notes fall, relative to the statement's start.
 *
 * Two half notes and then a longer one: 0, 0.5, 1.0, and a fourth that is placed by the *picture*
 * rather than by the grid. Both statements use this array and the fourth entry is supplied by the
 * cut it has to land on, which is how the two come out as obviously the same phrase without either
 * of them being quantized to death.
 */
const SHAPE_OFFSETS = [0, 0.5, 1];

/**
 * The five typewriter keys, walking a pentatonic so that a sentence being typed is a *run* rather
 * than a rattle. `D E F A C` — five of the six notes acts one and two are allowed.
 */
const KEYS = ['D5', 'E5', 'F5', 'A5', 'C6'];

/**
 * When each key of a sentence is struck, in seconds from the start of the shot.
 *
 * Written out rather than generated, because a person typing is not a metronome and the only
 * cheap way to sound like one is to place every keystroke by hand. The second sentence is the
 * same hand going faster: the writer has stopped thinking about it.
 */
const SENTENCE_ONE = [0, 0.062, 0.128, 0.196, 0.252, 0.33, 0.392, 0.45, 0.526, 0.588, 0.65, 0.724, 0.79, 0.85, 0.926, 0.99, 1.062, 1.13];
const SENTENCE_TWO = [0, 0.05, 0.104, 0.152, 0.208, 0.254, 0.31, 0.362, 0.41, 0.466, 0.514, 0.568, 0.618, 0.668];

function events() {
  const out = [];

  // === ACT ONE — what it does ==============================================

  // --- 0:00 Lamp Road at dusk ----------------------------------------------
  // Five events in two and a half seconds, because everything after this depends on there being
  // somewhere to go: open big here and the flash at 0:21.73 is a level rather than an event.
  out.push(at(T_LAMP, 'air', undefined, 0.34, undefined, 'floor'));
  out.push(at(T_LAMP + 0.04, 'low', 'D2', 0.34, 0, 'floor'));
  // The lamps: an open fifth, thrown wide, struck ten milliseconds apart so it is a hand and not
  // a chord button. No third, in a film whose whole argument is about which third you get.
  struck(out, T_LAMP + 0.1, 'open', 'D4', 0.24, -0.26);
  struck(out, T_LAMP + 0.14, 'open', 'A4', 0.22, 0.24);

  // The wordmark, and the shape. Three notes here and the fourth on the cut at 0:02.5.
  SHAPE_OFFSETS.forEach((offset, index) => {
    struck(out, T_WORDMARK + offset, 'open', SHAPE_OPEN[index], [0.4, 0.36, 0.38][index], [-0.1, 0.14, -0.12][index]);
  });
  // A pickup into the crowd, so the sequencer's downbeat is answered rather than announced.
  out.push(at(T_CROWD - 0.25, 'pluck', 'C6', 0.3, 0.2, 'melody'));
  // The shape's fourth note, on the cut, with the pulse starting underneath it.
  struck(out, T_CROWD, 'open', SHAPE_OPEN[3], 0.44, 0.08);

  // --- 0:02.5 crowd — 900 walkers ------------------------------------------
  // The counter-line is built from the shape's own notes, re-ordered per shot. Rising here,
  // because nine hundred people walking is the first thing in the film that moves by itself.
  for (const [time, note, gain, pan] of [
    [2.75, 'A5', 0.34, 0.22],
    [3.0, 'D6', 0.32, -0.18],
    [3.25, 'E6', 0.3, 0.16],
  ]) {
    out.push(at(time, 'pluck', note, gain, pan, 'melody'));
  }

  // --- 0:03.6 canyon — a river cutting -------------------------------------
  // Falling, and it crosses the bar line at 0:04.5 where the bass moves D → C and the sequencer
  // gains its arpeggio. Water going downhill through the one harmonic move in the act.
  for (const [time, note, gain, pan] of [
    [T_CANYON, 'D6', 0.36, -0.2],
    [3.85, 'C6', 0.34, 0.18],
    [4.1, 'A5', 0.34, -0.16],
    [4.35, 'G5', 0.32, 0.14],
    [4.6, 'F5', 0.34, -0.12],
  ]) {
    out.push(at(time, 'pluck', note, gain, pan, 'melody'));
  }

  // --- 0:04.9 caverns — 692 light pools ------------------------------------
  // High and sparse. A second breath of air under it so the shot has a size; 1.7 s of hold puts
  // its tail exactly on the orbit cut, where there is deliberately nothing else.
  out.push(at(T_CAVERNS, 'air', undefined, 0.34, undefined, 'floor'));
  for (const [time, note, gain, pan] of [
    [T_CAVERNS, 'D6', 0.36, 0.2],
    [5.15, 'F6', 0.34, -0.18],
    [5.4, 'A6', 0.32, 0.22],
    [5.65, 'C6', 0.3, -0.14],
  ]) {
    out.push(at(time, 'pluck', note, gain, pan, 'melody'));
  }

  // --- 0:06.0 orbit — no ground at all --------------------------------------
  // The floor is taken away rather than turned down: see T_ORBIT and intensityAt. What is left is
  // the sequencer's one always-on track and two bells hanging in it, wide apart and unresolved.
  struck(out, T_ORBIT, 'open', 'A5', 0.36, -0.34);
  struck(out, T_ORBIT + 0.35, 'open', 'E6', 0.32, 0.34);

  // --- 0:07.1 clay — terrain dragged by hand --------------------------------
  // Everything back at once, and a run that climbs rather than settles. It ends on E, unresolved
  // and hanging — which is the second degree, and therefore the note that the third act flattens.
  // That is the last pitch anyone hears before the cut to black.
  for (const [time, note, gain, pan] of [
    [T_CLAY, 'D5', 0.44, -0.18],
    [7.35, 'F5', 0.46, 0.16],
    [7.6, 'A5', 0.5, -0.14],
    [7.85, 'C6', 0.54, 0.18],
    [8.1, 'D6', 0.58, -0.16],
    [8.25, 'E6', 0.62, 0.14],
  ]) {
    out.push(at(time, 'pluck', note, gain, pan, 'melody'));
  }
  // The film stopping, on the bar line, a tenth of a second before the picture goes black. Music
  // leads picture; it always has. Nothing is struck after this until 0:09.1.
  out.push(at(T_SHUT, 'shut', undefined, 0.85, 0, 'floor'));

  // === 0:08.6 — 0:09.1 the cut to black ====================================
  // Deliberately empty. `problems` refuses an event in this window and `build.mjs` measures the
  // rendered samples, because an event list that is empty here is not the same claim as a file
  // that is silent here.

  // === ACT TWO — who writes it =============================================

  // --- 0:09.1 a typed sentence ---------------------------------------------
  // Keys, alone, panning alternately, walking up the pentatonic. There is no floor under this and
  // no pulse: the loudest thing in the trailer so far has been a montage, and the quietest thing
  // in it is about to be a person at a desk.
  SENTENCE_ONE.forEach((offset, index) => {
    out.push(at(T_SENTENCE + offset, 'tick', KEYS[index % KEYS.length], 0.6, index % 2 === 0 ? -0.3 : 0.3, 'melody'));
  });

  // --- 0:10.4 Chime Path ----------------------------------------------------
  // The head of the shape — `D E` — on chimes, because the game is called Chime Path and because
  // two notes is all a 1.9 s shot can carry. Then the open fifth walked upward, which is the same
  // interval the lamps were struck on at 0:00.1.
  out.push(at(T_CHIME_PATH, 'low', 'D2', 0.34, 0, 'floor'));
  struck(out, T_CHIME_PATH, 'chime', 'D5', 0.5, -0.14);
  struck(out, T_CHIME_PATH + 0.5, 'chime', 'E5', 0.46, 0.16);
  for (const [time, note, gain, pan] of [
    [11.4, 'D5', 0.34, -0.2],
    [11.65, 'A5', 0.36, 0.18],
    [11.9, 'D6', 0.38, -0.16],
  ]) {
    out.push(at(time, 'pluck', note, gain, pan, 'melody'));
  }

  // --- 0:12.3 a second sentence ---------------------------------------------
  // The same hand, faster, and two keys higher up the pentatonic — the sound of somebody who has
  // stopped deciding. The pulse stops dead for it rather than ducking under it.
  SENTENCE_TWO.forEach((offset, index) => {
    out.push(at(T_SENTENCE_TWO + offset, 'tick', KEYS[(index + 2) % KEYS.length], 0.66, index % 2 === 0 ? -0.3 : 0.3, 'melody'));
  });

  // --- 0:13.1 Evenfall Orchard ----------------------------------------------
  // The tail of the shape, falling: `A F D`. Warm, slow, and the first time in the film the tune
  // has come to rest — which is exactly what an orchard at dusk should do and exactly what makes
  // the next shot's unresolved ending land.
  out.push(at(T_ORCHARD, 'low', 'D2', 0.36, 0, 'floor'));
  struck(out, T_ORCHARD, 'open', 'A5', 0.44, 0.16);
  struck(out, T_ORCHARD + 0.45, 'open', 'F5', 0.42, -0.14);
  struck(out, T_ORCHARD + 0.9, 'open', 'D5', 0.4, 0.12);
  out.push(at(13.8, 'pluck', 'C6', 0.3, -0.2, 'melody'));
  out.push(at(14.2, 'pluck', 'A5', 0.28, 0.18, 'melody'));

  // --- 0:14.5 Before the Bell -----------------------------------------------
  // `D E A` on the same rhythm as the wordmark's statement, and then **nothing**. The fourth note
  // is 1.5 s away and it is in the wrong mode. The shot is called Before the Bell; the bell does
  // not ring, and the two withheld things are the same withheld thing.
  out.push(at(T_BELL, 'low', 'D2', 0.42, 0, 'floor'));
  SHAPE_OFFSETS.forEach((offset, index) => {
    struck(out, T_BELL + offset, 'open', SHAPE_OPEN[index], [0.5, 0.48, 0.52][index], [-0.12, 0.14, -0.1][index]);
  });
  // Two plucks climbing into the turn, so 0:16.0 arrives as an acceleration of something already
  // moving rather than as a new idea being introduced.
  out.push(at(15.75, 'pluck', 'D6', 0.4, 0.18, 'melody'));
  out.push(at(15.875, 'pluck', 'E6', 0.44, -0.16, 'melody'));

  // === ACT THREE — the raid ================================================

  // --- 0:16.0 the turn ------------------------------------------------------
  // The door. The pedal drops to a struck D2 with a toll on it, the air goes cold, and the shape
  // comes back with its second degree flattened. Every reflection from here is `shade` rather than
  // `ghost` and every bell has a minor third in its own spectrum. One frame, four changes, and a
  // listener can name none of them.
  out.push(at(T_TURN, 'low', 'D2', 0.6, 0, 'floor'));
  out.push(at(T_TURN, 'air', undefined, 0.36, undefined, 'floor'));
  struck(out, T_TURN, 'toll', 'D3', 0.45, 0.08);
  SHAPE_OFFSETS.forEach((offset, index) => {
    struck(out, T_TURN + offset, 'bell', SHAPE_DARK[index], [0.5, 0.52, 0.54][index], [-0.1, 0.14, -0.12][index]);
  });

  // --- 0:17.4 Emberwake, broadside ------------------------------------------
  // The hit, the root, a low toll and the shape's fourth note, all on the same instant as the
  // sequencer's downbeat. Emberwake's opening, compressed into one bar.
  struck(out, T_EMBERWAKE, 'bell', SHAPE_DARK[3], 0.42, 0.1);
  out.push(at(T_EMBERWAKE, 'strike', undefined, 0.72, 0, 'floor'));
  out.push(at(T_EMBERWAKE, 'low', 'D2', 0.46, 0, 'floor'));
  struck(out, T_EMBERWAKE, 'toll', 'D3', 0.36, -0.08);
  // The flat sixth, which is the other note act one was not allowed and the sequencer cannot play:
  // over a D root a B♭ is a minor sixth, and the deck's tracks are roots, fifths and octaves only.
  struck(out, 18.2, 'bell', 'Bb5', 0.5, -0.14);
  for (const [time, note, gain, pan] of [
    [17.9, 'A5', 0.46, 0.2],
    [18.4, 'D6', 0.48, -0.18],
    [18.65, 'C6', 0.5, 0.16],
    [18.9, 'Eb6', 0.54, -0.14],
    [19.15, 'C6', 0.52, 0.18],
  ]) {
    out.push(at(time, 'glint', note, gain, pan, 'melody'));
  }

  // --- 0:19.3 the gauntlet --------------------------------------------------
  // Pedal D, four on the floor, and the shape again an octave up and twice as fast — the same four
  // notes the bells played at 0:16, which is what makes this read as the same film accelerating
  // rather than as a new passage.
  out.push(at(T_GAUNTLET, 'low', 'D2', 0.55, 0, 'floor'));
  SHAPE_DARK_HIGH.forEach((note, index) => {
    out.push(at(T_GAUNTLET + index * 0.25, 'glint', note, 0.58 + index * 0.045, index % 2 === 0 ? -0.2 : 0.2, 'melody'));
  });
  // The near miss. Peril, not failure — a hit and a scrape thrown to one side, and the texture
  // comes back harder than it left.
  out.push(at(20.4, 'strike', undefined, 0.45, 0, 'floor'));
  out.push(at(20.42, 'pass', undefined, 0.55, 0.5, 'floor'));
  for (const [time, note, gain, pan] of [
    [20.55, 'Bb5', 0.56, -0.16],
    [20.8, 'D6', 0.6, 0.14],
    [21.05, 'F6', 0.64, -0.18],
  ]) {
    out.push(at(time, 'glint', note, gain, pan, 'melody'));
  }

  // --- 0:21.2 the magazine, and the run into it -----------------------------
  // Sixteenths into thirty-seconds into sixty-fourths, climbing an octave and a half in four
  // hundred milliseconds, and it stops at 21.60625 — **124 ms of nothing in front of the flash**.
  // An impact with music underneath it is a mix; an impact with nothing in front of it is an
  // impact, and it is also the only way to get a 20-odd dB step across one frame.
  const FUSE = [
    [T_MAGAZINE, 'D5'],
    [T_MAGAZINE + 0.125, 'F5'],
    [T_MAGAZINE + 0.25, 'A5'],
    [T_MAGAZINE + 0.3125, 'C6'],
    [T_MAGAZINE + 0.375, 'D6'],
    [T_MAGAZINE + 0.40625, 'F6'],
  ];
  FUSE.forEach(([time, note], index) => {
    out.push(at(time, 'glint', note, 0.6 + index * 0.05, index % 2 === 0 ? -0.16 : 0.16, 'melody'));
  });
  // The breath. `air`'s attack is 0.5 s, so struck here it peaks within twenty milliseconds of the
  // white frame and is the only thing rising through the gap.
  out.push(at(T_MAGAZINE + 0.03, 'air', undefined, 0.3, undefined, 'floor'));

  // --- 0:21.73 the white flash ----------------------------------------------
  out.push(at(T_FLASH, 'detonate', undefined, 1, 0, 'floor'));
  // The toll struck with it is at a *fifth* of the strength the same note gets on the end card,
  // and the reason is the hole rather than the blast: at 0.5 its 146 Hz hum made the half second
  // behind the flash the boomiest passage in the file, which is the exact opposite of air being
  // sucked out of a room.
  struck(out, T_FLASH, 'toll', 'D3', 0.1, 0);
  out.push(at(T_FLASH + 0.06, 'ring', undefined, 0.7, 0.12, 'floor'));
  // Air is placed by where it *peaks* and not by where it is struck: its attack is half a second,
  // so struck here it arrives as the picture comes back rather than swelling inside the hole.
  out.push(at(T_FLASH + 0.62, 'air', undefined, 0.42, undefined, 'floor'));

  // --- 0:22.4 embers --------------------------------------------------------
  // The same machine restarting at a quarter strength — one extra `deck.play` and no new data,
  // which is a whole dramatic idea for free. Three bells over it, slow and *decelerating*, because
  // a shore burning is not a build and an accelerando here would make first light a climax.
  out.push(at(T_PULSE_RETURN, 'low', 'A1', 0.26, 0, 'floor'));
  struck(out, 22.5, 'bell', 'A3', 0.4, -0.2);
  struck(out, 23.15, 'bell', 'D4', 0.44, 0.16);
  struck(out, 23.75, 'bell', 'F4', 0.44, -0.14);

  // --- 0:24.1 first light ---------------------------------------------------
  // The sequencer stops on the cut and is not faded. Three bells falling — `D A F`, which is the
  // shape with the flat second simply gone — and the fourth note of that fall is the end card, two
  // seconds later. Emberwake's ending, quoted.
  out.push(at(T_FIRST_LIGHT, 'wash', undefined, 0.68, undefined, 'floor'));
  out.push(at(T_FIRST_LIGHT, 'low', 'D2', 0.4, 0, 'floor'));
  const FALLING = [T_FIRST_LIGHT + 0.05, 24.85, 25.55];
  DAWN_FALL.forEach((note, index) => {
    struck(out, FALLING[index], 'bell', note, 0.44 - index * 0.04, [0.14, -0.12, 0.08][index]);
  });
  // A second wash with a one-second attack, so first light is still opening when the card lands.
  out.push(at(25.4, 'wash', undefined, 0.5, undefined, 'floor'));

  // --- 0:26.0 the end card --------------------------------------------------
  // D minor, struck low to high by one hand: eight to eighty-six milliseconds apart, which is what
  // a person playing a chord sounds like and is also worth about a decibel of peak against striking
  // them together. **No E♭ anywhere in it** — that absence is the resolution, and it is the first
  // bar since 0:16 without one.
  //
  // Struck about a decibel and a half under where it wants to be, and the reason is the shape of
  // the whole file rather than the shape of the chord: at full strength 0:26–0:27 measured as the
  // loudest *second* in the trailer, louder than the gauntlet and louder than the magazine. An
  // end card that outweighs the explosion it is recovering from is an end card that argues with
  // its own film.
  out.push(at(T_END_CARD, 'low', 'D2', 0.78, 0, 'floor'));
  for (const [kind, note, offset, gain, pan] of [
    ['toll', 'D3', 0.008, 0.47, -0.08],
    ['toll', 'D4', 0.02, 0.35, 0.1],
    ['bell', 'A4', 0.032, 0.33, -0.14],
    ['bell', 'D5', 0.044, 0.39, 0.06],
    ['bell', 'F5', 0.058, 0.36, -0.05],
    ['bell', 'A5', 0.07, 0.27, 0.16],
    ['bell', 'D6', 0.086, 0.22, -0.18],
  ]) {
    struck(out, T_END_CARD + offset, kind, note, gain, pan);
  }

  // --- 0:27.5 the reveal, and 0:28.6 the install line -----------------------
  // Two soft chimes over a chord that is still ringing, and nothing else. The card has a resolution
  // already; a second chord here would be a second ending, and an end card that lands its own chord
  // teaches the viewer that the film was over two seconds ago.
  //
  // Bells decay at about 20 dB a second — that is `exponentialRampToValueAtTime` to the floor and
  // there is no second stage to ask for — so the chord struck at 0:26 is well down by the reveal.
  // Re-striking its bass at a quarter strength is the only way to have a resolution still audible
  // at 0:29.9, and it states nothing new.
  out.push(at(T_REVEAL, 'tollShort', 'D3', 0.36, -0.06, 'melody'));
  struck(out, T_REVEAL + 0.014, 'chime', 'A5', 0.55, 0.1);
  out.push(at(T_REVEAL + 0.026, 'bell', 'D5', 0.3, -0.12, 'melody'));
  out.push(at(T_REVEAL + 0.04, 'bell', 'A4', 0.26, 0.14, 'melody'));
  // A last low D under the install line. Without it the final 1.3 s measured −51 dBFS, which is
  // not an ending, it is a file that has stopped; a bell's exponential is 20 dB a second and no
  // amount of gain on the chime buys a fourth second of it.
  out.push(at(T_INSTALL, 'low', 'D2', 0.3, 0, 'floor'));
  struck(out, T_INSTALL, 'chimeShort', 'D5', 0.38, -0.08);

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
 * keyed on the id, so seven notes of one recipe at seven detunes would be seven plays of the same
 * sound in the same instant and six of them would be thrown away. Seventy-four rows is what that
 * costs, of which seventy-one are one pitch of one instrument.
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
// The sequencer's four songs
// ---------------------------------------------------------------------------

/**
 * A kick out of one oscillator: a sine swept to a fraction of itself in an eighth of a second.
 * There is no other way to get a drum out of a table of ten numbers, and a sample would mean
 * shipping a binary for the sake of one thud.
 */
const KICK_SOFT = { wave: 'sine', gain: 0.13, hold: 0.13, cutoff: 360, sweepTo: 0.4, fixedHz: 88 };
const KICK_HARD = { wave: 'sine', gain: 0.15, hold: 0.12, cutoff: 380, sweepTo: 0.38, fixedHz: 92 };

/**
 * A sequencer track is **one voice with no layers**, so a drum that needs a body *and* an attack
 * has to be spelled as two tracks on the same steps. There is no other way to put a click on a
 * kick, and the two can drift apart the moment anything mutes one of them.
 */
const BEATER_SOFT = { wave: 'noise', gain: 0.025, hold: 0.012, highpass: 700, cutoff: 4000 };
const BEATER_HARD = { wave: 'noise', gain: 0.03, hold: 0.014, highpass: 700, cutoff: 4000 };

/**
 * **Act one: the montage.** Three bars, `D – C – F`, and they are exactly the montage's six seconds.
 *
 * The progression is one pass rather than a loop, which is unusual and deliberate: the window
 * `DECK_MONTAGE` is 6.0 s long and a bar is 2.0 s, so the sequencer plays bar 0, bar 1, bar 2 and
 * stops. Nothing repeats, so there is no seam to hide.
 *
 * The bass moves down a whole tone and then up a fourth — `i – ♭VII – ♭III` — which in D minor is
 * as open as a bass line gets without leaving the key. Every track plays roots, fifths, octaves or
 * a major second above the root, and over roots `D C F` that second lands on `E D G`: all three are
 * in {@link OPEN_SCALE}, and no combination of that scale can produce a tritone.
 *
 * `drift` is the one track with no intensity threshold, and it exists for one shot: at
 * {@link T_ORBIT} the intensity drops to 0.1 and every other track in this song goes quiet.
 */
export const SONG_OPEN = {
  bpm: BPM,
  steps: 16,
  rootHz: hz('D2'),
  progression: [0, -2, 3],
  seed: 11,
  tracks: [
    { id: 'kick', voice: KICK_SOFT, notes: [{ step: 0 }, { step: 8 }], minIntensity: 0.2 },
    { id: 'beat', voice: BEATER_SOFT, notes: [{ step: 0 }, { step: 8 }], minIntensity: 0.2 },
    {
      id: 'bass',
      voice: { wave: 'triangle', gain: 0.07, hold: 0.45, cutoff: 300 },
      notes: [{ step: 0 }, { step: 6, semis: 12 }, { step: 8 }, { step: 11, semis: 7 }, { step: 14, semis: 12 }],
      minIntensity: 0.15,
    },
    {
      // No threshold, on purpose. This is the only thing left in the air over the orbit shot, and
      // "no ground at all" is written here rather than described in a comment somewhere.
      id: 'drift',
      voice: { wave: 'triangle', gain: 0.05, hold: 0.7, cutoff: 2600 },
      notes: [{ step: 2, semis: 26 }, { step: 7, semis: 31 }, { step: 11, semis: 24 }],
      melodic: true,
    },
    {
      id: 'tick',
      voice: { wave: 'noise', gain: 0.04, hold: 0.028, highpass: 5200, cutoff: 12000 },
      notes: [{ step: 2 }, { step: 6 }, { step: 10 }, { step: 14 }],
      minIntensity: 0.3,
    },
    {
      // The arpeggio, in at 0:04.5 on the bar the harmony moves. Roots, fifths and octaves: the
      // deck transposes the whole track by the bar's root, so a third here would be a minor third
      // over D and a major one over F, and the film would change mode inside its own montage.
      id: 'weave',
      voice: { wave: 'triangle', gain: 0.075, hold: 0.3, cutoff: 3400 },
      notes: [
        { step: 1, semis: 24 },
        { step: 3, semis: 31 },
        { step: 4, semis: 36 },
        { step: 6, semis: 31 },
        { step: 8, semis: 24 },
        { step: 9, semis: 36 },
        { step: 11, semis: 31 },
        { step: 13, semis: 24 },
        { step: 14, semis: 31 },
      ],
      melodic: true,
      drop: 0.1,
      minIntensity: 0.55,
    },
    {
      // In at 0:04.5 with the arpeggio rather than at 0:07.1 with everything else, because act one
      // measured 5 dB darker above 2 kHz than the act it is supposed to be *brighter* than. A
      // trailer whose first two acts are open and whose third is cold cannot have its only air in
      // the third one, and eight sixteenths of hi-hat is the cheapest air there is.
      id: 'hat',
      voice: { wave: 'noise', gain: 0.045, hold: 0.03, highpass: 7500, cutoff: 13500 },
      notes: [{ step: 0 }, { step: 2 }, { step: 4 }, { step: 6 }, { step: 8 }, { step: 10 }, { step: 12 }, { step: 14 }],
      minIntensity: 0.6,
    },
    {
      // A held fifth in the steps nothing else speaks on. Emberwake learned this the expensive way:
      // its escalation measured 1 dB *quieter* than the bar before it, because every sequencer part
      // was short and the hand-struck line was carrying the whole crescendo alone.
      id: 'lift',
      voice: { wave: 'triangle', gain: 0.055, hold: 0.9, cutoff: 2200 },
      notes: [{ step: 5, semis: 19 }, { step: 12, semis: 24 }],
      melodic: true,
      minIntensity: 0.7,
    },
  ],
};

/**
 * **Act two: the machine.** Two bars, `D – G`, and it is played twice.
 *
 * Quiet by a factor of three against the montage — the loudest step here sums to 0.11 where the
 * montage's sums to 0.35 — because the whole act is one person at a desk and the only thing that
 * should be able to compete with the typewriter is the typewriter.
 *
 * The plagal move is doing real work at the very end: the second window's last nine hundred
 * milliseconds sit on `G`, and `G` pulling to `D` is what makes 0:16.0 land as an *arrival* rather
 * than as a change of subject. It resolves onto a chord with a flat second in it.
 */
export const SONG_WRITE = {
  bpm: BPM,
  steps: 16,
  rootHz: hz('D2'),
  progression: [0, 5],
  seed: 7,
  tracks: [
    {
      id: 'desk',
      voice: { wave: 'sine', gain: 0.085, hold: 0.5, cutoff: 240 },
      notes: [{ step: 0 }, { step: 8, semis: 12 }],
    },
    {
      id: 'caret',
      voice: { wave: 'noise', gain: 0.028, hold: 0.012, highpass: 3000, cutoff: 9000 },
      notes: [{ step: 4 }, { step: 12 }],
    },
    {
      id: 'walk',
      voice: { wave: 'triangle', gain: 0.06, hold: 0.22, cutoff: 2600 },
      notes: [{ step: 2, semis: 24 }, { step: 6, semis: 31 }, { step: 10, semis: 24 }, { step: 14, semis: 26 }],
      melodic: true,
      minIntensity: 0.42,
    },
    {
      id: 'glass',
      voice: { wave: 'triangle', gain: 0.05, hold: 0.5, cutoff: 4200 },
      notes: [
        { step: 1, semis: 36 },
        { step: 5, semis: 43 },
        { step: 9, semis: 38 },
        { step: 11, semis: 36 },
        { step: 13, semis: 43 },
      ],
      melodic: true,
      drop: 0.12,
      minIntensity: 0.6,
    },
    {
      // Under everything in act two rather than only over the last shot. Chime Path measured
      // −45 dB above 2 kHz — the darkest stretch in the file bar the beauty shot — and a game
      // called Chime Path is the one thing here that cannot be dull on top.
      id: 'dust',
      voice: { wave: 'noise', gain: 0.03, hold: 0.05, highpass: 6000, cutoff: 13000 },
      notes: [{ step: 3 }, { step: 7 }, { step: 11 }, { step: 15 }],
      minIntensity: 0.38,
    },
  ],
};

/**
 * **Act three, the raid.** Emberwake's song, quoted, with its progression cut to one bar.
 *
 * That cut is forced by the picture rather than chosen: act three's shots are 1.9 s and a bar at
 * 120 bpm is 2.0 s, so **no progression can move inside one of them**. Emberwake's `D – E♭ – D – C`
 * needed eight seconds. Here the flat second is carried entirely by the hand-struck bells over a
 * pedal D, which is the sharper version of the same idea anyway: `E♭` over a `D` bass is the most
 * direct "something is wrong out there" two notes can be.
 *
 * Played twice — the broadside at 0:17.4 and the embers at 0:22.4 — at two different intensities,
 * which is the point of it: the thing that comes back after the magazine is the *same machine*
 * restarting, and that costs one extra `deck.play` and no new data.
 */
export const SONG_RAID = {
  bpm: BPM,
  steps: 16,
  rootHz: hz('D2'),
  progression: [0],
  seed: 19,
  tracks: [
    { id: 'kick', voice: KICK_HARD, notes: [{ step: 0 }, { step: 8 }] },
    { id: 'beat', voice: BEATER_HARD, notes: [{ step: 0 }, { step: 8 }] },
    {
      id: 'bass',
      voice: { wave: 'triangle', gain: 0.075, hold: 0.75, cutoff: 300 },
      notes: [{ step: 0 }, { step: 8, semis: 12 }, { step: 11, semis: 7 }],
    },
    {
      // The offbeat, and the one that turns a pulse into a thing under way.
      id: 'tick',
      voice: { wave: 'noise', gain: 0.045, hold: 0.03, highpass: 5200, cutoff: 12000 },
      notes: [{ step: 2 }, { step: 6 }, { step: 10 }, { step: 14 }],
      minIntensity: 0.4,
    },
    {
      id: 'drive',
      voice: { wave: 'triangle', gain: 0.085, hold: 0.3, cutoff: 3600 },
      notes: [
        { step: 1, semis: 24 },
        { step: 3, semis: 31 },
        { step: 4, semis: 36 },
        { step: 6, semis: 31 },
        { step: 7, semis: 24 },
        { step: 8, semis: 24 },
        { step: 10, semis: 36 },
        { step: 11, semis: 31 },
        { step: 13, semis: 24 },
        { step: 14, semis: 31 },
      ],
      melodic: true,
      drop: 0.12,
      minIntensity: 0.6,
    },
    { id: 'kick2', voice: KICK_HARD, notes: [{ step: 4 }, { step: 12 }], minIntensity: 0.8 },
    {
      id: 'hat',
      voice: { wave: 'noise', gain: 0.05, hold: 0.034, highpass: 7500, cutoff: 13500 },
      notes: [{ step: 0 }, { step: 2 }, { step: 4 }, { step: 6 }, { step: 8 }, { step: 10 }, { step: 12 }, { step: 14 }],
      minIntensity: 0.85,
    },
    {
      // A struck double octave on the downbeat. In Emberwake this was masked to two bars of four so
      // the loop would stop announcing where it began; here there is one bar and nothing to hide,
      // so the mask is gone rather than left in place as decoration that can never fire.
      id: 'clang',
      voice: { wave: 'triangle', gain: 0.09, hold: 1, cutoff: 4200 },
      notes: [{ step: 0, semis: 36 }],
      minIntensity: 0.75,
    },
    {
      id: 'swell',
      voice: { wave: 'triangle', gain: 0.06, hold: 0.9, cutoff: 2400 },
      notes: [{ step: 5, semis: 19 }, { step: 9, semis: 19 }, { step: 15, semis: 12 }],
      melodic: true,
      minIntensity: 0.65,
    },
  ],
};

/**
 * **Act three, the gauntlet.** One bar of pedal D, and the densest thing in the file.
 *
 * *Relentless, not louder* means the harmony stops moving and the rhythm does not: four on the
 * floor, ten sixteenths of ostinato, and two hats. Nothing here is louder than the raid — measure
 * it — and it is about twice as dense.
 */
export const SONG_DRIVE = {
  bpm: BPM,
  steps: 16,
  rootHz: hz('D2'),
  progression: [0],
  seed: 23,
  tracks: [
    { id: 'kick', voice: KICK_HARD, notes: [{ step: 0 }, { step: 4 }, { step: 8 }, { step: 12 }] },
    { id: 'beat', voice: BEATER_HARD, notes: [{ step: 0 }, { step: 4 }, { step: 8 }, { step: 12 }] },
    {
      id: 'bass',
      voice: { wave: 'triangle', gain: 0.085, hold: 0.42, cutoff: 320 },
      notes: [{ step: 0 }, { step: 3 }, { step: 6 }, { step: 8, semis: 12 }, { step: 11 }, { step: 14 }],
    },
    {
      id: 'ost',
      voice: { wave: 'triangle', gain: 0.095, hold: 0.26, cutoff: 3800 },
      minIntensity: 0.5,
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
      voice: { wave: 'noise', gain: 0.055, hold: 0.03, highpass: 7500, cutoff: 13500 },
      notes: [{ step: 2 }, { step: 6 }, { step: 10 }, { step: 14 }],
      minIntensity: 0.4,
    },
    {
      id: 'hat2',
      voice: { wave: 'noise', gain: 0.04, hold: 0.022, highpass: 9000, cutoff: 15000 },
      notes: [{ step: 1 }, { step: 3 }, { step: 5 }, { step: 7 }, { step: 9 }, { step: 11 }, { step: 13 }, { step: 15 }],
      minIntensity: 0.9,
    },
  ],
};

/** Every song, with the act it belongs to, so {@link problems} can audit its pitch classes. */
const SONGS = [
  { name: 'open', song: SONG_OPEN, dark: false },
  { name: 'write', song: SONG_WRITE, dark: false },
  { name: 'raid', song: SONG_RAID, dark: true },
  { name: 'drive', song: SONG_DRIVE, dark: true },
];

/**
 * How busy the sequencer is at a given moment. A staircase, and every riser is a bar line.
 *
 * **The earliest riser a window can hold is `from + LOOKAHEAD_SEC`**, and this is the sharpest
 * edge in the deck's API. `deck.play` pumps immediately and schedules a bar and a half in one go
 * at whatever the intensity happens to be *then*, so a change written inside the first 1.5 s of a
 * song is read too late to affect anything and is silently ignored. It is also why
 * {@link DECK_WRITE_B} opens at 13.0 rather than 13.1: its riser has to land on 14.5.
 *
 * Act three's windows are 1.9 s each, which is 0.4 s of room. So act three has no staircase at
 * all — each of its windows is played at one intensity and the escalation is written across the
 * windows instead of inside them.
 */
function intensityAt(seconds) {
  // Act one, the montage: a layer on each bar line, and the floor removed for the orbit.
  if (seconds < 4.5) return 0.35;
  if (seconds < T_ORBIT) return 0.65;
  if (seconds < T_CLAY) return 0.1;
  if (seconds < T_SENTENCE_TWO) return 0.4;
  // Act two: thin under Evenfall Orchard, and one layer more for Before the Bell.
  if (seconds < T_BELL) return 0.45;
  if (seconds < T_TURN) return 0.85;
  // Act three: two steps, one per window, because a 1.9 s window cannot hold a riser.
  if (seconds < T_GAUNTLET) return 0.8;
  if (seconds < T_MAGAZINE) return 1;
  return 0.25;
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
 * `render.mjs` prints the peak *after* applying it and `build.mjs` refuses a master outside a
 * window around −1.00 dBFS, so this number is checked on every render rather than trusted.
 *
 * **Nothing inside `@latticekit/audio` could do this.** See {@link MASTER_GAIN}.
 */
export const OUTPUT_TRIM = 1.834;

/**
 * The voice ceiling, raised, and the one place this score argues with the package.
 *
 * A voice is counted against the ceiling until its **scheduled end**, and a bell's scheduled end
 * is three seconds after it was struck. The default 24 therefore permits about four bells in any
 * three-second window across the entire piece, which is a sensible defense against a burst of
 * gameplay sounds and is not a budget a piece of music can be written inside. The end card's
 * chord alone is seventy voices, over a first light that is still ringing. The sequencer bypasses
 * the ceiling entirely, so the same notes played from a song cost nothing; only music written as
 * one-shots pays.
 */
const MAX_VOICES = 512;

/**
 * The pan limit, widened, and the second place this score argues with the package.
 *
 * The default is **0.6**, and that is a *game* default rather than a wrong one: a `StereoPanner` at
 * 1.0 removes a sound from one ear entirely, and a player who cannot hear the alarm because it
 * happened on their left is a player the ceiling exists for. A trailer master has the opposite
 * problem — it is heard on two speakers a meter apart or on headphones, once, and the whole point
 * of writing a reverb into the score as opposite-panned ghosts is width it cannot have at 0.6.
 *
 * Load-bearing rather than decorative: {@link reflectionPan} puts the near wall at −0.72, which
 * the default would silently clamp to −0.6 and no error would say so. It is worth being clear that
 * the *reason* to override this is a property of the delivery and not of the music — the same
 * override inside a game is the exact bug the default prevents.
 */
const MAX_PAN = 0.85;

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
    // the song starts on — which here is the hit on the broadside.
    const windows = [
      { window: DECK_MONTAGE, song: SONG_OPEN },
      { window: DECK_WRITE_A, song: SONG_WRITE },
      { window: DECK_WRITE_B, song: SONG_WRITE },
      { window: DECK_RAID, song: SONG_RAID },
      { window: DECK_DRIVE, song: SONG_DRIVE },
      { window: DECK_EMBERS, song: SONG_RAID },
    ];
    for (const { window, song } of windows) {
      timeline.push({ at: window.from, order: 0, run: () => deck.play(song, { fadeSec: 0 }) });
      // Stopping the sequencer on an exact instant takes three calls and a subtraction, because
      // there is no "schedule up to time X": a pump always reaches LOOKAHEAD_SEC and no further.
      // So the last pump is forced at exactly `to - LOOKAHEAD_SEC`, where its horizon lands on the
      // landmark, and the stop follows it in the same instant. Left to the ordinary cadence the
      // *music* becomes a function of the timer, which the determinism check would catch as a
      // missing bar and a half. `pump` schedules `time < horizon` strictly, so a note falling
      // exactly on `to` is excluded — which is what makes 0:08.5 the last thing in act one.
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

/**
 * How loud one event still is at time `when`, in linear gain, summed over its layers.
 *
 * The envelope is `peak → GAIN_FLOOR` exponentially over `attack + hold`, which is
 * `peak · (floor / peak)^(t / life)`. Tier B — `**` is `pow` — and that is fine here and only
 * here: this number is printed to a human and is never hashed and never persisted.
 */
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

/**
 * Every pitch class this score can sound, per act, as semitones above D.
 *
 * One-shots contribute the degree of their note name. A sequencer track contributes
 * `root + semis` for every bar of its progression — except percussion, which has a `fixedHz` and
 * therefore no pitch at all. Returned rather than asserted so {@link problems} can say which act
 * a stray note landed in.
 */
function degrees() {
  const light = new Set();
  const dark = new Set();
  for (const event of EVENTS) {
    if (event.note === undefined) continue;
    (event.at >= T_TURN ? dark : light).add(degreeOf(event.note));
  }
  for (const { song, dark: isDark } of SONGS) {
    const into = isDark ? dark : light;
    for (const track of song.tracks) {
      if (track.voice.fixedHz !== undefined) continue;
      for (const root of song.progression) {
        for (const note of track.notes) into.add((((root + (note.semis ?? 0)) % 12) + 12) % 12);
      }
    }
  }
  return { light, dark };
}

/**
 * Everything the package can tell us about this score without rendering it, plus five things it
 * cannot. Run before every render — a table fault is a worse sound with no error, and `build.mjs`
 * exits non-zero if this returns anything at all.
 *
 * The five extra checks are the ones this film's brief actually turns on:
 *
 * | check | what it would otherwise cost |
 * |---|---|
 * | every event inside `[0, DURATION_SEC]` | a note written into a file that has already ended |
 * | nothing above −60 dBFS at the final sample | a click instead of an ending |
 * | **nothing struck inside the cut to black** | the hinge of the film, played through |
 * | **acts one and two inside a tritone-free scale, act three inside D Phrygian** | the whole musical argument, silently |
 * | **the flat second appears after 0:16 and never before** | the same, from the other direction |
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

  for (const event of EVENTS) {
    const definition = SOUNDS[event.id];
    if (definition === undefined) {
      found.push(`event at ${event.at}: no sound called ${event.id}`);
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

  // --- the harmonic argument, checked rather than described -----------------
  const { light, dark } = degrees();
  const NAMES = ['D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B', 'C', 'C#'];
  for (const degree of light) {
    if (!OPEN_SCALE.includes(degree)) {
      found.push(`${NAMES[degree]} sounds before 0:16 — acts one and two are ${OPEN_SCALE.map((d) => NAMES[d]).join(' ')} and nothing else`);
    }
  }
  for (const degree of dark) {
    if (!DARK_SCALE.includes(degree)) {
      found.push(`${NAMES[degree]} sounds after 0:16 — act three is D Phrygian and nothing else`);
    }
  }
  if (light.has(FLAT_SECOND)) found.push('the flat second sounds before 0:16, which is the one note the first two acts exist to withhold');
  if (!dark.has(FLAT_SECOND)) found.push('the flat second never sounds — act three is the reason this score exists');
  // The property that makes "no tritone" a fact rather than a hope: no two degrees of the first
  // two acts' collection are six semitones apart, so no voicing of it can state one.
  for (const a of light) {
    for (const b of light) {
      if ((((a - b) % 12) + 12) % 12 === 6) found.push(`${NAMES[b]} and ${NAMES[a]} are a tritone apart and both sound before 0:16`);
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
  /** The hinge. Half a second of nothing, and the second most important instant in the film. */
  black: [T_BLACK, T_BLACK_END],
  sentence: T_SENTENCE,
  chimePath: T_CHIME_PATH,
  sentenceTwo: T_SENTENCE_TWO,
  orchard: T_ORCHARD,
  beforeTheBell: T_BELL,
  /** Where the E♭ arrives. The third sync point. */
  turn: T_TURN,
  emberwake: T_EMBERWAKE,
  gauntlet: T_GAUNTLET,
  magazine: T_MAGAZINE,
  /** The one instant that cannot move. Everything else here is allowed to breathe. */
  flash: T_FLASH,
  pulseReturn: T_PULSE_RETURN,
  firstLight: T_FIRST_LIGHT,
  endCard: T_END_CARD,
  reveal: T_REVEAL,
  install: T_INSTALL,
  /** The stretch the picture is still white through, where nothing may be struck. */
  blind: [T_FLASH + 0.07, T_FLASH + 0.62],
  /** Every bar line the sequencer actually plays, across all six windows. */
  bars: [DECK_MONTAGE, DECK_WRITE_A, DECK_WRITE_B, DECK_RAID, DECK_DRIVE, DECK_EMBERS].flatMap((window) =>
    Array.from({ length: Math.ceil((window.to - window.from) / BAR_SEC) }, (unused, index) => window.from + index * BAR_SEC),
  ),
  /** Where each sequencer window stops scheduling. */
  stops: [DECK_MONTAGE, DECK_WRITE_A, DECK_WRITE_B, DECK_RAID, DECK_DRIVE, DECK_EMBERS].map((window) => window.to),
  /** The sixteenth-note grid, per window, for the transient alignment check. */
  grid: [DECK_MONTAGE, DECK_WRITE_A, DECK_WRITE_B, DECK_RAID, DECK_DRIVE, DECK_EMBERS].flatMap((window) =>
    Array.from({ length: Math.ceil((window.to - window.from) / 0.125) + 1 }, (unused, index) => window.from + index * 0.125),
  ),
};
