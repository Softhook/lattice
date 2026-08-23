/**
 * Every color in the game, once. **@art**
 *
 * A night raid is a two-temperature picture and nothing else: everything the sea touches is cold
 * and everything fire touches is warm, and the whole readability of the frame rests on nothing
 * in the middle. So there is no "warm grey" here, no neutral wood, and no orange in the water —
 * the water goes warm only where a light pool puts it, which is the point of having a light pool.
 *
 * The base ten slots are `NIGHT`'s, because this game has exactly one hour and never leaves it.
 * A day cycle would be `palette.lerp` and about four lines; it is deliberately absent, because
 * every argument this scene makes is an argument about the dark.
 */

import { NIGHT, createPalette, extendStops, hex, type Palette, type Stops } from '@latticekit/draw';

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

/** The palette every frame is painted through. Built once; nothing mutates it, so `rev` never
 *  moves and every soft-ellipse ramp the backend caches stays cached for the whole session. */
export function emberwakePalette(): Palette {
  return createPalette(extendStops(NIGHT, EMBERWAKE));
}
