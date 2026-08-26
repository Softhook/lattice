/**
 * Buildings: catalogue, massings, placement, costs, and collision logic.
 *
 * A building is a placed structure on a tile. Walls block both players and animals. Towers
 * block animals but not players — walking onto a tower's footprint climbs onto its lookout
 * platform (extended bow range, extended personal torchlight) instead of being stopped by it.
 * Gates block animals but not players, letting a player pass a perimeter wall line while
 * keeping wildlife and predators out.
 *
 * Sprite massings use `SolidWriter` — the declarative emitter — so the same
 * massing drives both drawing and thumbnail generation.
 */

import {
  defineSprite,
  levelsToPx,
  type SpriteDef,
  type Massing,
  type SolidWriter,
  type Variant,
  hex,
} from '@latticekit/draw';
import { Rng } from '@latticekit/core';
import { footprintBase, type Footprint } from '@latticekit/iso';
import { TOWER, FLOOR, MAGIC_GLOW, MAGIC_GLOW_CORE } from './palette.js';
import type { WorldTerrain } from './world.js';
import { W, H, MAT_WATER } from './world.js';

// ── Building Colors ───────────────────────────────────────────────────────────

export const WALL_WOOD    = hex('#795548');
export const WALL_BEAM    = hex('#4e342e');
export const WALL_STONE   = hex('#78909c');
export const STONE_DARK   = hex('#546e7a');
export const LANTERN_GLOW = hex('#f1c40f');
export const FIRE_ORANGE  = hex('#ff793f');
export const FIRE_YELLOW  = hex('#f6b93b');
export const FIRE_CORE    = hex('#fff275');
export const ASH_DARK     = hex('#2f3542');
export const EMBER_RED    = hex('#eb2f06');
export const WIZARD_STONE      = hex('#1c1a24');
export const WIZARD_STONE_DARK = hex('#0d0c12');
export const WIZARD_TRIM       = hex('#3a2a52');

// ── Building kinds ─────────────────────────────────────────────────────────────

/** `wizard_tower` is a mission structure, not a player-buildable kind: `missions.ts` raises it
 *  directly via `restoreBuilding` when its mission triggers, so it never appears in
 *  `players.ts`'s `PLAYER_MODES` / the Inventory craft tab. It still lives in this same registry
 *  because doing so gets it depth-sorted rendering, HP/destruction, and player-facing block/attack
 *  collision for free — the entire reason a "mission tower" is modeled as a `Building` at all. */
export type BuildingKind = 'campfire' | 'palisade' | 'wood_wall' | 'stone_wall' | 'wood_tower' | 'stone_tower' | 'floor' | 'gate' | 'wizard_tower';

export interface BuildingCost {
  readonly wood: number;
  readonly stone: number;
  readonly fiber?: number;
}

export const BUILDING_COSTS: Record<BuildingKind, BuildingCost> = {
  campfire:    { wood: 4,  stone: 2, fiber: 2 },
  palisade:    { wood: 2,  stone: 0 },
  wood_wall:   { wood: 4,  stone: 0 },
  stone_wall:  { wood: 0,  stone: 4 },
  wood_tower:  { wood: 12, stone: 2 },
  stone_tower: { wood: 6,  stone: 14 },
  floor:       { wood: 2,  stone: 0 },
  gate:        { wood: 4,  stone: 8 },
  // Never spent — a mission tower is raised by `missions.ts`, not bought from the Inventory.
  wizard_tower: { wood: 0, stone: 0 },
};

/** Seconds a player must hold the Interact action on the placement ghost to raise this
 *  structure. Roughly tracks material cost — see `workSecondsFor` in `players.ts`. */
export const BUILD_WORK_SECONDS: Record<BuildingKind, number> = {
  campfire:    0.8,
  palisade:    0.3,
  wood_wall:   0.6,
  stone_wall:  1.1,
  wood_tower:  1.6,
  stone_tower: 2.2,
  floor:       0.4,
  gate:        1.0,
  // Never channeled — see the `wizard_tower` note on `BUILDING_COSTS`.
  wizard_tower: 0,
};

/** A placed structure in the world. */
export interface Building {
  readonly id: number;
  readonly kind: BuildingKind;
  /** Tile position — the north corner of the building's footprint. */
  readonly gx: number;
  readonly gy: number;
  /** Footprint in tiles. */
  readonly w: number;
  readonly d: number;
  /** Ground height under footprint in world pixels. Set at placement. */
  readonly basePx: number;
  /** Hit points — hostile trolls reduce this over time. */
  hp: number;
  readonly maxHp: number;
}

