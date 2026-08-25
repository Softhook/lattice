/**
 * Procedural sprites for all entities in Verdant.
 *
 * Rules followed throughout:
 * 1. Silhouette first — every sprite reads at 40 px as a distinct shape.
 * 2. Three-tone faces from one color — `draw` derives left/right/top for free.
 * 3. Something moves on every entity — walking legs, bounding hops, tail sways, ear flicks, breathing bobs.
 * 4. Per-instance variation keyed on identity (seed via Rng), not draw order.
 * 5. Zero assets — geometry + `SolidWriter` primitives only.
 *
 * All procedural math using sin/cos is presentation-only (@tier-b).
 */

import {
  defineSprite,
  type SpriteDef,
  type Variant,
  type Massing,
  type SolidWriter,
  type Ink,
} from '@latticekit/draw';
import { Rng, hash2 } from '@latticekit/core';
import type { Creature } from './creatures.js';
import type { Player } from './players.js';
import {
  P1_COLOR,
  P2_COLOR,
  RABBIT,
  RABBIT_EAR,
  DEER,
  DEER_BELLY,
  ANTLER_BONE,
  WOLF,
  WOLF_MANE,
  WOLF_EYE,
  TROLL,
  TROLL_MOSS,
  TROLL_EYE,
  FOX,
  FOX_WHITE,
  FOX_DARK,
  BEAR,
  BEAR_MUZZLE,
  BEAR_NOSE,
  BEAR_CLAW,
  BOAR,
  BOAR_SNOUT,
  BOAR_TUSK,
  BOAR_MANE,
  CROC,
  CROC_BELLY,
  CROC_RIDGE,
  CROC_TOOTH,
  BOOTS_DARK,
  SKIN_TONE,
  HAIR_DARK,
  BACKPACK_COL,
  TOOL_GOLD,
  TOOL_STEEL,
} from './palette.js';


// ── Player Sprite ─────────────────────────────────────────────────────────────

/** Player adventurer — detailed outfit, articulated walking legs, weapon in hand, and backpack. */
function makePlayerMassing(bodyColor: Ink): Massing {
  const visorColor = 0xffe066ff; // Bright gold visor
  const packColor  = BACKPACK_COL;
  const hiltGold   = TOOL_GOLD;
  const bladeSteel = TOOL_STEEL;
  const woodShaft  = 0x8a6040ff;

  return (w: SolidWriter, v: Variant, _rng: Rng) => {
    // 1. Ground contact shadow
    w.shadow(0.15, 0.15, 0.7, 0.7, 0.3);

    const facing = v.flags & 3; // 0: 'n', 1: 's', 2: 'e', 3: 'w'
    const isMoving = (v.flags & 4) !== 0;
    const weaponCode = (v.flags >> 4) & 3; // 0: hands, 1: axe, 2: sword, 3: bow
    const walkPhase = v.progress; // 0..1 stride cycle

    // @tier-b — smooth, natural leg stride and body bob kinematics
    const swing = isMoving ? Math.sin(walkPhase * Math.PI * 2) * 0.08 : 0;
    const armSwing = isMoving ? Math.sin(walkPhase * Math.PI * 2) * 0.05 : 0;
    const bob = isMoving ? Math.abs(Math.sin(walkPhase * Math.PI * 2)) * 0.03 : 0;
    const zBase = bob;

    if (facing === 1) {
      // ── Facing South (S key / toward camera) ──
      // 1. Far/North elements draw FIRST in painter's order:
      // Backpack on north face
      w.box(0.32, 0.16, 0.36, 0.14, { color: packColor, h: 0.55, z: 0.5 + zBase });
      w.box(0.44, 0.14, 0.12, 0.04, { color: hiltGold, h: 0.12, z: 0.7 + zBase });

      // Far Arm (Left Arm on north-west shoulder) — drawn BEFORE torso so torso naturally clips it
      w.box(0.14, 0.32 - armSwing, 0.12, 0.20, { color: bodyColor, h: 0.55, z: 0.68 + zBase });
      w.box(0.14, 0.38 - armSwing, 0.12, 0.12, { color: SKIN_TONE, h: 0.14, z: 0.56 + zBase });

      // 2. Legs:
      w.box(0.26, 0.36 + swing, 0.18, 0.24, { color: BOOTS_DARK, h: 0.45 });
      w.box(0.54, 0.36 - swing, 0.18, 0.24, { color: BOOTS_DARK, h: 0.45 });

      // 3. Torso & Belt (cleanly occludes far arm):
      w.box(0.24, 0.24, 0.52, 0.52, { color: bodyColor, h: 0.4, z: 0.45 + zBase });
      w.box(0.23, 0.23, 0.54, 0.54, { color: 0x1a252fff, h: 0.1, z: 0.48 + zBase });
      w.box(0.25, 0.25, 0.50, 0.50, { color: bodyColor, h: 0.5, z: 0.85 + zBase });

      // 4. Head, Hair & Visor on south face:
      w.box(0.28, 0.28, 0.44, 0.44, { color: SKIN_TONE, h: 0.44, z: 1.35 + zBase });
      w.box(0.26, 0.26, 0.48, 0.48, { color: HAIR_DARK, h: 0.18, z: 1.68 + zBase });
      w.box(0.34, 0.70, 0.32, 0.04, { color: visorColor, h: 0.14, z: 1.48 + zBase });

      // 5. Near Arm (Right Arm on south-east side) — drawn AFTER torso in foreground:
      w.box(0.74, 0.32 + armSwing, 0.14, 0.20, { color: bodyColor, h: 0.55, z: 0.7 + zBase });
      w.box(0.74, 0.40 + armSwing, 0.14, 0.14, { color: SKIN_TONE, h: 0.16, z: 0.58 + zBase });

      // 6. Weapon in near hand:
      if (weaponCode === 1) {
        // Woodsman Axe
        w.post(0.79, 0.46, 0.3 + zBase, 0.85, woodShaft, 0.05);
        w.box(0.75, 0.48, 0.22, 0.12, { color: bladeSteel, h: 0.28, z: 0.95 + zBase });
      } else if (weaponCode === 2) {
        // Stone Blade (Sword)
        w.box(0.77, 0.45, 0.06, 0.14, { color: bladeSteel, h: 0.95, z: 0.4 + zBase });
        w.box(0.72, 0.44, 0.16, 0.16, { color: hiltGold, h: 0.08, z: 0.65 + zBase });
      } else if (weaponCode === 3) {
        // Hunting Bow
        w.box(0.74, 0.48, 0.04, 0.22, { color: woodShaft, h: 0.85, z: 0.5 + zBase });
        w.post(0.75, 0.48, 0.55 + zBase, 0.75, 0xffffffff, 0.02);
      }

    } else if (facing === 0) {
      // ── Facing North (W key / away from camera) ──
      // 1. Visor on North face (draw first)
      w.box(0.34, 0.26, 0.32, 0.04, { color: visorColor, h: 0.14, z: 1.48 + zBase });

      // 2. Far Arm (Left Arm) — drawn BEFORE torso so torso naturally clips it
      w.box(0.14, 0.32 + armSwing, 0.12, 0.20, { color: bodyColor, h: 0.55, z: 0.68 + zBase });
      w.box(0.14, 0.26 + armSwing, 0.12, 0.12, { color: SKIN_TONE, h: 0.14, z: 0.56 + zBase });

      // 3. Legs
      w.box(0.26, 0.36 - swing, 0.18, 0.24, { color: BOOTS_DARK, h: 0.45 });
      w.box(0.54, 0.36 + swing, 0.18, 0.24, { color: BOOTS_DARK, h: 0.45 });

      // 4. Torso (covers far arm)
      w.box(0.24, 0.24, 0.52, 0.52, { color: bodyColor, h: 0.4, z: 0.45 + zBase });
      w.box(0.25, 0.25, 0.50, 0.50, { color: bodyColor, h: 0.5, z: 0.85 + zBase });

      // 5. Head & Hair
      w.box(0.28, 0.28, 0.44, 0.44, { color: HAIR_DARK, h: 0.44, z: 1.35 + zBase });

      // 6. Near Arm (Right Arm)
      w.box(0.74, 0.32 - armSwing, 0.14, 0.20, { color: bodyColor, h: 0.55, z: 0.7 + zBase });
      w.box(0.74, 0.26 - armSwing, 0.14, 0.14, { color: SKIN_TONE, h: 0.16, z: 0.58 + zBase });

      // 7. Backpack on South face (facing camera, draw last)
      w.box(0.32, 0.70, 0.36, 0.14, { color: packColor, h: 0.55, z: 0.5 + zBase });
      w.box(0.44, 0.82, 0.12, 0.04, { color: hiltGold, h: 0.12, z: 0.7 + zBase });

    } else if (facing === 2) {
      // ── Facing East (D key / +gx) ──
      // Backpack on West side
      w.box(0.16, 0.32, 0.14, 0.36, { color: packColor, h: 0.55, z: 0.5 + zBase });

      // Far Arm (north side) — draw BEFORE torso
      w.box(0.32 + armSwing, 0.14, 0.20, 0.12, { color: bodyColor, h: 0.55, z: 0.68 + zBase });

      // Legs
      w.box(0.36 + swing, 0.26, 0.24, 0.18, { color: BOOTS_DARK, h: 0.45 });
      w.box(0.36 - swing, 0.54, 0.24, 0.18, { color: BOOTS_DARK, h: 0.45 });

      // Torso (covers far arm)
      w.box(0.24, 0.24, 0.52, 0.52, { color: bodyColor, h: 0.4, z: 0.45 + zBase });
      w.box(0.25, 0.25, 0.50, 0.50, { color: bodyColor, h: 0.5, z: 0.85 + zBase });

      // Head & Visor
      w.box(0.28, 0.28, 0.44, 0.44, { color: SKIN_TONE, h: 0.44, z: 1.35 + zBase });
      w.box(0.26, 0.26, 0.48, 0.48, { color: HAIR_DARK, h: 0.18, z: 1.68 + zBase });
      w.box(0.70, 0.34, 0.04, 0.32, { color: visorColor, h: 0.14, z: 1.48 + zBase });

      // Near Arm (south side) — draw AFTER torso
      w.box(0.32 - armSwing, 0.74, 0.20, 0.14, { color: bodyColor, h: 0.55, z: 0.7 + zBase });
      w.box(0.40 - armSwing, 0.74, 0.14, 0.14, { color: SKIN_TONE, h: 0.16, z: 0.58 + zBase });

      // Weapon
      if (weaponCode === 2) {
        w.box(0.75, 0.46, 0.24, 0.06, { color: bladeSteel, h: 0.85, z: 0.55 + zBase });
      }

    } else {
      // ── Facing West (A key / -gx) ──
      w.box(0.26, 0.34, 0.04, 0.32, { color: visorColor, h: 0.14, z: 1.48 + zBase });

      // Far Arm (north side) — draw BEFORE torso
      w.box(0.32 - armSwing, 0.14, 0.20, 0.12, { color: bodyColor, h: 0.55, z: 0.68 + zBase });

      // Legs
      w.box(0.36 - swing, 0.26, 0.24, 0.18, { color: BOOTS_DARK, h: 0.45 });
      w.box(0.36 + swing, 0.54, 0.24, 0.18, { color: BOOTS_DARK, h: 0.45 });

      // Torso
      w.box(0.24, 0.24, 0.52, 0.52, { color: bodyColor, h: 0.4, z: 0.45 + zBase });
      w.box(0.25, 0.25, 0.50, 0.50, { color: bodyColor, h: 0.5, z: 0.85 + zBase });

      // Head
      w.box(0.28, 0.28, 0.44, 0.44, { color: SKIN_TONE, h: 0.44, z: 1.35 + zBase });
      w.box(0.26, 0.26, 0.48, 0.48, { color: HAIR_DARK, h: 0.18, z: 1.68 + zBase });

      // Near Arm (south side) — draw AFTER torso
      w.box(0.32 + armSwing, 0.74, 0.20, 0.14, { color: bodyColor, h: 0.55, z: 0.7 + zBase });
      w.box(0.26 + armSwing, 0.74, 0.14, 0.14, { color: SKIN_TONE, h: 0.16, z: 0.58 + zBase });

      // Backpack on East side
      w.box(0.70, 0.32, 0.14, 0.36, { color: packColor, h: 0.55, z: 0.5 + zBase });
    }
  };
}

