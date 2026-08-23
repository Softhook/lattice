/**
 * Every color in the game, once. **@art**
 *
 * A night raid is a two-temperature picture and nothing else: everything the sea touches is cold
 * and everything fire touches is warm, and the whole readability of the frame rests on nothing
 * in the middle. So there is no "warm grey" here, no neutral wood, and no orange in the water —
 * the water goes warm only where a light pool puts it, which is the point of having a light pool.
 *
 * ## There are two of these, and the run walks from one to the other
 *
 * The first build had exactly one hour and never left it, and said so: "a day cycle would be
 * `palette.lerp` and about four lines; it is deliberately absent". That was the right call for a
 * game with no clock and the wrong one for a game whose whole tension is a clock. The raid now
 * has a hundred seconds before first light, and **the sky is the timer** — there is no number a
 * player has to watch, because the picture itself is the readout.
 *
 * The two sets below define **exactly the same slots**, which `Palette.lerp` requires and which
 * is worth stating rather than trusting: a half-defined second set leaves one thing at midnight
 * while everything around it comes up, and the failure is silent in every slot that happens to
 * match. Read them as two columns — every cold value warms, every warm value stays exactly where
 * it is, because fire does not change colour when the sun comes up.
 *
 * The lerp is only taken {@link DAWN_REACH} of the way to `DUSK`. A full sunrise would be a
 * prettier last frame and a worse game: the fire is the only bright thing in this picture, and
 * the moment the sea can compete with it the whole composition stops working.
 */

import { DUSK, NIGHT, createPalette, extendStops, hex, type Palette, type Stops } from '@latticekit/draw';

/**
 * The game's own vocabulary, on top of the kit's ten.
 *
 * Written as one aligned block so a reviewer can read *down* a column — every cold value in the
 * first group, every warm one in the third — which is the whole reason `Stops` is a flat record
 * rather than a tree.
 */
const EMBERWAKE: Stops = {
  // the sea, in four depths. The spread between `seaDeep` and `seaFar` is small on purpose: a
  // high-contrast sea reads as a chart of a sea, and everything interesting here is what the
  // fire does to it.
  seaFar: hex('16294a'),
  sea: hex('0d1c36'),
  seaDeep: hex('070f22'),
  shoal: hex('1b3a55'),
  foam: hex('b7d3e8'),
  surf: hex('6d97b6'),

  // the land. Night vegetation is not green, it is blue-green, and sand at night is not yellow.
  sand: hex('564a37'),
  grass: hex('243729'),
  scrub: hex('2e3d2b'),
  rock: hex('323744'),
  stone: hex('474d59'),

  // wood, in the three states fire moves it through.
  wood: hex('6a4b30'),
  plank: hex('8a6742'),
  char: hex('1d191b'),

  // fire. Three stops and a smoke, and the core is nearly white — a flame whose hottest point is
  // orange reads as a paper cut-out of a flame.
  flame: hex('ff9a2b'),
  fcore: hex('ffeeb4'),
  ember: hex('ff5f1a'),
  fume: hex('232a3c'),

  // the hulls. The player is the only warm thing on the water that is not on fire, which is what
  // makes her findable in a frame with nine other boats in it.
  hull: hex('a8471f'),
  deck: hex('9c7a4e'),
  trim: hex('f0dfbe'),
  lamp: hex('ffcf7a'),
  raider: hex('433448'),
  rdeck: hex('5d4a5c'),
  rsail: hex('8a7f8c'),
  rlamp: hex('7fe0b0'),
  iron: hex('434956'),
};


/**
 * First light. Every cold slot in {@link EMBERWAKE} warmed and lifted; every hot one identical.
 *
 * Aligned against the block above on purpose — a reviewer should be able to read *across* a row
 * and see what an hour did to one colour, and *down* a column to see that the whole sea moved
 * together. That is the entire reason `Stops` is a flat record.
 */
const EMBERWAKE_DAWN: Stops = {
  seaFar: hex('3d3a58'),
  sea: hex('262742'),
  seaDeep: hex('16182c'),
  shoal: hex('3d4664'),
  foam: hex('d9d2d8'),
  surf: hex('928ea8'),

  sand: hex('6d5c44'),
  grass: hex('34412f'),
  scrub: hex('3e4734'),
  rock: hex('474555'),
  stone: hex('5e5c68'),

  wood: hex('7b5738'),
  plank: hex('9c764e'),
  char: hex('251f23'),

  flame: hex('ff9a2b'),
  fcore: hex('ffeeb4'),
  ember: hex('ff5f1a'),
  fume: hex('3c3849'),

  hull: hex('b8511f'),
  deck: hex('ac8858'),
  trim: hex('f5e6cb'),
  lamp: hex('ffd88f'),
  raider: hex('56455d'),
  rdeck: hex('6e596e'),
  rsail: hex('9d919f'),
  rlamp: hex('7fe0b0'),
  iron: hex('555b69'),
};

/** The two ends of the run, as complete stop sets. Handed to `Palette.lerp` every frame; it
 *  quantises to 32 levels itself and bumps `rev` only when the level changes, so the sprite and
 *  ramp caches survive a continuous sunrise. */
export const NIGHT_STOPS: Stops = extendStops(NIGHT, EMBERWAKE);
/** See {@link NIGHT_STOPS}. */
export const DAWN_STOPS: Stops = extendStops(DUSK, EMBERWAKE_DAWN);

/**
 * How far toward `DUSK` a full hundred seconds actually goes.
 *
 * Not 1. At 1 the sea is brighter than the fire on it and the game stops being about the dark;
 * at 0.44 the horizon has gone from black to bruised, every hull is legible without a lamp, and
 * a player who looks up knows exactly how long they have left.
 */
export const DAWN_REACH = 0.44;

/** The palette every frame is painted through. Built once and then *walked* from
 *  {@link NIGHT_STOPS} to {@link DAWN_STOPS} as the run burns down — thirty-two times in a
 *  hundred seconds, which is what the quantisation buys. */
export function emberwakePalette(): Palette {
  return createPalette(NIGHT_STOPS);
}