// ── Sprite Definitions ─────────────────────────────────────────────────────────

/** Palisade Stake: A single sharpened log, planted dead-center in its tile. The cheapest and
 *  quickest wall — being centered rather than edge-to-edge, it lines up on its own whether a
 *  run of stakes goes straight or turns a corner, so unlike the gate it needs no per-neighbor
 *  orientation logic. */
const palisadeMassing: Massing = (w: SolidWriter, _v: Variant, _rng: Rng) => {
  w.shadow(0.32, 0.32, 0.36, 0.36, 0.3);
  // Buried footing
  w.box(0.4, 0.4, 0.2, 0.2, { color: WALL_BEAM, h: 0.15, outline: false });
  // Single trunk, centered in the tile
  w.box(0.36, 0.36, 0.28, 0.28, { color: WALL_WOOD, h: 1.5, z: 0.12 });
  // Sharpened tip
  w.box(0.4, 0.4, 0.2, 0.2, { color: WALL_BEAM, h: 0.4, z: 1.62 });
};

export const PALISADE_DEF: SpriteDef = defineSprite({ id: 'bld_palisade', w: 1, d: 1, massing: palisadeMassing });

/** Timber Wall: Braced timber planking, edge-to-edge across the tile. */
const woodWallMassing: Massing = (w: SolidWriter, _v: Variant, _rng: Rng) => {
  w.shadow(0, 0, 1, 1, 0.35);
  // Log base footing
  w.box(0, 0, 1, 1, { color: WALL_BEAM, h: 0.3, outline: false });
  // Main vertical timber posts
  w.box(0.08, 0.08, 0.84, 0.84, { color: WALL_WOOD, h: 1.7, z: 0.3 });
  // Reinforcing horizontal beam
  w.box(0.04, 0.04, 0.92, 0.92, { color: WALL_BEAM, h: 0.22, z: 1.1, outline: false });
  // Sharpened palisade spikes
  w.box(0.08, 0.08, 0.24, 0.24, { color: WALL_BEAM, h: 0.45, z: 2.0 });
  w.box(0.68, 0.08, 0.24, 0.24, { color: WALL_BEAM, h: 0.45, z: 2.0 });
  w.box(0.08, 0.68, 0.24, 0.24, { color: WALL_BEAM, h: 0.45, z: 2.0 });
  w.box(0.68, 0.68, 0.24, 0.24, { color: WALL_BEAM, h: 0.45, z: 2.0 });
};

export const WOOD_WALL_DEF: SpriteDef = defineSprite({ id: 'bld_wood_wall', w: 1, d: 1, massing: woodWallMassing });

/** Stone Masonry Wall: Heavy stone blocks with crenelated cap. */
const stoneWallMassing: Massing = (w: SolidWriter, _v: Variant, _rng: Rng) => {
  w.shadow(0, 0, 1, 1, 0.4);
  // Heavy stone foundation
  w.box(0, 0, 1, 1, { color: STONE_DARK, h: 0.5, outline: true });
  // Main dressed stone block body
  w.box(0.05, 0.05, 0.9, 0.9, { color: WALL_STONE, h: 1.4, z: 0.5, outline: true });
  // Stone coping rim
  w.box(0.02, 0.02, 0.96, 0.96, { color: STONE_DARK, h: 0.2, z: 1.9, outline: false });
  // Defensive battlements / merlons
  w.box(0.05, 0.05, 0.35, 0.35, { color: WALL_STONE, h: 0.35, z: 2.1 });
  w.box(0.6, 0.6, 0.35, 0.35, { color: WALL_STONE, h: 0.35, z: 2.1 });
};

export const STONE_WALL_DEF: SpriteDef = defineSprite({ id: 'bld_stone_wall', w: 1, d: 1, massing: stoneWallMassing });

