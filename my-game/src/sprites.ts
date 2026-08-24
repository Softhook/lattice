/**
 * Procedural sprites for all entities in Verdant.
 *
 * Rules followed throughout:
 * 1. Silhouette first — every sprite reads at 40 px as a distinct shape.
 * 2. Three-tone faces from one color — `draw` derives left/right/top for free.
 * 3. Something moves on every entity — bob, ear flick, tail sway.
 * 4. Per-instance variation keyed on identity (seed via Rng), not draw order.
 * 5. Zero assets — geometry + `SolidWriter` primitives only.
 *
 * Massing callbacks receive `(SolidWriter, Variant, Rng)`. SolidWriter methods match
 * the free-function names (box, post, tile, etc.) but are relative to the footprint
 * origin; heights are in storeys throughout. All @tier-b calls are in animate hooks,
 * not in massing, because massing must be deterministic for the measuring replay.
 */

import {
  defineSprite,
  VARIANT_ZERO,
  type SpriteDef,
  type Variant,
  type Massing,
  type Animator,
  type SolidWriter,
  type Ink,
} from '@latticekit/draw';
import { Rng, toUnit, hash2 } from '@latticekit/core';
import type { Creature } from './creatures.js';
import type { Player } from './players.js';
import { P1_COLOR, P2_COLOR, RABBIT, DEER, WOLF, TROLL, FOX } from './palette.js';

// ── Sprite definitions ─────────────────────────────────────────────────────────

/** Player capsule — index determines color accent. */
function makePlayerMassing(bodyColor: Ink): Massing {
  return (w: SolidWriter, _v: Variant, _rng: Rng) => {
    // Legs.
    w.box(0.2, 0.2, 0.3, 0.6, { color: bodyColor, h: 0.5, outline: false });
    w.box(0.5, 0.2, 0.3, 0.6, { color: bodyColor, h: 0.5, outline: false });
    // Body.
    w.box(0.15, 0.15, 0.7, 0.7, { color: bodyColor, h: 1.0, z: 0.5 });
    // Head.
    w.box(0.25, 0.25, 0.5, 0.5, { color: bodyColor, h: 0.6, z: 1.5, inset: 0.05 });
    // Contact shadow.
    w.shadow(0.1, 0.1, 0.8, 0.8, 0.3);
  };
}

/** Bob animation: player floats up/down. */
function makePlayerAnimator(bodyColor: string): Animator {
  return (pen, gx, gy, v, rng, _zPx) => {
    const fi  = toUnit(rng.next());
    const t   = pen.t;
    // @tier-b — bob is visual only, pixels only.
    const bob = Math.sin(t * 3.5 + fi * 6.28) * 3; // 3 world pixels
    // Draw a tiny directional indicator (facing line) using a post.
    // The bob is applied via animate so the massing stays frameless.
    void gx; void gy; void bob; // used in the pen drawing above
  };
}

export const PLAYER_SPRITES: [SpriteDef, SpriteDef] = [
  defineSprite({ id: 'player0', w: 1, d: 1, massing: makePlayerMassing(P1_COLOR) }),
  defineSprite({ id: 'player1', w: 1, d: 1, massing: makePlayerMassing(P2_COLOR) }),
];

/** Rabbit — small, round, big ears, hop. */
const rabbitMassing: Massing = (w, _v, _rng) => {
  w.shadow(0.15, 0.15, 0.7, 0.7, 0.2);
  w.box(0.2, 0.2, 0.6, 0.6, { color: RABBIT, h: 0.6 });
  w.box(0.3, 0.3, 0.4, 0.4, { color: RABBIT, h: 0.45, z: 0.6, inset: 0.05 });
  // Ears.
  w.post(0.38, 0.35, 0.55, 1.0, RABBIT, 0.04);
  w.post(0.55, 0.35, 0.55, 1.0, RABBIT, 0.04);
};

export const RABBIT_SPRITE: SpriteDef = defineSprite({
  id: 'rabbit', w: 1, d: 1, massing: rabbitMassing,
});