export const PLAYER_SPRITES: [SpriteDef, SpriteDef] = [
  defineSprite({ id: 'player0', w: 1, d: 1, massing: makePlayerMassing(P1_COLOR) }),
  defineSprite({ id: 'player1', w: 1, d: 1, massing: makePlayerMassing(P2_COLOR) }),
];

// ── 1. Rabbit (Detailed Fluffy Bounding Hare with 4-Way Facing) ────────────────

const rabbitMassing: Massing = (w, v, _rng) => {
  const facing = v.flags & 3; // 0: 'n', 1: 's', 2: 'e', 3: 'w'
  const phase = ((v.level % 1000) / 1000);
  // @tier-b — gentle periodic hopping arc with ground rest and subtle ear twitches
  // Hop occurs during the first 35% of the cycle, staying grounded with gentle sniffing for the remaining 65%
  const hop = phase < 0.35 ? Math.sin((phase / 0.35) * Math.PI) * 0.08 : 0;
  const earTwitch = phase < 0.35 ? Math.sin((phase / 0.35) * Math.PI * 2) * 0.015 : Math.sin(phase * Math.PI * 4) * 0.006;

  w.shadow(0.18, 0.18, 0.64, 0.64, 0.22);

  if (facing === 1) {
    // ── South: Facing Camera ──
    // Fluffy tail at north (draw first)
    w.box(0.42, 0.14, 0.16, 0.16, { color: 0xffffffff, h: 0.18, z: 0.20 + hop });

    // Hind haunches & feet
    w.box(0.18, 0.30, 0.20, 0.32, { color: RABBIT, h: 0.28, z: 0 });
    w.box(0.62, 0.30, 0.20, 0.32, { color: RABBIT, h: 0.28, z: 0 });

    // Body & chest
    w.box(0.24, 0.22, 0.52, 0.54, { color: RABBIT, h: 0.46, z: 0.12 + hop });
    w.box(0.30, 0.48, 0.40, 0.24, { color: 0xffffffff, h: 0.30, z: 0.18 + hop });

    // Front paws
    w.box(0.28, 0.56, 0.14, 0.16, { color: RABBIT, h: 0.16, z: hop * 0.5 });
    w.box(0.58, 0.56, 0.14, 0.16, { color: RABBIT, h: 0.16, z: hop * 0.5 });

    // Head, ears, snout
    w.box(0.30, 0.42, 0.40, 0.38, { color: RABBIT, h: 0.36, z: 0.50 + hop });
    w.box(0.38, 0.68, 0.24, 0.14, { color: 0xffffffff, h: 0.16, z: 0.54 + hop });
    w.box(0.46, 0.78, 0.08, 0.04, { color: RABBIT_EAR, h: 0.06, z: 0.62 + hop });

    // Eyes
    w.box(0.28, 0.54, 0.04, 0.08, { color: 0x1c2833ff, h: 0.08, z: 0.68 + hop });
    w.box(0.68, 0.54, 0.04, 0.08, { color: 0x1c2833ff, h: 0.08, z: 0.68 + hop });

    // Ears
    w.post(0.36 + earTwitch, 0.38, 0.84 + hop, 0.48, RABBIT, 0.05);
    w.post(0.36 + earTwitch, 0.40, 0.86 + hop, 0.38, RABBIT_EAR, 0.03);
    w.post(0.60 - earTwitch, 0.38, 0.84 + hop, 0.48, RABBIT, 0.05);
    w.post(0.60 - earTwitch, 0.40, 0.86 + hop, 0.38, RABBIT_EAR, 0.03);

  } else if (facing === 0) {
    // ── North: Facing Away ──
    // Head & ears at north
    w.box(0.30, 0.20, 0.40, 0.38, { color: RABBIT, h: 0.36, z: 0.50 + hop });
    w.post(0.36 + earTwitch, 0.22, 0.84 + hop, 0.48, RABBIT, 0.05);
    w.post(0.60 - earTwitch, 0.22, 0.84 + hop, 0.48, RABBIT, 0.05);

    // Body
    w.box(0.24, 0.24, 0.52, 0.54, { color: RABBIT, h: 0.46, z: 0.12 + hop });
    w.box(0.18, 0.38, 0.20, 0.32, { color: RABBIT, h: 0.28, z: 0 });
    w.box(0.62, 0.38, 0.20, 0.32, { color: RABBIT, h: 0.28, z: 0 });

    // Fluffy tail at south (draw last)
    w.box(0.42, 0.70, 0.16, 0.16, { color: 0xffffffff, h: 0.18, z: 0.20 + hop });

  } else if (facing === 2) {
    // ── East: Facing +gx ──
    w.box(0.14, 0.42, 0.16, 0.16, { color: 0xffffffff, h: 0.18, z: 0.20 + hop }); // Tail at west
    w.box(0.20, 0.30, 0.28, 0.40, { color: RABBIT, h: 0.28, z: 0 }); // Haunches
    w.box(0.22, 0.24, 0.56, 0.52, { color: RABBIT, h: 0.46, z: 0.12 + hop });
    w.box(0.46, 0.30, 0.38, 0.40, { color: RABBIT, h: 0.36, z: 0.50 + hop }); // Head at east
    w.box(0.72, 0.38, 0.16, 0.24, { color: 0xffffffff, h: 0.16, z: 0.54 + hop }); // Snout
    w.post(0.42 + earTwitch, 0.36, 0.84 + hop, 0.48, RABBIT, 0.05);
    w.post(0.42 + earTwitch, 0.56, 0.84 + hop, 0.48, RABBIT, 0.05);

  } else {
    // ── West: Facing -gx ──
    w.box(0.70, 0.42, 0.16, 0.16, { color: 0xffffffff, h: 0.18, z: 0.20 + hop }); // Tail at east
    w.box(0.52, 0.30, 0.28, 0.40, { color: RABBIT, h: 0.28, z: 0 }); // Haunches
    w.box(0.22, 0.24, 0.56, 0.52, { color: RABBIT, h: 0.46, z: 0.12 + hop });
    w.box(0.16, 0.30, 0.38, 0.40, { color: RABBIT, h: 0.36, z: 0.50 + hop }); // Head at west
    w.box(0.12, 0.38, 0.16, 0.24, { color: 0xffffffff, h: 0.16, z: 0.54 + hop }); // Snout
    w.post(0.54 - earTwitch, 0.36, 0.84 + hop, 0.48, RABBIT, 0.05);
    w.post(0.54 - earTwitch, 0.56, 0.84 + hop, 0.48, RABBIT, 0.05);
  }
};