/** Wood Watchtower: 2x2 Timber lookout tower with lantern beacon. */
const woodTowerMassing: Massing = (w: SolidWriter, _v: Variant, _rng: Rng) => {
  w.shadow(0, 0, 2, 2, 0.45);
  // Log Corner Posts
  w.box(0.1, 0.1, 0.35, 0.35, { color: WALL_BEAM, h: 4.2 });
  w.box(1.55, 0.1, 0.35, 0.35, { color: WALL_BEAM, h: 4.2 });
  w.box(0.1, 1.55, 0.35, 0.35, { color: WALL_BEAM, h: 4.2 });
  w.box(1.55, 1.55, 0.35, 0.35, { color: WALL_BEAM, h: 4.2 });
  // Diagonal cross-trusses
  w.box(0.2, 0.2, 1.6, 1.6, { color: WALL_WOOD, h: 0.25, z: 1.8, outline: false });
  w.box(0.2, 0.2, 1.6, 1.6, { color: WALL_WOOD, h: 0.25, z: 3.4, outline: false });
  // Lookout Platform Decking
  w.box(0, 0, 2, 2, { color: FLOOR, h: 0.3, z: 4.2 });
  // Guard railings
  w.box(0.05, 0.05, 1.9, 1.9, { color: WALL_BEAM, h: 0.6, z: 4.5, outline: false });
  // Central beacon lantern post
  w.post(0.95, 0.95, 4.5, 0.9, WALL_BEAM, 0.08);
  // Warm Lantern Beacon
  w.box(0.85, 0.85, 0.3, 0.3, { color: LANTERN_GLOW, h: 0.35, z: 5.4 });
};

export const WOOD_TOWER_DEF: SpriteDef = defineSprite({ id: 'bld_wood_tower', w: 2, d: 2, massing: woodTowerMassing });

/** Stone Fortress Tower: 2x2 Heavy fortress tower with battlements and beacon. */
const stoneTowerMassing: Massing = (w: SolidWriter, _v: Variant, _rng: Rng) => {
  w.shadow(0, 0, 2, 2, 0.55);
  // Stone Fortress Base
  w.box(0, 0, 2, 2, { color: STONE_DARK, h: 1.2, outline: true });
  // Main Fortress Shaft
  w.box(0.15, 0.15, 1.7, 1.7, { color: TOWER, h: 3.4, z: 1.2, outline: true });
  // Corbelled parapet overhang
  w.box(0.05, 0.05, 1.9, 1.9, { color: STONE_DARK, h: 0.35, z: 4.6, outline: false });
  // Archer Lookout Platform & Battlements
  w.box(0, 0, 2, 2, { color: WALL_STONE, h: 0.7, z: 4.95 });
  // Corner battlement merlons
  w.box(0.02, 0.02, 0.45, 0.45, { color: WALL_STONE, h: 0.55, z: 5.65 });
  w.box(1.53, 0.02, 0.45, 0.45, { color: WALL_STONE, h: 0.55, z: 5.65 });
  w.box(0.02, 1.53, 0.45, 0.45, { color: WALL_STONE, h: 0.55, z: 5.65 });
  w.box(1.53, 1.53, 0.45, 0.45, { color: WALL_STONE, h: 0.55, z: 5.65 });
  // Central Beacon Lantern Post
  w.post(0.95, 0.95, 5.65, 0.95, WALL_BEAM, 0.08);
  // Warm Lantern Beacon
  w.box(0.85, 0.85, 0.3, 0.3, { color: LANTERN_GLOW, h: 0.35, z: 6.6 });
};

export const STONE_TOWER_DEF: SpriteDef = defineSprite({ id: 'bld_stone_tower', w: 2, d: 2, massing: stoneTowerMassing });

/** Timber Decking / Floor: Walkable platform. */
const floorMassing: Massing = (w: SolidWriter, _v: Variant, _rng: Rng) => {
  w.shadow(0, 0, 1, 1, 0.12);
  w.box(0, 0, 1, 1, { color: FLOOR, h: 0.22 });
  w.box(0.15, 0.05, 0.7, 0.9, { color: WALL_WOOD, h: 0.08, z: 0.22, outline: false });
};

export const FLOOR_DEF: SpriteDef = defineSprite({ id: 'bld_floor', w: 1, d: 1, massing: floorMassing });

/** `Variant.flags` bit a gate massing branches on: its posts run north–south (rotated 90°)
 *  instead of the default east–west, so the opening lines up with whichever direction its
 *  neighboring wall run actually goes. Game-defined — above the kit's reserved `FLAG_*` bits. */
export const GATE_FLAG_ROTATED = 1 << 4;