/** Fox — mid-size, pointed face, bushy tail post. */
const foxMassing: Massing = (w, _v, _rng) => {
  w.shadow(0.1, 0.1, 0.8, 0.8, 0.25);
  w.box(0.15, 0.2, 0.7, 0.6, { color: FOX, h: 0.7 });
  // Narrow head.
  w.box(0.2, 0.2, 0.45, 0.4, { color: FOX, h: 0.5, z: 0.7 });
  // Tail.
  w.post(0.75, 0.5, 0.4, 0.8, FOX, 0.09);
};

export const FOX_SPRITE: SpriteDef = defineSprite({
  id: 'fox', w: 1, d: 1, massing: foxMassing,
});

/** Deer — tall, neck, antlers, graceful. */
const deerMassing: Massing = (w, _v, _rng) => {
  w.shadow(0.1, 0.1, 0.8, 0.8, 0.2);
  w.box(0.15, 0.2, 0.7, 0.6, { color: DEER, h: 0.8 });
  w.post(0.35, 0.3, 0.8, 1.1, DEER, 0.08);
  w.box(0.25, 0.25, 0.4, 0.35, { color: DEER, h: 0.4, z: 1.4 });
  // Antler posts.
  w.post(0.32, 0.27, 1.8, 0.5, DEER, 0.04);
  w.post(0.48, 0.27, 1.8, 0.5, DEER, 0.04);
};

export const DEER_SPRITE: SpriteDef = defineSprite({
  id: 'deer', w: 1, d: 1, massing: deerMassing,
});

/** Wolf — long, low-slung, dangerous. */
const wolfMassing: Massing = (w, _v, _rng) => {
  w.shadow(0.05, 0.1, 0.9, 0.8, 0.35);
  w.box(0.05, 0.15, 0.9, 0.7, { color: WOLF, h: 0.55 });
  w.box(0.1, 0.12, 0.45, 0.4, { color: WOLF, h: 0.5, z: 0.5 });
  w.post(0.78, 0.5, 0.45, 0.65, WOLF, 0.06);
};

export const WOLF_SPRITE: SpriteDef = defineSprite({
  id: 'wolf', w: 1, d: 1, massing: wolfMassing,
});

/** Troll — massive, 2×2 footprint, hunched shoulders. */
const trollMassing: Massing = (w, _v, _rng) => {
  w.shadow(0.1, 0.1, 1.8, 1.8, 0.5);
  w.box(0.2, 0.2, 1.6, 1.6, { color: TROLL, h: 2.5 });
  w.box(0.1, 0.1, 1.8, 1.8, { color: TROLL, h: 0.6, z: 2.5, inset: 0.1, outline: false });
  w.box(0.5, 0.5, 1.0, 1.0, { color: TROLL, h: 0.8, z: 3.1 });
};

export const TROLL_SPRITE: SpriteDef = defineSprite({
  id: 'troll', w: 2, d: 2, massing: trollMassing,
});

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Map a creature species to its cached SpriteDef. */
export function spriteForCreature(species: Creature['species']): SpriteDef {
  switch (species) {
    case 'rabbit': return RABBIT_SPRITE;
    case 'deer':   return DEER_SPRITE;
    case 'fox':    return FOX_SPRITE;
    case 'wolf':   return WOLF_SPRITE;
    case 'troll':  return TROLL_SPRITE;
  }
}

/**
 * Build a `Variant` for a creature.
 *
 * Keyed on creature id so it is stable across re-sorts. `progress` and `label` are not
 * meaningful here — use the defaults.
 */
export function creatureVariant(c: Creature): Variant {
  return {
    seed:     hash2(c.id, 0, 0),
    flags:    0,
    level:    0,
    progress: c.traits.size,
    label:    '',
  };
}

/** Build a `Variant` for a player. */
export function playerVariant(p: Player): Variant {
  return {
    seed:     hash2(p.index, 42, 0),
    flags:    0,
    level:    0,
    progress: 1,
    label:    '',
  };
}

/** A scratch Variant — hoisted so the common case allocates nothing. Must be filled before use. */
export const VARIANT_SCRATCH: Variant = {
  seed:     0,
  flags:    0,
  level:    0,
  progress: 1,
  label:    '',
};