export const RABBIT_SPRITE: SpriteDef = defineSprite({
  id: 'rabbit', w: 1, d: 1, massing: rabbitMassing,
});

// ── 2. Fox (Sleek Red Fox with 4-Way Facing & Articulated Legs) ────────────────

const foxMassing: Massing = (w, v, _rng) => {
  const facing = v.flags & 3;
  const phase = ((v.level % 1000) / 1000);
  // @tier-b — gentle quadruped trot and swaying bushy tail
  const legSwing = Math.sin(phase * Math.PI * 2) * 0.06;
  const tailSway = Math.sin(phase * Math.PI * 2) * 0.07;

  w.shadow(0.12, 0.12, 0.76, 0.76, 0.26);

  if (facing === 1) {
    // ── South: Facing Camera ──
    // Tail at north (draw first)
    w.box(0.42 + tailSway, 0.06, 0.22, 0.26, { color: FOX, h: 0.24, z: 0.50 });
    w.box(0.44 + tailSway * 1.4, 0.01, 0.18, 0.18, { color: FOX_WHITE, h: 0.18, z: 0.58 });

    // 4 Legs
    w.box(0.20, 0.22 + legSwing, 0.14, 0.16, { color: FOX_DARK, h: 0.36 });
    w.box(0.66, 0.22 - legSwing, 0.14, 0.16, { color: FOX_DARK, h: 0.36 });
    w.box(0.20, 0.62 - legSwing, 0.14, 0.16, { color: FOX_DARK, h: 0.36 });
    w.box(0.66, 0.62 + legSwing, 0.14, 0.16, { color: FOX_DARK, h: 0.36 });

    // Body & white chest
    w.box(0.22, 0.18, 0.56, 0.64, { color: FOX, h: 0.40, z: 0.34 });
    w.box(0.28, 0.44, 0.44, 0.34, { color: FOX_WHITE, h: 0.32, z: 0.36 });

    // Head, muzzle, ears
    w.box(0.28, 0.52, 0.44, 0.36, { color: FOX, h: 0.36, z: 0.62 });
    w.box(0.34, 0.76, 0.32, 0.22, { color: FOX_WHITE, h: 0.18, z: 0.62 });
    w.box(0.44, 0.92, 0.12, 0.08, { color: FOX_DARK, h: 0.08, z: 0.70 });
    w.box(0.30, 0.68, 0.05, 0.06, { color: WOLF_EYE, h: 0.06, z: 0.82 });
    w.box(0.65, 0.68, 0.05, 0.06, { color: WOLF_EYE, h: 0.06, z: 0.82 });

    w.post(0.30, 0.50, 0.94, 0.22, FOX_DARK, 0.05);
    w.post(0.31, 0.52, 0.94, 0.18, FOX_WHITE, 0.03);
    w.post(0.66, 0.50, 0.94, 0.22, FOX_DARK, 0.05);
    w.post(0.65, 0.52, 0.94, 0.18, FOX_WHITE, 0.03);

  } else if (facing === 0) {
    // ── North: Facing Away ──
    // Head at north
    w.box(0.28, 0.12, 0.44, 0.36, { color: FOX, h: 0.36, z: 0.62 });
    w.post(0.30, 0.20, 0.94, 0.22, FOX_DARK, 0.05);
    w.post(0.66, 0.20, 0.94, 0.22, FOX_DARK, 0.05);

    // 4 Legs
    w.box(0.20, 0.22 - legSwing, 0.14, 0.16, { color: FOX_DARK, h: 0.36 });
    w.box(0.66, 0.22 + legSwing, 0.14, 0.16, { color: FOX_DARK, h: 0.36 });
    w.box(0.20, 0.62 + legSwing, 0.14, 0.16, { color: FOX_DARK, h: 0.36 });
    w.box(0.66, 0.62 - legSwing, 0.14, 0.16, { color: FOX_DARK, h: 0.36 });

    // Body
    w.box(0.22, 0.18, 0.56, 0.64, { color: FOX, h: 0.40, z: 0.34 });

    // Tail at south (draw last)
    w.box(0.42 + tailSway, 0.68, 0.22, 0.26, { color: FOX, h: 0.24, z: 0.50 });
    w.box(0.44 + tailSway * 1.4, 0.82, 0.18, 0.18, { color: FOX_WHITE, h: 0.18, z: 0.58 });

  } else if (facing === 2) {
    // ── East: Facing +gx ──
    w.box(0.06, 0.42 + tailSway, 0.26, 0.22, { color: FOX, h: 0.24, z: 0.50 }); // Tail at west
    w.box(0.01, 0.44 + tailSway * 1.4, 0.18, 0.18, { color: FOX_WHITE, h: 0.18, z: 0.58 });

    // 4 Legs
    w.box(0.22 + legSwing, 0.20, 0.16, 0.14, { color: FOX_DARK, h: 0.36 });
    w.box(0.22 - legSwing, 0.66, 0.16, 0.14, { color: FOX_DARK, h: 0.36 });
    w.box(0.62 - legSwing, 0.20, 0.16, 0.14, { color: FOX_DARK, h: 0.36 });
    w.box(0.62 + legSwing, 0.66, 0.16, 0.14, { color: FOX_DARK, h: 0.36 });

    // Body
    w.box(0.18, 0.22, 0.64, 0.56, { color: FOX, h: 0.40, z: 0.34 });
    w.box(0.44, 0.28, 0.34, 0.44, { color: FOX_WHITE, h: 0.32, z: 0.36 });

    // Head at east
    w.box(0.52, 0.28, 0.36, 0.44, { color: FOX, h: 0.36, z: 0.62 });
    w.box(0.76, 0.34, 0.22, 0.32, { color: FOX_WHITE, h: 0.18, z: 0.62 });
    w.box(0.92, 0.44, 0.08, 0.12, { color: FOX_DARK, h: 0.08, z: 0.70 });
    w.post(0.50, 0.30, 0.94, 0.22, FOX_DARK, 0.05);
    w.post(0.50, 0.66, 0.94, 0.22, FOX_DARK, 0.05);

  } else {
    // ── West: Facing -gx ──
    w.box(0.68, 0.42 + tailSway, 0.26, 0.22, { color: FOX, h: 0.24, z: 0.50 }); // Tail at east
    w.box(0.82, 0.44 + tailSway * 1.4, 0.18, 0.18, { color: FOX_WHITE, h: 0.18, z: 0.58 });

    // 4 Legs
    w.box(0.22 - legSwing, 0.20, 0.16, 0.14, { color: FOX_DARK, h: 0.36 });
    w.box(0.22 + legSwing, 0.66, 0.16, 0.14, { color: FOX_DARK, h: 0.36 });
    w.box(0.62 + legSwing, 0.20, 0.16, 0.14, { color: FOX_DARK, h: 0.36 });
    w.box(0.62 - legSwing, 0.66, 0.16, 0.14, { color: FOX_DARK, h: 0.36 });

    // Body
    w.box(0.18, 0.22, 0.64, 0.56, { color: FOX, h: 0.40, z: 0.34 });

    // Head at west
    w.box(0.12, 0.28, 0.36, 0.44, { color: FOX, h: 0.36, z: 0.62 });
    w.box(0.02, 0.34, 0.22, 0.32, { color: FOX_WHITE, h: 0.18, z: 0.62 });
    w.box(0.00, 0.44, 0.08, 0.12, { color: FOX_DARK, h: 0.08, z: 0.70 });
    w.post(0.20, 0.30, 0.94, 0.22, FOX_DARK, 0.05);
    w.post(0.20, 0.66, 0.94, 0.22, FOX_DARK, 0.05);
  }
};