/**
 * Stone Gate: An open archway in a stone perimeter — passable to players, blocked to animals.
 *
 * Drawn in one of two 90°-rotated orientations depending on `GATE_FLAG_ROTATED` (set by
 * `gateVariantFlags` from the walls actually built beside it) so the opening always lines up
 * with the wall line it sits in rather than always facing the same way.
 */
const gateMassing: Massing = (w: SolidWriter, v: Variant, _rng: Rng) => {
  const rotated = (v.flags & GATE_FLAG_ROTATED) !== 0;
  // Every box below is authored for the default (east–west posts) orientation; swapping x/y and
  // width/depth here is what turns it into the north–south one, so there is one massing to keep
  // in sync rather than two hand-mirrored copies drifting apart.
  const b: SolidWriter['box'] = (x, y, bw, bd, opts) =>
    rotated ? w.box(y, x, bd, bw, opts) : w.box(x, y, bw, bd, opts);

  w.shadow(0, 0, 1, 1, 0.35);
  // Threshold sill
  b(0, 0.38, 1, 0.24, { color: STONE_DARK, h: 0.12, outline: false });
  // Stone gate posts flanking an open passage
  b(0.04, 0.04, 0.22, 0.92, { color: WALL_STONE, h: 2.1, outline: true });
  b(0.74, 0.04, 0.22, 0.92, { color: WALL_STONE, h: 2.1, outline: true });
  // Post capstones
  b(0.02, 0.02, 0.26, 0.96, { color: STONE_DARK, h: 0.2, z: 2.1, outline: false });
  b(0.72, 0.02, 0.26, 0.96, { color: STONE_DARK, h: 0.2, z: 2.1, outline: false });
  // Arched lintel spanning the opening overhead
  b(0, 0.06, 1, 0.88, { color: STONE_DARK, h: 0.3, z: 2.3, outline: true });
  // Iron-banded doors folded open against each post
  b(0.06, 0.06, 0.16, 0.22, { color: WALL_WOOD, h: 1.7, z: 0.15, outline: false });
  b(0.78, 0.06, 0.16, 0.22, { color: WALL_WOOD, h: 1.7, z: 0.15, outline: false });
  b(0.06, 0.06, 0.16, 0.05, { color: WALL_BEAM, h: 1.7, z: 0.15, outline: false });
  b(0.78, 0.06, 0.16, 0.05, { color: WALL_BEAM, h: 1.7, z: 0.15, outline: false });
};

export const GATE_DEF: SpriteDef = defineSprite({ id: 'bld_gate', w: 1, d: 1, massing: gateMassing });

/** Wall-like kinds a gate's orientation reads off — segments its posts visually continue. */
function isWallLikeKind(kind: BuildingKind): boolean {
  return kind === 'palisade' || kind === 'wood_wall' || kind === 'stone_wall' || kind === 'gate';
}

/** Whether any active wall-like building occupies tile (gx, gy). */
function isWallLikeAt(gx: number, gy: number, buildings: readonly Building[]): boolean {
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (b === undefined || b.hp <= 0 || !isWallLikeKind(b.kind)) continue;
    if (gx >= b.gx && gx < b.gx + b.w && gy >= b.gy && gy < b.gy + b.d) return true;
  }
  return false;
}

/**
 * The `Variant.flags` a gate at (gx, gy) should render with, given what's actually built beside
 * it: rotates the gate's posts to continue a north–south wall run instead of the default
 * east–west one. Ambiguous layouts (walls on both axes, or no neighboring wall at all) keep the
 * default. Takes a bare tile rather than a placed `Building` so the placement ghost can preview
 * the real orientation before the player commits to it.
 */
export function gateVariantFlags(gx: number, gy: number, buildings: readonly Building[]): number {
  const northSouthWall = isWallLikeAt(gx, gy - 1, buildings) || isWallLikeAt(gx, gy + 1, buildings);
  const eastWestWall = isWallLikeAt(gx - 1, gy, buildings) || isWallLikeAt(gx + 1, gy, buildings);
  return northSouthWall && !eastWestWall ? GATE_FLAG_ROTATED : 0;
}

/** Campfire: Stone fire pit ring, crossed timber kindling logs, and warm animated flames. */
const campfireMassing: Massing = (w: SolidWriter, v: Variant, _rng: Rng) => {
  w.shadow(0.1, 0.1, 0.8, 0.8, 0.45);
  // Dark soot & ash base
  w.box(0.18, 0.18, 0.64, 0.64, { color: ASH_DARK, h: 0.08, outline: false });
  // Cobblestone hearth ring (8 stone cobbles surrounding the pit)
  w.box(0.12, 0.12, 0.22, 0.22, { color: STONE_DARK, h: 0.18, z: 0.04 });
  w.box(0.39, 0.08, 0.22, 0.22, { color: WALL_STONE, h: 0.16, z: 0.04 });
  w.box(0.66, 0.12, 0.22, 0.22, { color: STONE_DARK, h: 0.18, z: 0.04 });
  w.box(0.08, 0.39, 0.22, 0.22, { color: WALL_STONE, h: 0.16, z: 0.04 });
  w.box(0.70, 0.39, 0.22, 0.22, { color: STONE_DARK, h: 0.18, z: 0.04 });
  w.box(0.12, 0.66, 0.22, 0.22, { color: STONE_DARK, h: 0.18, z: 0.04 });
  w.box(0.39, 0.70, 0.22, 0.22, { color: WALL_STONE, h: 0.16, z: 0.04 });
  w.box(0.66, 0.66, 0.22, 0.22, { color: STONE_DARK, h: 0.18, z: 0.04 });
  // Crossed kindling logs
  w.box(0.20, 0.38, 0.60, 0.24, { color: WALL_WOOD, h: 0.18, z: 0.10, outline: false });
  w.box(0.38, 0.20, 0.24, 0.60, { color: WALL_BEAM, h: 0.18, z: 0.18, outline: false });
  // Red glowing ember bed
  w.box(0.30, 0.30, 0.40, 0.40, { color: EMBER_RED, h: 0.20, z: 0.22 });
  // Animated glowing flame flickers driven by progress / level (@tier-b visual). Two slow,
  // incommensurate harmonics (rather than one fast sine) read as a gentle organic waver
  // instead of a mechanical pulse; the per-instance phase keeps campfires desynced.
  const phase = (v.seed % 100) * 0.1;
  const flameFlicker =
    (Math.sin((v.progress || 0) * Math.PI * 2 + phase) * 0.6 +
      Math.sin((v.progress || 0) * Math.PI * 4 + phase * 1.7) * 0.4) * 0.022;
  w.box(0.32 + flameFlicker, 0.32, 0.36, 0.36, { color: FIRE_ORANGE, h: 0.60 + flameFlicker * 2, z: 0.30 });
  w.box(0.38, 0.38 + flameFlicker, 0.24, 0.24, { color: FIRE_YELLOW, h: 0.52, z: 0.45 });
  w.box(0.42, 0.42, 0.16, 0.16, { color: FIRE_CORE, h: 0.38, z: 0.60 });
};

export const CAMPFIRE_DEF: SpriteDef = defineSprite({ id: 'bld_campfire', w: 1, d: 1, massing: campfireMassing });

/** Wizard Tower: a foreboding conjured spire — twisted obsidian tiers, a jagged crown, pulsing
 *  purple rune bands, and a floating crystal orb overhead. Raised by `missions.ts` when a player
 *  discovers it, never by a player's own Inventory. The pulse and the orb's bob share one
 *  incommensurate-harmonic phase (the same trick `campfireMassing` uses for its flame flicker) so
 *  the tower reads as alive rather than blinking on a metronome. */