export const FOX_SPRITE: SpriteDef = defineSprite({
  id: 'fox', w: 1, d: 1, massing: foxMassing,
});

// ── 3. Deer (Majestic Antlered Forest Stag with 4-Way Facing) ──────────────────

const deerMassing: Massing = (w, v, _rng) => {
  const facing = v.flags & 3;
  const phase = ((v.level % 1000) / 1000);
  // @tier-b — graceful trotting stride & head bob
  const legSwing = Math.sin(phase * Math.PI * 2) * 0.07;
  const headBob = Math.sin(phase * Math.PI * 2) * 0.02;

  w.shadow(0.12, 0.12, 0.76, 0.76, 0.28);

  if (facing === 1) {
    // ── South: Facing Camera ──
    // Tail at north (draw first)
    w.box(0.42, 0.12, 0.16, 0.14, { color: DEER_BELLY, h: 0.20, z: 1.05 });

    // 4 Slender legs with dark cloven hooves
    w.box(0.22, 0.20 + legSwing, 0.14, 0.16, { color: DEER, h: 0.72 });
    w.box(0.22, 0.20 + legSwing, 0.14, 0.16, { color: BOOTS_DARK, h: 0.12, z: 0 });
    w.box(0.64, 0.20 - legSwing, 0.14, 0.16, { color: DEER, h: 0.72 });
    w.box(0.64, 0.20 - legSwing, 0.14, 0.16, { color: BOOTS_DARK, h: 0.12, z: 0 });
    w.box(0.22, 0.64 - legSwing, 0.14, 0.16, { color: DEER, h: 0.72 });
    w.box(0.22, 0.64 - legSwing, 0.14, 0.16, { color: BOOTS_DARK, h: 0.12, z: 0 });
    w.box(0.64, 0.64 + legSwing, 0.14, 0.16, { color: DEER, h: 0.72 });
    w.box(0.64, 0.64 + legSwing, 0.14, 0.16, { color: BOOTS_DARK, h: 0.12, z: 0 });

    // Body & belly
    w.box(0.22, 0.18, 0.56, 0.64, { color: DEER, h: 0.52, z: 0.70 });
    w.box(0.26, 0.24, 0.48, 0.50, { color: DEER_BELLY, h: 0.22, z: 0.70 });

    // Long arching neck & head
    w.box(0.32, 0.54, 0.36, 0.32, { color: DEER, h: 0.65, z: 1.10 + headBob });
    w.box(0.30, 0.58, 0.40, 0.36, { color: DEER, h: 0.36, z: 1.65 + headBob });
    w.box(0.36, 0.82, 0.28, 0.18, { color: DEER_BELLY, h: 0.20, z: 1.68 + headBob });
    w.box(0.42, 0.94, 0.16, 0.08, { color: 0x1c2833ff, h: 0.10, z: 1.76 + headBob }); // Dark nose

    // Eyes & Ears
    w.box(0.28, 0.72, 0.04, 0.08, { color: 0x1c2833ff, h: 0.08, z: 1.84 + headBob });
    w.box(0.68, 0.72, 0.04, 0.08, { color: 0x1c2833ff, h: 0.08, z: 1.84 + headBob });
    w.box(0.20, 0.52, 0.12, 0.12, { color: DEER, h: 0.18, z: 1.95 + headBob });
    w.box(0.68, 0.52, 0.12, 0.12, { color: DEER, h: 0.18, z: 1.95 + headBob });

    // Antlers
    w.post(0.32, 0.56, 1.98 + headBob, 0.85, ANTLER_BONE, 0.04);
    w.post(0.68, 0.56, 1.98 + headBob, 0.85, ANTLER_BONE, 0.04);
    w.post(0.30, 0.72, 2.25 + headBob, 0.35, ANTLER_BONE, 0.03);
    w.post(0.70, 0.72, 2.25 + headBob, 0.35, ANTLER_BONE, 0.03);

  } else if (facing === 0) {
    // ── North: Facing Away ──
    // Head & Antlers at north
    w.box(0.32, 0.14, 0.36, 0.32, { color: DEER, h: 0.65, z: 1.10 + headBob });
    w.box(0.30, 0.08, 0.40, 0.36, { color: DEER, h: 0.36, z: 1.65 + headBob });
    w.post(0.32, 0.16, 1.98 + headBob, 0.85, ANTLER_BONE, 0.04);
    w.post(0.68, 0.16, 1.98 + headBob, 0.85, ANTLER_BONE, 0.04);

    // Legs & Body
    w.box(0.22, 0.20 - legSwing, 0.14, 0.16, { color: DEER, h: 0.72 });
    w.box(0.64, 0.20 + legSwing, 0.14, 0.16, { color: DEER, h: 0.72 });
    w.box(0.22, 0.64 + legSwing, 0.14, 0.16, { color: DEER, h: 0.72 });
    w.box(0.64, 0.64 - legSwing, 0.14, 0.16, { color: DEER, h: 0.72 });
    w.box(0.22, 0.18, 0.56, 0.64, { color: DEER, h: 0.52, z: 0.70 });

    // Tail at south (draw last)
    w.box(0.42, 0.74, 0.16, 0.14, { color: DEER_BELLY, h: 0.20, z: 1.05 });

  } else if (facing === 2) {
    // ── East: Facing +gx ──
    w.box(0.08, 0.42, 0.14, 0.16, { color: DEER_BELLY, h: 0.20, z: 1.05 }); // Tail at west
    w.box(0.20 + legSwing, 0.22, 0.16, 0.14, { color: DEER, h: 0.72 });
    w.box(0.20 - legSwing, 0.64, 0.16, 0.14, { color: DEER, h: 0.72 });
    w.box(0.64 - legSwing, 0.22, 0.16, 0.14, { color: DEER, h: 0.72 });
    w.box(0.64 + legSwing, 0.64, 0.16, 0.14, { color: DEER, h: 0.72 });

    w.box(0.18, 0.22, 0.64, 0.56, { color: DEER, h: 0.52, z: 0.70 });
    w.box(0.54, 0.32, 0.32, 0.36, { color: DEER, h: 0.65, z: 1.10 + headBob });
    w.box(0.58, 0.30, 0.36, 0.40, { color: DEER, h: 0.36, z: 1.65 + headBob });
    w.box(0.82, 0.36, 0.18, 0.28, { color: DEER_BELLY, h: 0.20, z: 1.68 + headBob });
    w.post(0.56, 0.32, 1.98 + headBob, 0.85, ANTLER_BONE, 0.04);
    w.post(0.56, 0.68, 1.98 + headBob, 0.85, ANTLER_BONE, 0.04);

  } else {
    // ── West: Facing -gx ──
    w.box(0.74, 0.42, 0.14, 0.16, { color: DEER_BELLY, h: 0.20, z: 1.05 }); // Tail at east
    w.box(0.20 - legSwing, 0.22, 0.16, 0.14, { color: DEER, h: 0.72 });
    w.box(0.20 + legSwing, 0.64, 0.16, 0.14, { color: DEER, h: 0.72 });
    w.box(0.64 + legSwing, 0.22, 0.16, 0.14, { color: DEER, h: 0.72 });
    w.box(0.64 - legSwing, 0.64, 0.16, 0.14, { color: DEER, h: 0.72 });

    w.box(0.18, 0.22, 0.64, 0.56, { color: DEER, h: 0.52, z: 0.70 });
    w.box(0.14, 0.32, 0.32, 0.36, { color: DEER, h: 0.65, z: 1.10 + headBob });
    w.box(0.08, 0.30, 0.36, 0.40, { color: DEER, h: 0.36, z: 1.65 + headBob });
    w.box(0.00, 0.36, 0.18, 0.28, { color: DEER_BELLY, h: 0.20, z: 1.68 + headBob });
    w.post(0.20, 0.32, 1.98 + headBob, 0.85, ANTLER_BONE, 0.04);
    w.post(0.20, 0.68, 1.98 + headBob, 0.85, ANTLER_BONE, 0.04);
  }
};