const wizardTowerMassing: Massing = (w: SolidWriter, v: Variant, _rng: Rng) => {
  w.shadow(-0.15, -0.15, 2.3, 2.3, 0.6);

  // Jagged obsidian base — wider than the shaft above it, like something grown rather than built
  w.box(-0.1, -0.1, 2.2, 2.2, { color: WIZARD_STONE_DARK, h: 1.0, outline: true });
  w.box(0.05, 0.05, 1.9, 1.9, { color: WIZARD_STONE, h: 0.3, z: 1.0, outline: false });

  // Twisted tapering spire — each tier narrower and off-center, so it reads as warped rather
  // than a straight, honest watchtower shaft
  w.box(0.15, 0.2, 1.7, 1.6, { color: WIZARD_STONE, h: 2.2, z: 1.3, outline: true });
  w.box(0.34, 0.32, 1.28, 1.36, { color: WIZARD_STONE_DARK, h: 1.8, z: 3.4, outline: true });
  w.box(0.52, 0.46, 0.94, 1.06, { color: WIZARD_STONE, h: 1.5, z: 5.1, outline: true });

  // Jagged, unevenly sized crown spikes
  w.post(0.55, 0.55, 6.6, 0.95, WIZARD_STONE_DARK, 0.09);
  w.post(1.42, 0.6, 6.6, 0.7, WIZARD_STONE_DARK, 0.08);
  w.post(0.6, 1.42, 6.6, 0.78, WIZARD_STONE_DARK, 0.08);
  w.post(1.4, 1.38, 6.6, 0.58, WIZARD_STONE_DARK, 0.07);
  w.post(1.0, 1.0, 6.6, 1.3, WIZARD_TRIM, 0.1);

  // Pulsing rune bands wrapped around the shaft (@tier-b visual pulse — never hashed/persisted)
  const phase = (v.seed % 100) * 0.1;
  const pulse =
    (Math.sin((v.progress || 0) * Math.PI * 2 + phase) * 0.6 +
      Math.sin((v.progress || 0) * Math.PI * 3.3 + phase * 1.6) * 0.4) * 0.5 + 0.5; // 0..1
  w.box(0.36, 0.3, 1.28, 1.4, { color: MAGIC_GLOW, h: 0.1, z: 3.85, outline: false, alpha: 0.3 + pulse * 0.4 });
  w.box(0.56, 0.5, 0.88, 1.0, { color: MAGIC_GLOW, h: 0.08, z: 5.55, outline: false, alpha: 0.3 + pulse * 0.4 });

  // Floating crystal orb crown, bobbing gently overhead — the tower's dread aura made visible (@tier-b)
  const bob = Math.sin((v.progress || 0) * Math.PI * 2 + phase) * 0.08;
  w.cylinder(1.0, 1.0, 0.24 + pulse * 0.05, { color: MAGIC_GLOW, h: 0.46, z: 7.0 + bob, outline: false, alpha: 0.8 });
  w.cylinder(1.0, 1.0, 0.11, { color: MAGIC_GLOW_CORE, h: 0.24, z: 7.14 + bob, outline: false });
};

export const WIZARD_TOWER_DEF: SpriteDef = defineSprite({ id: 'bld_wizard_tower', w: 2, d: 2, massing: wizardTowerMassing });

// ── Declarative Building Registry ─────────────────────────────────────────────

export interface BuildingDefinition {
  readonly kind: BuildingKind;
  readonly name: string;
  readonly cost: BuildingCost;
  readonly footprint: { readonly w: number; readonly d: number };
  readonly maxHp: number;
  /** Whether this kind physically blocks players from entering its footprint tiles. */
  readonly blocksPlayers: boolean;
  /** Whether this kind physically blocks wild animals and predators from entering its footprint tiles. */
  readonly blocksAnimals: boolean;
  readonly spriteDef: SpriteDef;
  /** False only for mission structures (`wizard_tower`) raised by `missions.ts`. Building-siege
   *  creatures (`SpeciesDefinition.attacksBuildings`) skip every kind this is false for — without
   *  it, a shade spawned beside its own conjuring tower would immediately target and destroy it,
   *  ending the mission the instant it started. See `isMissionStructure`. */
  readonly playerBuilt: boolean;
}

export const BUILDING_REGISTRY: Record<BuildingKind, BuildingDefinition> = {
  campfire: {
    kind: 'campfire',
    name: 'Campfire',
    cost: { wood: 4, stone: 2, fiber: 2 },
    footprint: { w: 1, d: 1 },
    maxHp: 120,
    blocksPlayers: false,
    blocksAnimals: false,
    spriteDef: CAMPFIRE_DEF,
    playerBuilt: true,
  },
  palisade: {
    kind: 'palisade',
    name: 'Palisade Stake',
    cost: { wood: 2, stone: 0 },
    footprint: { w: 1, d: 1 },
    maxHp: 90,
    blocksPlayers: true,
    blocksAnimals: true,
    spriteDef: PALISADE_DEF,
    playerBuilt: true,
  },
  wood_wall: {
    kind: 'wood_wall',
    name: 'Timber Wall',
    cost: { wood: 4, stone: 0 },
    footprint: { w: 1, d: 1 },
    maxHp: 180,
    blocksPlayers: true,
    blocksAnimals: true,
    spriteDef: WOOD_WALL_DEF,
    playerBuilt: true,
  },
  stone_wall: {
    kind: 'stone_wall',
    name: 'Stone Masonry Wall',
    cost: { wood: 0, stone: 4 },
    footprint: { w: 1, d: 1 },
    maxHp: 360,
    blocksPlayers: true,
    blocksAnimals: true,
    spriteDef: STONE_WALL_DEF,
    playerBuilt: true,
  },
  wood_tower: {
    kind: 'wood_tower',
    name: 'Wood Watchtower',
    cost: { wood: 12, stone: 2 },
    footprint: { w: 2, d: 2 },
    maxHp: 380,
    // Climbable: players walk onto its lookout platform instead of being blocked.
    blocksPlayers: false,
    blocksAnimals: true,
    spriteDef: WOOD_TOWER_DEF,
    playerBuilt: true,
  },
  stone_tower: {
    kind: 'stone_tower',
    name: 'Stone Fortress Tower',
    cost: { wood: 6, stone: 14 },
    footprint: { w: 2, d: 2 },
    maxHp: 750,
    blocksPlayers: false,
    blocksAnimals: true,
    spriteDef: STONE_TOWER_DEF,
    playerBuilt: true,
  },
  floor: {
    kind: 'floor',
    name: 'Timber Decking',
    cost: { wood: 2, stone: 0 },
    footprint: { w: 1, d: 1 },
    maxHp: 80,
    blocksPlayers: false,
    blocksAnimals: false,
    spriteDef: FLOOR_DEF,
    playerBuilt: true,
  },
  gate: {
    kind: 'gate',
    name: 'Stone Gate',
    cost: { wood: 4, stone: 8 },
    footprint: { w: 1, d: 1 },
    maxHp: 260,
    // Passable to players, closed to animals — a controlled opening in a wall line.
    blocksPlayers: false,
    blocksAnimals: true,
    spriteDef: GATE_DEF,
    playerBuilt: true,
  },
  wizard_tower: {
    kind: 'wizard_tower',
    name: 'Wizard Tower',
    cost: { wood: 0, stone: 0 },
    footprint: { w: 2, d: 2 },
    maxHp: 650,
    blocksPlayers: true,
    blocksAnimals: true,
    spriteDef: WIZARD_TOWER_DEF,
    playerBuilt: false,
  },
};

// ── Building Lookup & Placement ────────────────────────────────────────────────

/** The sprite that renders a building kind — the single lookup `render.ts` and `players.ts`
 *  use instead of each keeping their own copy of the kind→def mapping. */
export function defFor(kind: BuildingKind): SpriteDef {
  return BUILDING_REGISTRY[kind].spriteDef;
}

/** Max HP for a freshly placed building of this kind — what `placeBuilding` seeds `hp` from. */
export function hpFor(kind: BuildingKind): number {
  return BUILDING_REGISTRY[kind].maxHp;
}

/** True for `wizard_tower` and any future mission-only structure — the inverse of
 *  `BuildingDefinition.playerBuilt`, named for how it reads at its call sites (building-siege
 *  targeting in `creatures.ts`, `damageBuildings` above). */
export function isMissionStructure(kind: BuildingKind): boolean {
  return !BUILDING_REGISTRY[kind].playerBuilt;
}

/** Which kind of mover is asking `isTileOccupiedBySolidBuilding` whether a tile is blocked —
 *  towers and gates answer that question differently for players than for wild animals. */
export type BuildingActor = 'player' | 'animal';

/** Whether a building kind physically blocks the given actor kind. */
export function blocksActor(kind: BuildingKind, actor: BuildingActor): boolean {
  const def = BUILDING_REGISTRY[kind];
  return actor === 'animal' ? def.blocksAnimals : def.blocksPlayers;
}

/** Check if any active building occupies tile (gx, gy) that blocks `actor`. Defaults to
 *  'player' so the many existing call sites (all originally player movement) read unchanged. */
export function isTileOccupiedBySolidBuilding(
  gx: number,
  gy: number,
  buildings: readonly Building[],
  actor: BuildingActor = 'player',
): boolean {
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (b === undefined || b.hp <= 0 || !blocksActor(b.kind, actor)) continue;
    if (gx >= b.gx && gx < b.gx + b.w && gy >= b.gy && gy < b.gy + b.d) {
      return true;
    }
  }
  return false;
}

/** Height, in storeys, of each tower kind's lookout platform surface above its own base —
 *  matches the top of the decking box in that tower's massing, so a standing player's feet
 *  line up with the platform they climbed onto. */