export const DEER_SPRITE: SpriteDef = defineSprite({
  id: 'deer', w: 1, d: 1, massing: deerMassing,
});

// ── 4. Wolf (Menacing Slate-Grey Apex Stalker with 4-Way Facing) ────────────────

const wolfMassing: Massing = (w, v, _rng) => {
  const facing = v.flags & 3;
  const phase = ((v.level % 1000) / 1000);
  // @tier-b — predatory stalk cadence
  const legSwing = Math.sin(phase * Math.PI * 2) * 0.07;
  const tailSway = Math.sin(phase * Math.PI * 2) * 0.05;

  w.shadow(0.08, 0.08, 0.84, 0.84, 0.38);

  if (facing === 1) {
    // ── South: Facing Camera ──
    // Tail at north (draw first)
    w.box(0.40 + tailSway, 0.04, 0.20, 0.28, { color: WOLF, h: 0.26, z: 0.54 });
    w.box(0.42 + tailSway * 1.4, 0.00, 0.16, 0.16, { color: WOLF_MANE, h: 0.20, z: 0.46 });

    // 4 Legs
    w.box(0.18, 0.18 + legSwing, 0.16, 0.18, { color: WOLF, h: 0.48 });
    w.box(0.66, 0.18 - legSwing, 0.16, 0.18, { color: WOLF, h: 0.48 });
    w.box(0.18, 0.64 - legSwing, 0.16, 0.18, { color: WOLF, h: 0.48 });
    w.box(0.66, 0.64 + legSwing, 0.16, 0.18, { color: WOLF, h: 0.48 });

    // Body & mane
    w.box(0.20, 0.18, 0.60, 0.64, { color: WOLF, h: 0.46, z: 0.46 });
    w.box(0.16, 0.36, 0.68, 0.44, { color: WOLF_MANE, h: 0.54, z: 0.48 });

    // Head, eyes, ears
    w.box(0.26, 0.50, 0.48, 0.38, { color: WOLF, h: 0.40, z: 0.72 });
    w.box(0.32, 0.76, 0.36, 0.24, { color: WOLF_MANE, h: 0.22, z: 0.74 });
    w.box(0.42, 0.94, 0.16, 0.08, { color: 0x111111ff, h: 0.12, z: 0.82 }); // Black nose

    w.box(0.28, 0.72, 0.06, 0.08, { color: WOLF_EYE, h: 0.08, z: 0.96 });
    w.box(0.66, 0.72, 0.06, 0.08, { color: WOLF_EYE, h: 0.08, z: 0.96 });

    w.post(0.28, 0.48, 1.10, 0.26, WOLF, 0.06);
    w.post(0.72, 0.48, 1.10, 0.26, WOLF, 0.06);

  } else if (facing === 0) {
    // ── North: Facing Away ──
    // Head at north
    w.box(0.26, 0.12, 0.48, 0.38, { color: WOLF, h: 0.40, z: 0.72 });
    w.post(0.28, 0.20, 1.10, 0.26, WOLF, 0.06);
    w.post(0.72, 0.20, 1.10, 0.26, WOLF, 0.06);

    // Legs & Body
    w.box(0.18, 0.18 - legSwing, 0.16, 0.18, { color: WOLF, h: 0.48 });
    w.box(0.66, 0.18 + legSwing, 0.16, 0.18, { color: WOLF, h: 0.48 });
    w.box(0.18, 0.64 + legSwing, 0.16, 0.18, { color: WOLF, h: 0.48 });
    w.box(0.66, 0.64 - legSwing, 0.16, 0.18, { color: WOLF, h: 0.48 });
    w.box(0.20, 0.18, 0.60, 0.64, { color: WOLF, h: 0.46, z: 0.46 });

    // Tail at south (draw last)
    w.box(0.40 + tailSway, 0.74, 0.20, 0.28, { color: WOLF, h: 0.26, z: 0.54 });

  } else if (facing === 2) {
    // ── East: Facing +gx ──
    w.box(0.04, 0.40 + tailSway, 0.28, 0.20, { color: WOLF, h: 0.26, z: 0.54 }); // Tail at west
    w.box(0.18 + legSwing, 0.18, 0.18, 0.16, { color: WOLF, h: 0.48 });
    w.box(0.18 - legSwing, 0.66, 0.18, 0.16, { color: WOLF, h: 0.48 });
    w.box(0.64 - legSwing, 0.18, 0.18, 0.16, { color: WOLF, h: 0.48 });
    w.box(0.64 + legSwing, 0.66, 0.18, 0.16, { color: WOLF, h: 0.48 });

    w.box(0.18, 0.20, 0.64, 0.60, { color: WOLF, h: 0.46, z: 0.46 });
    w.box(0.36, 0.16, 0.44, 0.68, { color: WOLF_MANE, h: 0.54, z: 0.48 });

    // Head at east
    w.box(0.50, 0.26, 0.38, 0.48, { color: WOLF, h: 0.40, z: 0.72 });
    w.box(0.76, 0.32, 0.24, 0.36, { color: WOLF_MANE, h: 0.22, z: 0.74 });
    w.box(0.94, 0.42, 0.08, 0.16, { color: 0x111111ff, h: 0.12, z: 0.82 });
    w.post(0.48, 0.28, 1.10, 0.26, WOLF, 0.06);
    w.post(0.48, 0.72, 1.10, 0.26, WOLF, 0.06);

  } else {
    // ── West: Facing -gx ──
    w.box(0.74, 0.40 + tailSway, 0.28, 0.20, { color: WOLF, h: 0.26, z: 0.54 }); // Tail at east
    w.box(0.18 - legSwing, 0.18, 0.18, 0.16, { color: WOLF, h: 0.48 });
    w.box(0.18 + legSwing, 0.66, 0.18, 0.16, { color: WOLF, h: 0.48 });
    w.box(0.64 + legSwing, 0.18, 0.18, 0.16, { color: WOLF, h: 0.48 });
    w.box(0.64 - legSwing, 0.66, 0.18, 0.16, { color: WOLF, h: 0.48 });

    w.box(0.18, 0.20, 0.64, 0.60, { color: WOLF, h: 0.46, z: 0.46 });

    // Head at west
    w.box(0.12, 0.26, 0.38, 0.48, { color: WOLF, h: 0.40, z: 0.72 });
    w.box(0.00, 0.32, 0.24, 0.36, { color: WOLF_MANE, h: 0.22, z: 0.74 });
    w.box(0.00, 0.42, 0.08, 0.16, { color: 0x111111ff, h: 0.12, z: 0.82 });
    w.post(0.26, 0.28, 1.10, 0.26, WOLF, 0.06);
    w.post(0.26, 0.72, 1.10, 0.26, WOLF, 0.06);
  }
};

export const WOLF_SPRITE: SpriteDef = defineSprite({
  id: 'wolf', w: 1, d: 1, massing: wolfMassing,
});

// ── 5. Troll (Massive 2x2 Ancient Moss-Stone Behemoth with 4-Way Facing) ───────

const trollMassing: Massing = (w, v, _rng) => {
  const facing = v.flags & 3;
  const phase = ((v.level % 1000) / 1000);
  // @tier-b — lumbering heavy earth-shaking stomp
  const stompL = Math.sin(phase * Math.PI * 2) * 0.08;
  const stompR = -stompL;
  const sway = Math.sin(phase * Math.PI * 2) * 0.04;

  w.shadow(0.1, 0.1, 1.8, 1.8, 0.55);

  if (facing === 1) {
    // ── South: Facing Camera ──
    // 2 Massive stone pillar legs
    w.box(0.24, 0.35 + stompL, 0.55, 0.65, { color: TROLL, h: 1.10 });
    w.box(0.20, 0.85 + stompL, 0.60, 0.30, { color: 0x3d4737ff, h: 0.35 });

    w.box(1.21, 0.35 + stompR, 0.55, 0.65, { color: TROLL, h: 1.10 });
    w.box(1.20, 0.85 + stompR, 0.60, 0.30, { color: 0x3d4737ff, h: 0.35 });

    // Hunched boulder torso & mossy plates
    w.box(0.22 + sway, 0.22, 1.56, 1.56, { color: TROLL, h: 1.50, z: 1.05 });
    w.box(0.30 + sway, 0.15, 1.40, 1.20, { color: TROLL_MOSS, h: 0.45, z: 2.20 });

    // Tree-trunk arms with boulder knuckles
    w.box(0.04 + sway, 0.50 - stompL * 0.8, 0.36, 0.55, { color: TROLL, h: 1.70, z: 0.40 });
    w.box(0.02 + sway, 0.85 - stompL * 0.8, 0.40, 0.35, { color: 0x3d4737ff, h: 0.45, z: 0.15 });

    w.box(1.60 + sway, 0.50 - stompR * 0.8, 0.36, 0.55, { color: TROLL, h: 1.70, z: 0.40 });
    w.box(1.58 + sway, 0.85 - stompR * 0.8, 0.40, 0.35, { color: 0x3d4737ff, h: 0.45, z: 0.15 });

    // Shoulder boulders
    w.box(0.12 + sway, 0.45, 0.55, 0.65, { color: 0x5a6654ff, h: 0.65, z: 2.30 });
    w.box(1.33 + sway, 0.45, 0.55, 0.65, { color: 0x5a6654ff, h: 0.65, z: 2.30 });

    // Head, glowing eyes, tusks
    w.box(0.55 + sway, 0.80, 0.90, 0.80, { color: TROLL, h: 0.95, z: 1.65 });
    w.box(0.50 + sway, 1.10, 1.00, 0.45, { color: TROLL_MOSS, h: 0.35, z: 2.45 });

    w.box(0.65 + sway, 1.48, 0.16, 0.08, { color: TROLL_EYE, h: 0.14, z: 2.15 });
    w.box(1.19 + sway, 1.48, 0.16, 0.08, { color: TROLL_EYE, h: 0.14, z: 2.15 });

    w.post(0.68 + sway, 1.55, 1.85, 0.45, 0xe0d6b8ff, 0.07);
    w.post(1.24 + sway, 1.55, 1.85, 0.45, 0xe0d6b8ff, 0.07);

  } else if (facing === 0) {
    // ── North: Facing Away ──
    // Head at north
    w.box(0.55 + sway, 0.30, 0.90, 0.80, { color: TROLL, h: 0.95, z: 1.65 });

    // Legs
    w.box(0.24, 0.35 - stompL, 0.55, 0.65, { color: TROLL, h: 1.10 });
    w.box(1.21, 0.35 - stompR, 0.55, 0.65, { color: TROLL, h: 1.10 });

    // Torso & Back
    w.box(0.22 + sway, 0.22, 1.56, 1.56, { color: TROLL, h: 1.50, z: 1.05 });
    w.box(0.30 + sway, 0.60, 1.40, 1.20, { color: TROLL_MOSS, h: 0.45, z: 2.20 });

    // Arms
    w.box(0.04 + sway, 0.50 + stompL * 0.8, 0.36, 0.55, { color: TROLL, h: 1.70, z: 0.40 });
    w.box(1.60 + sway, 0.50 + stompR * 0.8, 0.36, 0.55, { color: TROLL, h: 1.70, z: 0.40 });

  } else if (facing === 2) {
    // ── East: Facing +gx ──
    w.box(0.35 + stompL, 0.24, 0.65, 0.55, { color: TROLL, h: 1.10 });
    w.box(0.35 + stompR, 1.21, 0.65, 0.55, { color: TROLL, h: 1.10 });

    w.box(0.22, 0.22 + sway, 1.56, 1.56, { color: TROLL, h: 1.50, z: 1.05 });
    w.box(0.15, 0.30 + sway, 1.20, 1.40, { color: TROLL_MOSS, h: 0.45, z: 2.20 });

    // Head at east (+gx)
    w.box(0.80, 0.55 + sway, 0.80, 0.90, { color: TROLL, h: 0.95, z: 1.65 });
    w.box(1.48, 0.65 + sway, 0.08, 0.16, { color: TROLL_EYE, h: 0.14, z: 2.15 });
    w.box(1.48, 1.19 + sway, 0.08, 0.16, { color: TROLL_EYE, h: 0.14, z: 2.15 });
    w.post(1.55, 0.68 + sway, 1.85, 0.45, 0xe0d6b8ff, 0.07);

  } else {
    // ── West: Facing -gx ──
    w.box(0.35 - stompL, 0.24, 0.65, 0.55, { color: TROLL, h: 1.10 });
    w.box(0.35 - stompR, 1.21, 0.65, 0.55, { color: TROLL, h: 1.10 });

    w.box(0.22, 0.22 + sway, 1.56, 1.56, { color: TROLL, h: 1.50, z: 1.05 });

    // Head at west (-gx)
    w.box(0.30, 0.55 + sway, 0.80, 0.90, { color: TROLL, h: 0.95, z: 1.65 });
    w.box(0.16, 0.65 + sway, 0.08, 0.16, { color: TROLL_EYE, h: 0.14, z: 2.15 });
    w.box(0.16, 1.19 + sway, 0.08, 0.16, { color: TROLL_EYE, h: 0.14, z: 2.15 });
    w.post(0.25, 0.68 + sway, 1.85, 0.45, 0xe0d6b8ff, 0.07);
  }
};

export const TROLL_SPRITE: SpriteDef = defineSprite({
  id: 'troll', w: 2, d: 2, massing: trollMassing,
});

// ── 5. Bear (Massive Grizzly / Brown Bear with 4-Way Facing) ───────────────────