const TOWER_PLATFORM_LEVELS: Partial<Record<BuildingKind, number>> = {
  wood_tower: 4.5,
  stone_tower: 5.65,
};

/** World-pixel height above a building's own base at which a player stands while atop it.
 *  0 for every kind that isn't a climbable tower. */
export function towerPlatformPx(kind: BuildingKind): number {
  const levels = TOWER_PLATFORM_LEVELS[kind];
  return levels === undefined ? 0 : levelsToPx(levels);
}

/** The active, undamaged tower (if any) whose footprint contains tile (gx, gy) — what a
 *  player's movement update checks each tick to decide whether they're standing on a
 *  lookout platform. */
export function findTowerAt(
  gx: number,
  gy: number,
  buildings: readonly Building[],
): Building | undefined {
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (b === undefined || b.hp <= 0 || TOWER_PLATFORM_LEVELS[b.kind] === undefined) continue;
    if (gx >= b.gx && gx < b.gx + b.w && gy >= b.gy && gy < b.gy + b.d) return b;
  }
  return undefined;
}

let nextId = 1;

/**
 * Attempt to place a building at (gx, gy).
 *
 * Fails if any footprint tile is water, or is already occupied by another active building.
 */
export function placeBuilding(
  kind: BuildingKind,
  gx: number,
  gy: number,
  world: WorldTerrain,
  existing: Building[],
): Building | undefined {
  const def = defFor(kind);
  const { w, d } = def;

  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < d; dy++) {
      const tx = gx + dx;
      const ty = gy + dy;
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return undefined;
      if (world.surface.get(tx, ty) === MAT_WATER) return undefined;
      for (const b of existing) {
        if (b.hp > 0 && tx >= b.gx && tx < b.gx + b.w && ty >= b.gy && ty < b.gy + b.d) {
          return undefined;
        }
      }
    }
  }

  const fp: Footprint = { gx, gy, w, d };
  const basePx        = footprintBase(world.field, fp);
  const maxHp         = hpFor(kind);

  return {
    id:    nextId++,
    kind,
    gx,
    gy,
    w,
    d,
    basePx,
    hp:    maxHp,
    maxHp,
  };
}

/** Reconstruct a saved building into live simulation state. */
export function restoreBuilding(
  kind: BuildingKind,
  gx: number,
  gy: number,
  hp: number,
  maxHp: number,
  world: WorldTerrain,
): Building {
  const def    = defFor(kind);
  const fp: Footprint = { gx, gy, w: def.w, d: def.d };
  const basePx = footprintBase(world.field, fp);

  return {
    id:    nextId++,
    kind,
    gx,
    gy,
    w:     def.w,
    d:     def.d,
    basePx,
    hp,
    maxHp,
  };
}

/** Check if a building can be legally placed at (gx, gy). */
export function canPlaceBuilding(
  kind: BuildingKind,
  gx: number,
  gy: number,
  world: WorldTerrain,
  existing: readonly Building[],
): boolean {
  const def = defFor(kind);
  const { w, d } = def;

  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < d; dy++) {
      const tx = gx + dx;
      const ty = gy + dy;
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
      if (world.surface.get(tx, ty) === MAT_WATER) return false;
      for (const b of existing) {
        if (b.hp > 0 && tx >= b.gx && tx < b.gx + b.w && ty >= b.gy && ty < b.gy + b.d) {
          return false;
        }
      }
    }
  }
  return true;
}

/** Apply troll / monster damage to buildings within 1.5 tiles. Returns true if any building was hit. */
export function damageBuildings(
  buildings: Building[],
  trollX: number,
  trollY: number,
  dmgPerTick: number,
): boolean {
  let hit = false;
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    // Mission structures (the wizard tower) are never a siege target — see `playerBuilt`'s doc
    // comment: without this, a shade sieging "the nearest building" while standing next to its
    // own conjuring tower would damage that tower instead of a player's base.
    if (b === undefined || b.hp <= 0 || isMissionStructure(b.kind)) continue;
    const dx = Math.abs(trollX - (b.gx + b.w * 0.5));
    const dy = Math.abs(trollY - (b.gy + b.d * 0.5));
    if (dx < 1.4 + b.w * 0.5 && dy < 1.4 + b.d * 0.5) {
      b.hp -= dmgPerTick;
      hit = true;
    }
  }
  return hit;
}