const bearMassing: Massing = (w, v, _rng) => {
  const facing = v.flags & 3;
  const phase = ((v.level % 1000) / 1000);
  // @tier-b — lumbering heavy quad gait
  const legSwing = Math.sin(phase * Math.PI * 2) * 0.08;
  const headSway = Math.sin(phase * Math.PI * 2) * 0.03;

  w.shadow(0.1, 0.1, 1.4, 1.4, 0.45);

  if (facing === 1) {
    // South: Facing camera
    w.box(0.24, 0.24 + legSwing, 0.26, 0.28, { color: BEAR, h: 0.55 });
    w.box(0.24, 0.24 + legSwing, 0.26, 0.28, { color: BEAR_CLAW, h: 0.12, z: 0 });
    w.box(0.90, 0.24 - legSwing, 0.26, 0.28, { color: BEAR, h: 0.55 });
    w.box(0.90, 0.24 - legSwing, 0.26, 0.28, { color: BEAR_CLAW, h: 0.12, z: 0 });
    w.box(0.24, 0.88 - legSwing, 0.26, 0.28, { color: BEAR, h: 0.55 });
    w.box(0.24, 0.88 - legSwing, 0.26, 0.28, { color: BEAR_CLAW, h: 0.12, z: 0 });
    w.box(0.90, 0.88 + legSwing, 0.26, 0.28, { color: BEAR, h: 0.55 });
    w.box(0.90, 0.88 + legSwing, 0.26, 0.28, { color: BEAR_CLAW, h: 0.12, z: 0 });

    w.box(0.26, 0.22, 0.88, 0.96, { color: BEAR, h: 0.70, z: 0.50 });
    w.box(0.32, 0.48, 0.76, 0.58, { color: BEAR, h: 0.85, z: 0.58 });

    w.box(0.38, 0.76, 0.64, 0.48, { color: BEAR, h: 0.50, z: 0.85 + headSway });
    w.box(0.48, 1.08, 0.44, 0.28, { color: BEAR_MUZZLE, h: 0.28, z: 0.88 + headSway });
    w.box(0.62, 1.30, 0.16, 0.10, { color: BEAR_NOSE, h: 0.12, z: 0.98 + headSway });

    w.box(0.32, 0.70, 0.18, 0.18, { color: BEAR, h: 0.20, z: 1.35 + headSway });
    w.box(0.90, 0.70, 0.18, 0.18, { color: BEAR, h: 0.20, z: 1.35 + headSway });
  } else if (facing === 0) {
    // North: Facing away
    w.box(0.38, 0.16, 0.64, 0.48, { color: BEAR, h: 0.50, z: 0.85 + headSway });
    w.box(0.32, 0.20, 0.18, 0.18, { color: BEAR, h: 0.20, z: 1.35 + headSway });
    w.box(0.90, 0.20, 0.18, 0.18, { color: BEAR, h: 0.20, z: 1.35 + headSway });

    w.box(0.24, 0.24 - legSwing, 0.26, 0.28, { color: BEAR, h: 0.55 });
    w.box(0.90, 0.24 + legSwing, 0.26, 0.28, { color: BEAR, h: 0.55 });
    w.box(0.24, 0.88 + legSwing, 0.26, 0.28, { color: BEAR, h: 0.55 });
    w.box(0.90, 0.88 - legSwing, 0.26, 0.28, { color: BEAR, h: 0.55 });

    w.box(0.26, 0.22, 0.88, 0.96, { color: BEAR, h: 0.70, z: 0.50 });
    w.box(0.32, 0.34, 0.76, 0.58, { color: BEAR, h: 0.85, z: 0.58 });
  } else if (facing === 2) {
    // East: Facing +gx
    w.box(0.24 + legSwing, 0.24, 0.28, 0.26, { color: BEAR, h: 0.55 });
    w.box(0.24 - legSwing, 0.90, 0.28, 0.26, { color: BEAR, h: 0.55 });
    w.box(0.88 - legSwing, 0.24, 0.28, 0.26, { color: BEAR, h: 0.55 });
    w.box(0.88 + legSwing, 0.90, 0.28, 0.26, { color: BEAR, h: 0.55 });

    w.box(0.22, 0.26, 0.96, 0.88, { color: BEAR, h: 0.70, z: 0.50 });
    w.box(0.48, 0.32, 0.58, 0.76, { color: BEAR, h: 0.85, z: 0.58 });

    w.box(0.76, 0.38, 0.48, 0.64, { color: BEAR, h: 0.50, z: 0.85 + headSway });
    w.box(1.08, 0.48, 0.28, 0.44, { color: BEAR_MUZZLE, h: 0.28, z: 0.88 + headSway });
    w.box(1.30, 0.62, 0.10, 0.16, { color: BEAR_NOSE, h: 0.12, z: 0.98 + headSway });
  } else {
    // West: Facing -gx
    w.box(0.24 - legSwing, 0.24, 0.28, 0.26, { color: BEAR, h: 0.55 });
    w.box(0.24 + legSwing, 0.90, 0.28, 0.26, { color: BEAR, h: 0.55 });
    w.box(0.88 + legSwing, 0.24, 0.28, 0.26, { color: BEAR, h: 0.55 });
    w.box(0.88 - legSwing, 0.90, 0.28, 0.26, { color: BEAR, h: 0.55 });

    w.box(0.22, 0.26, 0.96, 0.88, { color: BEAR, h: 0.70, z: 0.50 });
    w.box(0.34, 0.32, 0.58, 0.76, { color: BEAR, h: 0.85, z: 0.58 });

    w.box(0.16, 0.38, 0.48, 0.64, { color: BEAR, h: 0.50, z: 0.85 + headSway });
    w.box(0.04, 0.48, 0.28, 0.44, { color: BEAR_MUZZLE, h: 0.28, z: 0.88 + headSway });
    w.box(0.00, 0.62, 0.10, 0.16, { color: BEAR_NOSE, h: 0.12, z: 0.98 + headSway });
  }
};

export const BEAR_SPRITE: SpriteDef = defineSprite({
  id: 'bear', w: 2, d: 2, massing: bearMassing,
});

// ── 6. Wild Boar (Stout Russet Quadruped with Protruding Tusks) ────────────────

const boarMassing: Massing = (w, v, _rng) => {
  const facing = v.flags & 3;
  const phase = ((v.level % 1000) / 1000);
  const legSwing = Math.sin(phase * Math.PI * 2) * 0.08;

  w.shadow(0.12, 0.12, 0.76, 0.76, 0.32);

  if (facing === 1) {
    // South: Facing Camera
    w.box(0.20, 0.20 + legSwing, 0.16, 0.18, { color: BOAR_MANE, h: 0.38 });
    w.box(0.64, 0.20 - legSwing, 0.16, 0.18, { color: BOAR_MANE, h: 0.38 });
    w.box(0.20, 0.62 - legSwing, 0.16, 0.18, { color: BOAR_MANE, h: 0.38 });
    w.box(0.64, 0.62 + legSwing, 0.16, 0.18, { color: BOAR_MANE, h: 0.38 });

    w.box(0.20, 0.18, 0.60, 0.64, { color: BOAR, h: 0.48, z: 0.32 });
    w.box(0.38, 0.18, 0.24, 0.60, { color: BOAR_MANE, h: 0.18, z: 0.78 });

    w.box(0.26, 0.52, 0.48, 0.38, { color: BOAR, h: 0.42, z: 0.56 });
    w.box(0.32, 0.78, 0.36, 0.22, { color: BOAR_SNOUT, h: 0.26, z: 0.56 });

    w.post(0.24, 0.82, 0.62, 0.22, BOAR_TUSK, 0.04);
    w.post(0.76, 0.82, 0.62, 0.22, BOAR_TUSK, 0.04);
  } else if (facing === 0) {
    // North: Facing Away
    w.box(0.26, 0.12, 0.48, 0.38, { color: BOAR, h: 0.42, z: 0.56 });
    w.box(0.20, 0.20 - legSwing, 0.16, 0.18, { color: BOAR_MANE, h: 0.38 });
    w.box(0.64, 0.20 + legSwing, 0.16, 0.18, { color: BOAR_MANE, h: 0.38 });
    w.box(0.20, 0.62 + legSwing, 0.16, 0.18, { color: BOAR_MANE, h: 0.38 });
    w.box(0.64, 0.62 - legSwing, 0.16, 0.18, { color: BOAR_MANE, h: 0.38 });
    w.box(0.20, 0.18, 0.60, 0.64, { color: BOAR, h: 0.48, z: 0.32 });
    w.box(0.38, 0.22, 0.24, 0.60, { color: BOAR_MANE, h: 0.18, z: 0.78 });
  } else if (facing === 2) {
    // East: Facing +gx
    w.box(0.20 + legSwing, 0.20, 0.18, 0.16, { color: BOAR_MANE, h: 0.38 });
    w.box(0.20 - legSwing, 0.64, 0.18, 0.16, { color: BOAR_MANE, h: 0.38 });
    w.box(0.62 - legSwing, 0.20, 0.18, 0.16, { color: BOAR_MANE, h: 0.38 });
    w.box(0.62 + legSwing, 0.64, 0.18, 0.16, { color: BOAR_MANE, h: 0.38 });

    w.box(0.18, 0.20, 0.64, 0.60, { color: BOAR, h: 0.48, z: 0.32 });
    w.box(0.50, 0.26, 0.38, 0.48, { color: BOAR, h: 0.42, z: 0.56 });
    w.box(0.76, 0.32, 0.22, 0.36, { color: BOAR_SNOUT, h: 0.26, z: 0.56 });
    w.post(0.82, 0.24, 0.62, 0.22, BOAR_TUSK, 0.04);
    w.post(0.82, 0.76, 0.62, 0.22, BOAR_TUSK, 0.04);
  } else {
    // West: Facing -gx
    w.box(0.20 - legSwing, 0.20, 0.18, 0.16, { color: BOAR_MANE, h: 0.38 });
    w.box(0.20 + legSwing, 0.64, 0.18, 0.16, { color: BOAR_MANE, h: 0.38 });
    w.box(0.62 + legSwing, 0.20, 0.18, 0.16, { color: BOAR_MANE, h: 0.38 });
    w.box(0.62 - legSwing, 0.64, 0.18, 0.16, { color: BOAR_MANE, h: 0.38 });

    w.box(0.18, 0.20, 0.64, 0.60, { color: BOAR, h: 0.48, z: 0.32 });
    w.box(0.12, 0.26, 0.38, 0.48, { color: BOAR, h: 0.42, z: 0.56 });
    w.box(0.02, 0.32, 0.22, 0.36, { color: BOAR_SNOUT, h: 0.26, z: 0.56 });
    w.post(0.18, 0.24, 0.62, 0.22, BOAR_TUSK, 0.04);
    w.post(0.18, 0.76, 0.62, 0.22, BOAR_TUSK, 0.04);
  }
};

export const BOAR_SPRITE: SpriteDef = defineSprite({
  id: 'boar', w: 1, d: 1, massing: boarMassing,
});

// ── 7. Marsh Crocodile (Armored Aquatic Reptile with Tail Sway) ────────────────

const crocMassing: Massing = (w, v, _rng) => {
  const facing = v.flags & 3;
  const phase = ((v.level % 1000) / 1000);
  const tailSway = Math.sin(phase * Math.PI * 2) * 0.12;

  w.shadow(0.06, 0.06, 0.88, 0.88, 0.35);

  if (facing === 1) {
    // South: Facing Camera
    w.box(0.42 + tailSway, 0.02, 0.16, 0.34, { color: CROC, h: 0.18, z: 0.08 });
    w.box(0.45 + tailSway * 1.5, 0.00, 0.10, 0.20, { color: CROC_RIDGE, h: 0.14, z: 0.24 });

    w.box(0.08, 0.26, 0.18, 0.18, { color: CROC, h: 0.16, z: 0 });
    w.box(0.74, 0.26, 0.18, 0.18, { color: CROC, h: 0.16, z: 0 });
    w.box(0.08, 0.58, 0.18, 0.18, { color: CROC, h: 0.16, z: 0 });
    w.box(0.74, 0.58, 0.18, 0.18, { color: CROC, h: 0.16, z: 0 });

    w.box(0.20, 0.20, 0.60, 0.58, { color: CROC, h: 0.24, z: 0.06 });
    w.box(0.36, 0.22, 0.28, 0.52, { color: CROC_RIDGE, h: 0.14, z: 0.28 });

    w.box(0.26, 0.68, 0.48, 0.38, { color: CROC, h: 0.20, z: 0.08 });
    w.box(0.28, 0.94, 0.06, 0.08, { color: CROC_TOOTH, h: 0.10, z: 0.16 });
    w.box(0.66, 0.94, 0.06, 0.08, { color: CROC_TOOTH, h: 0.10, z: 0.16 });
  } else if (facing === 0) {
    // North: Facing Away
    w.box(0.26, 0.04, 0.48, 0.38, { color: CROC, h: 0.20, z: 0.08 });
    w.box(0.20, 0.22, 0.60, 0.58, { color: CROC, h: 0.24, z: 0.06 });
    w.box(0.36, 0.26, 0.28, 0.52, { color: CROC_RIDGE, h: 0.14, z: 0.28 });
    w.box(0.42 + tailSway, 0.64, 0.16, 0.34, { color: CROC, h: 0.18, z: 0.08 });
  } else if (facing === 2) {
    // East: Facing +gx
    w.box(0.02, 0.42 + tailSway, 0.34, 0.16, { color: CROC, h: 0.18, z: 0.08 });
    w.box(0.20, 0.20, 0.58, 0.60, { color: CROC, h: 0.24, z: 0.06 });
    w.box(0.24, 0.36, 0.52, 0.28, { color: CROC_RIDGE, h: 0.14, z: 0.28 });
    w.box(0.68, 0.26, 0.38, 0.48, { color: CROC, h: 0.20, z: 0.08 });
  } else {
    // West: Facing -gx
    w.box(0.64, 0.42 + tailSway, 0.34, 0.16, { color: CROC, h: 0.18, z: 0.08 });
    w.box(0.22, 0.20, 0.58, 0.60, { color: CROC, h: 0.24, z: 0.06 });
    w.box(0.24, 0.36, 0.52, 0.28, { color: CROC_RIDGE, h: 0.14, z: 0.28 });
    w.box(0.04, 0.26, 0.38, 0.48, { color: CROC, h: 0.20, z: 0.08 });
  }
};

export const CROC_SPRITE: SpriteDef = defineSprite({
  id: 'croc', w: 1, d: 1, massing: crocMassing,
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
    case 'bear':   return BEAR_SPRITE;
    case 'boar':   return BOAR_SPRITE;
    case 'croc':   return CROC_SPRITE;
  }
}


export interface MutableVariant {
  seed: number;
  flags: number;
  level: number;
  progress: number;
  label: string;
}

const CREATURE_VARIANT_SCRATCH: MutableVariant = {
  seed:     0,
  flags:    0,
  level:    0,
  progress: 1,
  label:    '',
};

const PLAYER_VARIANT_SCRATCH: MutableVariant = {
  seed:     0,
  flags:    0,
  level:    0,
  progress: 1,
  label:    '',
};

/**
 * Build a `Variant` for a creature.
 *
 * Encodes facing orientation, state, and walk animation phase.
 * Reuses an internal scratch variant to guarantee zero allocations on the hot path.
 */
export function creatureVariant(c: Creature): Variant {
  const facingCode = c.facing === 's' ? 1 : c.facing === 'e' ? 2 : c.facing === 'w' ? 3 : 0;
  const stateCode = c.state === 'idle' ? 0 : c.state === 'wander' ? 1 : c.state === 'flee' ? 2 : c.state === 'chase' ? 3 : c.state === 'eat' ? 4 : 5;

  CREATURE_VARIANT_SCRATCH.seed = hash2(c.id, 0, 0);
  CREATURE_VARIANT_SCRATCH.flags = facingCode | (stateCode << 3);
  CREATURE_VARIANT_SCRATCH.level = Math.floor((c.walkCycle % 1) * 1000);
  CREATURE_VARIANT_SCRATCH.progress = c.traits.size;
  CREATURE_VARIANT_SCRATCH.label = '';
  return CREATURE_VARIANT_SCRATCH;
}

/**
 * Build a `Variant` for a player — encodes facing orientation, movement, weapon, and leg stride phase.
 * Reuses an internal scratch variant to guarantee zero allocations on the hot path.
 */
export function playerVariant(p: Player): Variant {
  const facingCode = p.facing === 's' ? 1 : p.facing === 'e' ? 2 : p.facing === 'w' ? 3 : 0;
  const isMovingFlag = p.isMoving ? 4 : 0;
  const weaponCode = p.weapon === 'hands' ? 0 : p.weapon === 'axe' ? 1 : p.weapon === 'sword' ? 2 : 3;

  PLAYER_VARIANT_SCRATCH.seed = hash2(p.index, 42, 0);
  PLAYER_VARIANT_SCRATCH.flags = facingCode | isMovingFlag | (weaponCode << 4);
  PLAYER_VARIANT_SCRATCH.level = p.attackCooldown > 0 ? 1 : 0;
  PLAYER_VARIANT_SCRATCH.progress = p.walkCycle % 1;
  PLAYER_VARIANT_SCRATCH.label = '';
  return PLAYER_VARIANT_SCRATCH;
}

/** A generic scratch Variant — hoisted so the common case allocates nothing. Must be filled before use. */
export const VARIANT_SCRATCH: MutableVariant = {
  seed:     0,
  flags:    0,
  level:    0,
  progress: 1,
  label:    '',
};

/** Fill scratch variant with values and return it typed as Variant. */
export function setScratchVariant(
  seed: number,
  flags = 0,
  level = 0,
  progress = 1,
  label = '',
): Variant {
  VARIANT_SCRATCH.seed = seed;
  VARIANT_SCRATCH.flags = flags;
  VARIANT_SCRATCH.level = level;
  VARIANT_SCRATCH.progress = progress;
  VARIANT_SCRATCH.label = label;
  return VARIANT_SCRATCH;
}


