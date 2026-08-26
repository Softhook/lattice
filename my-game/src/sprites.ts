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
  TROLL_DARK,
  TROLL_TUSK,
  TROLL_CLUB,
  TROLL_CLUB_BAND,
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
  CROC_RIDGE,
  CROC_TOOTH,
  CROC_EYE,
  SHADE_ROBE,
  SHADE_ROBE_DARK,
  MAGIC_GLOW,
  MAGIC_GLOW_CORE,
  BOOTS_DARK,
  SKIN_TONE,
  HAIR_DARK,
  BACKPACK_COL,
  TOOL_GOLD,
  TOOL_STEEL,
} from './palette.js';


// ── Player Sprite ─────────────────────────────────────────────────────────────

/** Player adventurer — detailed outfit, articulated walking legs, weapon in hand, backpack, and combat/interaction kinematics. */
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
    const actionCode = (v.flags >> 6) & 15; // 0: none, 1: sword, 2: axe, 3: punch, 4: bow, 5: chop, 6: mine, 7: forage, 8: repair, 9: dig, 10: raise
    const isHurt = ((v.flags >> 10) & 1) !== 0;

    const actionPhase = (v.level % 1000) / 1000; // 0..1 action progress
    const walkPhase = v.progress; // 0..1 stride cycle

    // @tier-b — smooth, natural leg stride, body bob, and action kinematics
    const swing = isMoving ? Math.sin(walkPhase * Math.PI * 2) * 0.08 : 0;
    const armSwing = isMoving ? Math.sin(walkPhase * Math.PI * 2) * 0.05 : 0;
    const bob = isMoving ? Math.abs(Math.sin(walkPhase * Math.PI * 2)) * 0.03 : 0;

    // Action animation interpolation
    const slashSin = Math.sin(actionPhase * Math.PI);
    const chopSin = Math.sin(actionPhase * Math.PI);
    const punchSin = Math.sin(actionPhase * Math.PI);
    const bowDrawSin = Math.sin(Math.min(1.0, actionPhase * 1.5) * Math.PI * 0.5);
    const forageSin = Math.sin(actionPhase * Math.PI);
    const digSin = Math.sin(actionPhase * Math.PI);
    const hammerSin = Math.sin(actionPhase * Math.PI * 4);
    const hurtStagger = isHurt ? Math.sin(actionPhase * Math.PI * 8) * 0.05 : 0;

    // Body posture adjustments during actions
    const forwardLean =
      actionCode === 1 ? slashSin * 0.06 :
      (actionCode === 2 || actionCode === 5) ? chopSin * 0.08 :
      actionCode === 3 ? punchSin * 0.08 :
      actionCode === 7 ? forageSin * 0.12 :
      (actionCode === 9 || actionCode === 10) ? digSin * 0.10 : 0;

    const zBase = bob + (actionCode === 7 ? -forageSin * 0.10 : 0) + hurtStagger;

    if (facing === 1) {
      // ── Facing South (S key / toward camera) ──
      // 1. Far/North elements draw FIRST in painter's order:
      // Backpack on north face
      w.box(0.32, 0.16 - forwardLean * 0.5, 0.36, 0.14, { color: packColor, h: 0.55, z: 0.5 + zBase });
      w.box(0.44, 0.14 - forwardLean * 0.5, 0.12, 0.04, { color: hiltGold, h: 0.12, z: 0.7 + zBase });

      // Far Arm (Left Arm on north-west shoulder)
      let farArmY = 0.32 - armSwing + forwardLean;
      let farArmZ = 0.68 + zBase;
      if (actionCode === 4) {
        // Holding bow forward
        farArmY = 0.48;
        farArmZ = 0.78 + zBase;
      } else if (actionCode === 7) {
        farArmZ = 0.42 + zBase;
        farArmY = 0.48;
      }
      w.box(0.14, farArmY, 0.12, 0.20, { color: bodyColor, h: 0.55, z: farArmZ });
      w.box(0.14, farArmY + 0.06, 0.12, 0.12, { color: SKIN_TONE, h: 0.14, z: farArmZ - 0.12 });

      if (actionCode === 4) {
        // Bow in left hand
        w.box(0.12, farArmY + 0.08, 0.04, 0.26, { color: woodShaft, h: 0.95, z: farArmZ - 0.25 });
        w.post(0.14, farArmY + 0.08, farArmZ - 0.20, 0.85, 0xffffffff, 0.02);
      }

      // 2. Legs:
      w.box(0.26, 0.36 + swing, 0.18, 0.24, { color: BOOTS_DARK, h: 0.45 });
      w.box(0.54, 0.36 - swing, 0.18, 0.24, { color: BOOTS_DARK, h: 0.45 });

      // 3. Torso & Belt:
      w.box(0.24, 0.24 + forwardLean, 0.52, 0.52, { color: bodyColor, h: 0.4, z: 0.45 + zBase });
      w.box(0.23, 0.23 + forwardLean, 0.54, 0.54, { color: 0x1a252fff, h: 0.1, z: 0.48 + zBase });
      w.box(0.25, 0.25 + forwardLean, 0.50, 0.50, { color: bodyColor, h: 0.5, z: 0.85 + zBase });

      // 4. Head, Hair & Visor on south face:
      w.box(0.28, 0.28 + forwardLean * 1.2, 0.44, 0.44, { color: SKIN_TONE, h: 0.44, z: 1.35 + zBase });
      w.box(0.26, 0.26 + forwardLean * 1.2, 0.48, 0.48, { color: HAIR_DARK, h: 0.18, z: 1.68 + zBase });
      w.box(0.34, 0.70 + forwardLean * 1.2, 0.32, 0.04, { color: visorColor, h: 0.14, z: 1.48 + zBase });

      // 5. Near Arm (Right Arm on south-east side) — articulated for combat & harvesting:
      let nearArmX = 0.74;
      let nearArmY = 0.32 + armSwing + forwardLean;
      let nearArmZ = 0.70 + zBase;

      if (actionCode === 1) {
        // Sword slash: arm sweeps forward and across
        nearArmX = 0.74 - slashSin * 0.22;
        nearArmY = 0.32 + slashSin * 0.30;
        nearArmZ = 0.70 + zBase - slashSin * 0.12;
      } else if (actionCode === 2 || actionCode === 5) {
        // Axe chop / Tree harvest: raises high and slams down
        nearArmY = 0.32 + chopSin * 0.28;
        nearArmZ = 0.70 + zBase + (1 - chopSin) * 0.32 - chopSin * 0.24;
      } else if (actionCode === 3) {
        // Fist punch jab
        nearArmY = 0.32 + punchSin * 0.38;
      } else if (actionCode === 4) {
        // Bow draw string back
        nearArmX = 0.64;
        nearArmY = 0.24 - bowDrawSin * 0.14;
        nearArmZ = 0.78 + zBase;
      } else if (actionCode === 6) {
        // Mining strike
        nearArmY = 0.32 + chopSin * 0.24;
        nearArmZ = 0.70 + zBase + (1 - chopSin) * 0.28 - chopSin * 0.26;
      } else if (actionCode === 7) {
        // Foraging gather
        nearArmY = 0.48;
        nearArmZ = 0.42 + zBase;
      } else if (actionCode === 8) {
        // Repair hammer
        nearArmY = 0.38 + hammerSin * 0.08;
        nearArmZ = 0.70 + zBase + hammerSin * 0.10;
      } else if (actionCode === 9 || actionCode === 10) {
        // Dig / Raise shovel scoop
        nearArmY = 0.36 + digSin * 0.24;
        nearArmZ = 0.70 + zBase - digSin * 0.32;
      }

      w.box(nearArmX, nearArmY, 0.14, 0.20, { color: bodyColor, h: 0.55, z: nearArmZ });
      w.box(nearArmX, nearArmY + 0.08, 0.14, 0.14, { color: SKIN_TONE, h: 0.16, z: nearArmZ - 0.12 });

      // 6. Weapon in near hand (synchronized with arm kinematics):
      if (weaponCode === 1 || actionCode === 5) {
        // Woodsman Axe
        const axeZ = nearArmZ - 0.40;
        w.post(nearArmX + 0.05, nearArmY + 0.14, axeZ, 0.85, woodShaft, 0.05);
        w.box(nearArmX + 0.01, nearArmY + 0.16, 0.22, 0.12, { color: bladeSteel, h: 0.28, z: axeZ + 0.65 });
      } else if (weaponCode === 2 || actionCode === 1) {
        // Stone Blade (Sword)
        const swordZ = nearArmZ - 0.30;
        w.box(nearArmX + 0.03, nearArmY + 0.13, 0.06, 0.14, { color: bladeSteel, h: 0.95, z: swordZ });
        w.box(nearArmX - 0.02, nearArmY + 0.12, 0.16, 0.16, { color: hiltGold, h: 0.08, z: swordZ + 0.25 });
      } else if (weaponCode === 3 && actionCode !== 4) {
        // Hunting Bow (idle at side)
        w.box(0.74, 0.48, 0.04, 0.22, { color: woodShaft, h: 0.85, z: 0.5 + zBase });
        w.post(0.75, 0.48, 0.55 + zBase, 0.75, 0xffffffff, 0.02);
      }

    } else if (facing === 0) {
      // ── Facing North (W key / away from camera) ──
      // 1. Visor on North face
      w.box(0.34, 0.26 - forwardLean * 1.2, 0.32, 0.04, { color: visorColor, h: 0.14, z: 1.48 + zBase });

      // 2. Far Arm (Left Arm)
      w.box(0.14, 0.32 + armSwing - forwardLean, 0.12, 0.20, { color: bodyColor, h: 0.55, z: 0.68 + zBase });
      w.box(0.14, 0.26 + armSwing - forwardLean, 0.12, 0.12, { color: SKIN_TONE, h: 0.14, z: 0.56 + zBase });

      // 3. Legs
      w.box(0.26, 0.36 - swing, 0.18, 0.24, { color: BOOTS_DARK, h: 0.45 });
      w.box(0.54, 0.36 + swing, 0.18, 0.24, { color: BOOTS_DARK, h: 0.45 });

      // 4. Torso
      w.box(0.24, 0.24 - forwardLean, 0.52, 0.52, { color: bodyColor, h: 0.4, z: 0.45 + zBase });
      w.box(0.25, 0.25 - forwardLean, 0.50, 0.50, { color: bodyColor, h: 0.5, z: 0.85 + zBase });

      // 5. Head & Hair
      w.box(0.28, 0.28 - forwardLean * 1.2, 0.44, 0.44, { color: HAIR_DARK, h: 0.44, z: 1.35 + zBase });

      // 6. Near Arm (Right Arm) with attack offsets
      let nArmY = 0.32 - armSwing - forwardLean;
      let nArmZ = 0.70 + zBase;
      if (actionCode === 1) nArmY -= slashSin * 0.28;
      else if (actionCode === 2 || actionCode === 5) nArmZ += (1 - chopSin) * 0.32 - chopSin * 0.24;
      else if (actionCode === 3) nArmY -= punchSin * 0.35;

      w.box(0.74, nArmY, 0.14, 0.20, { color: bodyColor, h: 0.55, z: nArmZ });
      w.box(0.74, nArmY - 0.06, 0.14, 0.14, { color: SKIN_TONE, h: 0.16, z: nArmZ - 0.12 });

      // 7. Backpack on South face (facing camera, draw last)
      w.box(0.32, 0.70 - forwardLean * 0.5, 0.36, 0.14, { color: packColor, h: 0.55, z: 0.5 + zBase });
      w.box(0.44, 0.82 - forwardLean * 0.5, 0.12, 0.04, { color: hiltGold, h: 0.12, z: 0.7 + zBase });

    } else if (facing === 2) {
      // ── Facing East (D key / +gx) ──
      // Backpack on West side
      w.box(0.16 - forwardLean * 0.5, 0.32, 0.14, 0.36, { color: packColor, h: 0.55, z: 0.5 + zBase });

      // Far Arm (north side)
      w.box(0.32 + armSwing + forwardLean, 0.14, 0.20, 0.12, { color: bodyColor, h: 0.55, z: 0.68 + zBase });

      // Legs
      w.box(0.36 + swing, 0.26, 0.24, 0.18, { color: BOOTS_DARK, h: 0.45 });
      w.box(0.36 - swing, 0.54, 0.24, 0.18, { color: BOOTS_DARK, h: 0.45 });

      // Torso
      w.box(0.24 + forwardLean, 0.24, 0.52, 0.52, { color: bodyColor, h: 0.4, z: 0.45 + zBase });
      w.box(0.25 + forwardLean, 0.25, 0.50, 0.50, { color: bodyColor, h: 0.5, z: 0.85 + zBase });

      // Head & Visor
      w.box(0.28 + forwardLean * 1.2, 0.28, 0.44, 0.44, { color: SKIN_TONE, h: 0.44, z: 1.35 + zBase });
      w.box(0.26 + forwardLean * 1.2, 0.26, 0.48, 0.48, { color: HAIR_DARK, h: 0.18, z: 1.68 + zBase });
      w.box(0.70 + forwardLean * 1.2, 0.34, 0.04, 0.32, { color: visorColor, h: 0.14, z: 1.48 + zBase });

      // Near Arm (south side) with articulated East thrust/swing
      let eArmX = 0.32 - armSwing + forwardLean;
      let eArmZ = 0.70 + zBase;
      if (actionCode === 1) eArmX += slashSin * 0.30;
      else if (actionCode === 2 || actionCode === 5) eArmZ += (1 - chopSin) * 0.32 - chopSin * 0.24;
      else if (actionCode === 3) eArmX += punchSin * 0.35;

      w.box(eArmX, 0.74, 0.20, 0.14, { color: bodyColor, h: 0.55, z: eArmZ });
      w.box(eArmX + 0.08, 0.74, 0.14, 0.14, { color: SKIN_TONE, h: 0.16, z: eArmZ - 0.12 });

      // Weapon
      if (weaponCode === 2 || actionCode === 1) {
        w.box(eArmX + 0.43, 0.46, 0.24, 0.06, { color: bladeSteel, h: 0.85, z: eArmZ - 0.15 });
      } else if (weaponCode === 1 || actionCode === 5) {
        w.post(eArmX + 0.45, 0.46, eArmZ - 0.30, 0.85, woodShaft, 0.05);
        w.box(eArmX + 0.43, 0.46, 0.12, 0.22, { color: bladeSteel, h: 0.28, z: eArmZ + 0.35 });
      }

    } else {
      // ── Facing West (A key / -gx) ──
      w.box(0.26 - forwardLean * 1.2, 0.34, 0.04, 0.32, { color: visorColor, h: 0.14, z: 1.48 + zBase });

      // Far Arm (north side)
      w.box(0.32 - armSwing - forwardLean, 0.14, 0.20, 0.12, { color: bodyColor, h: 0.55, z: 0.68 + zBase });

      // Legs
      w.box(0.36 - swing, 0.26, 0.24, 0.18, { color: BOOTS_DARK, h: 0.45 });
      w.box(0.36 + swing, 0.54, 0.24, 0.18, { color: BOOTS_DARK, h: 0.45 });

      // Torso
      w.box(0.24 - forwardLean, 0.24, 0.52, 0.52, { color: bodyColor, h: 0.4, z: 0.45 + zBase });
      w.box(0.25 - forwardLean, 0.25, 0.50, 0.50, { color: bodyColor, h: 0.5, z: 0.85 + zBase });

      // Head
      w.box(0.28 - forwardLean * 1.2, 0.28, 0.44, 0.44, { color: SKIN_TONE, h: 0.44, z: 1.35 + zBase });
      w.box(0.26 - forwardLean * 1.2, 0.26, 0.48, 0.48, { color: HAIR_DARK, h: 0.18, z: 1.68 + zBase });

      // Near Arm (south side) with articulated West thrust/swing
      let wArmX = 0.32 + armSwing - forwardLean;
      let wArmZ = 0.70 + zBase;
      if (actionCode === 1) wArmX -= slashSin * 0.30;
      else if (actionCode === 2 || actionCode === 5) wArmZ += (1 - chopSin) * 0.32 - chopSin * 0.24;
      else if (actionCode === 3) wArmX -= punchSin * 0.35;

      w.box(wArmX, 0.74, 0.20, 0.14, { color: bodyColor, h: 0.55, z: wArmZ });
      w.box(wArmX - 0.06, 0.74, 0.14, 0.14, { color: SKIN_TONE, h: 0.16, z: wArmZ - 0.12 });

      // Backpack on East side
      w.box(0.70 - forwardLean * 0.5, 0.32, 0.14, 0.36, { color: packColor, h: 0.55, z: 0.5 + zBase });
    }
  };
}

export const PLAYER_SPRITES: [SpriteDef, SpriteDef] = [
  defineSprite({ id: 'player0', w: 1, d: 1, massing: makePlayerMassing(P1_COLOR) }),
  defineSprite({ id: 'player1', w: 1, d: 1, massing: makePlayerMassing(P2_COLOR) }),
];

// ── 1. Rabbit (Detailed Fluffy Bounding Hare with Eating/Foraging & Fleeing Animations) ──

const rabbitMassing: Massing = (w, v, _rng) => {
  const facing = v.flags & 3; // 0: 'n', 1: 's', 2: 'e', 3: 'w'
  const stateCode = (v.flags >> 3) & 7; // 0: idle, 1: wander, 2: flee, 3: chase, 4: attack, 5: eat, 6: forage
  const isHurt = ((v.flags >> 7) & 1) !== 0;

  const phase = ((v.level % 1000) / 1000);
  const isEating = stateCode === 5 || stateCode === 6;
  const isFleeing = stateCode === 2;

  // @tier-b — gentle hopping or frantic sprinting leaps with nibbling chewing motion
  const hopMultiplier = isFleeing ? 1.8 : isEating ? 0.2 : 1.0;
  const hop = phase < 0.35 ? Math.sin((phase / 0.35) * Math.PI) * 0.08 * hopMultiplier : 0;

  const chewNibble = isEating ? Math.sin(phase * Math.PI * 10) * 0.02 : 0;
  const earTwitch = isFleeing
    ? -0.04 // Pinned back during flee
    : isEating
    ? Math.sin(phase * Math.PI * 6) * 0.015
    : phase < 0.35
    ? Math.sin((phase / 0.35) * Math.PI * 2) * 0.015
    : Math.sin(phase * Math.PI * 4) * 0.006;

  const hurtShake = isHurt ? Math.sin(phase * Math.PI * 8) * 0.03 : 0;

  w.shadow(0.18, 0.18, 0.64, 0.64, 0.22);

  if (facing === 1) {
    // ── South: Facing Camera ──
    // Fluffy tail at north
    w.box(0.42, 0.14, 0.16, 0.16, { color: 0xffffffff, h: 0.18, z: 0.20 + hop + hurtShake });

    // Hind haunches & feet
    w.box(0.18, 0.30, 0.20, 0.32, { color: RABBIT, h: 0.28, z: 0 });
    w.box(0.62, 0.30, 0.20, 0.32, { color: RABBIT, h: 0.28, z: 0 });

    // Body & chest
    w.box(0.24, 0.22, 0.52, 0.54, { color: RABBIT, h: 0.46, z: 0.12 + hop + hurtShake });
    w.box(0.30, 0.48, 0.40, 0.24, { color: 0xffffffff, h: 0.30, z: 0.18 + hop + hurtShake });

    // Front paws (tucked to mouth when eating)
    const pawZ = isEating ? 0.38 + hop : hop * 0.5;
    const pawY = isEating ? 0.62 : 0.56;
    w.box(0.28, pawY, 0.14, 0.16, { color: RABBIT, h: 0.16, z: pawZ });
    w.box(0.58, pawY, 0.14, 0.16, { color: RABBIT, h: 0.16, z: pawZ });

    // Head, ears, snout (chewing motion when eating)
    const headZ = 0.50 + hop + chewNibble + hurtShake;
    w.box(0.30, 0.42, 0.40, 0.38, { color: RABBIT, h: 0.36, z: headZ });
    w.box(0.38, 0.68, 0.24, 0.14, { color: 0xffffffff, h: 0.16, z: headZ + 0.04 });
    w.box(0.46, 0.78, 0.08, 0.04, { color: RABBIT_EAR, h: 0.06, z: headZ + 0.12 });

    // Eyes
    w.box(0.28, 0.54, 0.04, 0.08, { color: 0x1c2833ff, h: 0.08, z: headZ + 0.18 });
    w.box(0.68, 0.54, 0.04, 0.08, { color: 0x1c2833ff, h: 0.08, z: headZ + 0.18 });

    // Ears
    w.post(0.36 + earTwitch, 0.38 - (isFleeing ? 0.12 : 0), headZ + 0.34, 0.48, RABBIT, 0.05);
    w.post(0.36 + earTwitch, 0.40 - (isFleeing ? 0.12 : 0), headZ + 0.36, 0.38, RABBIT_EAR, 0.03);
    w.post(0.60 - earTwitch, 0.38 - (isFleeing ? 0.12 : 0), headZ + 0.34, 0.48, RABBIT, 0.05);
    w.post(0.60 - earTwitch, 0.40 - (isFleeing ? 0.12 : 0), headZ + 0.36, 0.38, RABBIT_EAR, 0.03);

  } else if (facing === 0) {
    // ── North: Facing Away ──
    const headZ = 0.50 + hop + hurtShake;
    w.box(0.30, 0.20, 0.40, 0.38, { color: RABBIT, h: 0.36, z: headZ });
    w.post(0.36 + earTwitch, 0.22, headZ + 0.34, 0.48, RABBIT, 0.05);
    w.post(0.60 - earTwitch, 0.22, headZ + 0.34, 0.48, RABBIT, 0.05);

    w.box(0.24, 0.24, 0.52, 0.54, { color: RABBIT, h: 0.46, z: 0.12 + hop + hurtShake });
    w.box(0.18, 0.38, 0.20, 0.32, { color: RABBIT, h: 0.28, z: 0 });
    w.box(0.62, 0.38, 0.20, 0.32, { color: RABBIT, h: 0.28, z: 0 });

    w.box(0.42, 0.70, 0.16, 0.16, { color: 0xffffffff, h: 0.18, z: 0.20 + hop + hurtShake });

  } else if (facing === 2) {
    // ── East: Facing +gx ──
    const headZ = 0.50 + hop + chewNibble + hurtShake;
    w.box(0.14, 0.42, 0.16, 0.16, { color: 0xffffffff, h: 0.18, z: 0.20 + hop });
    w.box(0.20, 0.30, 0.28, 0.40, { color: RABBIT, h: 0.28, z: 0 });
    w.box(0.22, 0.24, 0.56, 0.52, { color: RABBIT, h: 0.46, z: 0.12 + hop });
    w.box(0.46, 0.30, 0.38, 0.40, { color: RABBIT, h: 0.36, z: headZ });
    w.box(0.72, 0.38, 0.16, 0.24, { color: 0xffffffff, h: 0.16, z: headZ + 0.04 });
    w.post(0.42 + earTwitch, 0.36, headZ + 0.34, 0.48, RABBIT, 0.05);
    w.post(0.42 + earTwitch, 0.56, headZ + 0.34, 0.48, RABBIT, 0.05);

  } else {
    // ── West: Facing -gx ──
    const headZ = 0.50 + hop + chewNibble + hurtShake;
    w.box(0.70, 0.42, 0.16, 0.16, { color: 0xffffffff, h: 0.18, z: 0.20 + hop });
    w.box(0.52, 0.30, 0.28, 0.40, { color: RABBIT, h: 0.28, z: 0 });
    w.box(0.22, 0.24, 0.56, 0.52, { color: RABBIT, h: 0.46, z: 0.12 + hop });
    w.box(0.16, 0.30, 0.38, 0.40, { color: RABBIT, h: 0.36, z: headZ });
    w.box(0.12, 0.38, 0.16, 0.24, { color: 0xffffffff, h: 0.16, z: headZ + 0.04 });
    w.post(0.54 - earTwitch, 0.36, headZ + 0.34, 0.48, RABBIT, 0.05);
    w.post(0.54 - earTwitch, 0.56, headZ + 0.34, 0.48, RABBIT, 0.05);
  }
};

export const RABBIT_SPRITE: SpriteDef = defineSprite({
  id: 'rabbit', w: 1, d: 1, massing: rabbitMassing,
});

// ── 2. Fox (Sleek Red Fox with Predatory Pounce Leap & Bushy Tail Sway) ──────────

const foxMassing: Massing = (w, v, _rng) => {
  const facing = v.flags & 3;
  const stateCode = (v.flags >> 3) & 7;
  const isHurt = ((v.flags >> 7) & 1) !== 0;

  const phase = ((v.level % 1000) / 1000);
  const isPouncing = stateCode === 3 || stateCode === 4; // Chase or Attack
  const isEating = stateCode === 5 || stateCode === 6;

  // @tier-b — quadruped trot, pounce leap arch, and tail sway
  const pounceSin = isPouncing ? Math.sin(phase * Math.PI) : 0;
  const pounceZ = pounceSin * 0.22;
  const legSwing = isPouncing ? pounceSin * 0.12 : Math.sin(phase * Math.PI * 2) * 0.06;
  const tailSway = Math.sin(phase * Math.PI * 2) * (isPouncing ? 0.14 : 0.07);
  const headDip = isEating ? -0.16 + Math.sin(phase * Math.PI * 6) * 0.03 : isPouncing ? pounceSin * 0.12 : 0;

  w.shadow(0.12, 0.12, 0.76, 0.76, 0.26);

  if (facing === 1) {
    // ── South: Facing Camera ──
    // Tail at north (draw first)
    w.box(0.42 + tailSway, 0.06 - (isPouncing ? 0.10 : 0), 0.22, 0.26, { color: FOX, h: 0.24, z: 0.50 + pounceZ });
    w.box(0.44 + tailSway * 1.4, 0.01 - (isPouncing ? 0.10 : 0), 0.18, 0.18, { color: FOX_WHITE, h: 0.18, z: 0.58 + pounceZ });

    // 4 Legs
    w.box(0.20, 0.22 + legSwing, 0.14, 0.16, { color: FOX_DARK, h: 0.36 });
    w.box(0.66, 0.22 - legSwing, 0.14, 0.16, { color: FOX_DARK, h: 0.36 });
    w.box(0.20, 0.62 - legSwing + (isPouncing ? 0.15 : 0), 0.14, 0.16, { color: FOX_DARK, h: 0.36, z: pounceZ * 0.5 });
    w.box(0.66, 0.62 + legSwing + (isPouncing ? 0.15 : 0), 0.14, 0.16, { color: FOX_DARK, h: 0.36, z: pounceZ * 0.5 });

    // Body & white chest
    w.box(0.22, 0.18, 0.56, 0.64, { color: FOX, h: 0.40, z: 0.34 + pounceZ });
    w.box(0.28, 0.44, 0.44, 0.34, { color: FOX_WHITE, h: 0.32, z: 0.36 + pounceZ });

    // Head, muzzle, ears
    const headZ = 0.62 + pounceZ + headDip;
    w.box(0.28, 0.52 + (isPouncing ? 0.10 : 0), 0.44, 0.36, { color: FOX, h: 0.36, z: headZ });
    w.box(0.34, 0.76 + (isPouncing ? 0.10 : 0), 0.32, 0.22, { color: FOX_WHITE, h: 0.18, z: headZ });
    w.box(0.44, 0.92 + (isPouncing ? 0.10 : 0), 0.12, 0.08, { color: FOX_DARK, h: 0.08, z: headZ + 0.08 });
    w.box(0.30, 0.68 + (isPouncing ? 0.10 : 0), 0.05, 0.06, { color: WOLF_EYE, h: 0.06, z: headZ + 0.20 });
    w.box(0.65, 0.68 + (isPouncing ? 0.10 : 0), 0.05, 0.06, { color: WOLF_EYE, h: 0.06, z: headZ + 0.20 });

    w.post(0.30, 0.50 + (isPouncing ? 0.10 : 0), headZ + 0.32, 0.22, FOX_DARK, 0.05);
    w.post(0.31, 0.52 + (isPouncing ? 0.10 : 0), headZ + 0.32, 0.18, FOX_WHITE, 0.03);
    w.post(0.66, 0.50 + (isPouncing ? 0.10 : 0), headZ + 0.32, 0.22, FOX_DARK, 0.05);
    w.post(0.65, 0.52 + (isPouncing ? 0.10 : 0), headZ + 0.32, 0.18, FOX_WHITE, 0.03);

  } else if (facing === 0) {
    // ── North: Facing Away ──
    const headZ = 0.62 + pounceZ + headDip;
    w.box(0.28, 0.12 - (isPouncing ? 0.10 : 0), 0.44, 0.36, { color: FOX, h: 0.36, z: headZ });
    w.post(0.30, 0.20 - (isPouncing ? 0.10 : 0), headZ + 0.32, 0.22, FOX_DARK, 0.05);
    w.post(0.66, 0.20 - (isPouncing ? 0.10 : 0), headZ + 0.32, 0.22, FOX_DARK, 0.05);

    w.box(0.20, 0.22 - legSwing, 0.14, 0.16, { color: FOX_DARK, h: 0.36 });
    w.box(0.66, 0.22 + legSwing, 0.14, 0.16, { color: FOX_DARK, h: 0.36 });
    w.box(0.20, 0.62 + legSwing, 0.14, 0.16, { color: FOX_DARK, h: 0.36 });
    w.box(0.66, 0.62 - legSwing, 0.14, 0.16, { color: FOX_DARK, h: 0.36 });

    w.box(0.22, 0.18, 0.56, 0.64, { color: FOX, h: 0.40, z: 0.34 + pounceZ });

    w.box(0.42 + tailSway, 0.68, 0.22, 0.26, { color: FOX, h: 0.24, z: 0.50 + pounceZ });
    w.box(0.44 + tailSway * 1.4, 0.82, 0.18, 0.18, { color: FOX_WHITE, h: 0.18, z: 0.58 + pounceZ });

  } else if (facing === 2) {
    // ── East: Facing +gx ──
    const headZ = 0.62 + pounceZ + headDip;
    w.box(0.06, 0.42 + tailSway, 0.26, 0.22, { color: FOX, h: 0.24, z: 0.50 + pounceZ });
    w.box(0.01, 0.44 + tailSway * 1.4, 0.18, 0.18, { color: FOX_WHITE, h: 0.18, z: 0.58 + pounceZ });

    w.box(0.22 + legSwing, 0.20, 0.16, 0.14, { color: FOX_DARK, h: 0.36 });
    w.box(0.22 - legSwing, 0.66, 0.16, 0.14, { color: FOX_DARK, h: 0.36 });
    w.box(0.62 - legSwing, 0.20, 0.16, 0.14, { color: FOX_DARK, h: 0.36 });
    w.box(0.62 + legSwing, 0.66, 0.16, 0.14, { color: FOX_DARK, h: 0.36 });

    w.box(0.18, 0.22, 0.64, 0.56, { color: FOX, h: 0.40, z: 0.34 + pounceZ });
    w.box(0.44, 0.28, 0.34, 0.44, { color: FOX_WHITE, h: 0.32, z: 0.36 + pounceZ });

    w.box(0.52 + (isPouncing ? 0.10 : 0), 0.28, 0.36, 0.44, { color: FOX, h: 0.36, z: headZ });
    w.box(0.76 + (isPouncing ? 0.10 : 0), 0.34, 0.22, 0.32, { color: FOX_WHITE, h: 0.18, z: headZ });
    w.box(0.92 + (isPouncing ? 0.10 : 0), 0.44, 0.08, 0.12, { color: FOX_DARK, h: 0.08, z: headZ + 0.08 });
    w.post(0.50 + (isPouncing ? 0.10 : 0), 0.30, headZ + 0.32, 0.22, FOX_DARK, 0.05);
    w.post(0.50 + (isPouncing ? 0.10 : 0), 0.66, headZ + 0.32, 0.22, FOX_DARK, 0.05);

  } else {
    // ── West: Facing -gx ──
    const headZ = 0.62 + pounceZ + headDip;
    w.box(0.68, 0.42 + tailSway, 0.26, 0.22, { color: FOX, h: 0.24, z: 0.50 + pounceZ });
    w.box(0.82, 0.44 + tailSway * 1.4, 0.18, 0.18, { color: FOX_WHITE, h: 0.18, z: 0.58 + pounceZ });

    w.box(0.22 - legSwing, 0.20, 0.16, 0.14, { color: FOX_DARK, h: 0.36 });
    w.box(0.22 + legSwing, 0.66, 0.16, 0.14, { color: FOX_DARK, h: 0.36 });
    w.box(0.62 + legSwing, 0.20, 0.16, 0.14, { color: FOX_DARK, h: 0.36 });
    w.box(0.62 - legSwing, 0.66, 0.16, 0.14, { color: FOX_DARK, h: 0.36 });

    w.box(0.18, 0.22, 0.64, 0.56, { color: FOX, h: 0.40, z: 0.34 + pounceZ });

    w.box(0.12 - (isPouncing ? 0.10 : 0), 0.28, 0.36, 0.44, { color: FOX, h: 0.36, z: headZ });
    w.box(0.02 - (isPouncing ? 0.10 : 0), 0.34, 0.22, 0.32, { color: FOX_WHITE, h: 0.18, z: headZ });
    w.box(0.00 - (isPouncing ? 0.10 : 0), 0.44, 0.08, 0.12, { color: FOX_DARK, h: 0.08, z: headZ + 0.08 });
    w.post(0.20 - (isPouncing ? 0.10 : 0), 0.30, headZ + 0.32, 0.22, FOX_DARK, 0.05);
    w.post(0.20 - (isPouncing ? 0.10 : 0), 0.66, headZ + 0.32, 0.22, FOX_DARK, 0.05);
  }
};

export const FOX_SPRITE: SpriteDef = defineSprite({
  id: 'fox', w: 1, d: 1, massing: foxMassing,
});

// ── 3. Deer (Majestic Antlered Forest Stag with Grazing & High Bounding Gallop) ──

const deerMassing: Massing = (w, v, _rng) => {
  const facing = v.flags & 3;
  const stateCode = (v.flags >> 3) & 7;
  const phase = ((v.level % 1000) / 1000);

  const isGrazing = stateCode === 5 || stateCode === 6;
  const isFleeing = stateCode === 2;

  // @tier-b — graceful trotting stride or deep grazing head bend
  const legSwing = Math.sin(phase * Math.PI * 2) * (isFleeing ? 0.14 : 0.07);
  const grazeBend = isGrazing ? 0.55 : 0;
  const grazeBob = isGrazing ? Math.sin(phase * Math.PI * 4) * 0.04 : 0;
  const headBob = (Math.sin(phase * Math.PI * 2) * 0.02) - grazeBend + grazeBob;

  w.shadow(0.12, 0.12, 0.76, 0.76, 0.28);

  if (facing === 1) {
    // ── South: Facing Camera ──
    // Tail at north (raised high when fleeing)
    const tailZ = isFleeing ? 1.25 : 1.05;
    w.box(0.42, 0.12, 0.16, 0.14, { color: DEER_BELLY, h: 0.20, z: tailZ });

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

    // Long arching neck & head (bends low to graze grass)
    const neckZ = 1.10 + headBob * 0.6;
    const hZ = 1.65 + headBob;
    const neckY = 0.54 + (isGrazing ? 0.14 : 0);
    const headY = 0.58 + (isGrazing ? 0.20 : 0);

    w.box(0.32, neckY, 0.36, 0.32, { color: DEER, h: 0.65, z: neckZ });
    w.box(0.30, headY, 0.40, 0.36, { color: DEER, h: 0.36, z: hZ });
    w.box(0.36, headY + 0.24, 0.28, 0.18, { color: DEER_BELLY, h: 0.20, z: hZ + 0.03 });
    w.box(0.42, headY + 0.36, 0.16, 0.08, { color: 0x1c2833ff, h: 0.10, z: hZ + 0.11 });

    // Eyes & Ears
    w.box(0.28, headY + 0.14, 0.04, 0.08, { color: 0x1c2833ff, h: 0.08, z: hZ + 0.19 });
    w.box(0.68, headY + 0.14, 0.04, 0.08, { color: 0x1c2833ff, h: 0.08, z: hZ + 0.19 });
    w.box(0.20, headY - 0.06, 0.12, 0.12, { color: DEER, h: 0.18, z: hZ + 0.30 });
    w.box(0.68, headY - 0.06, 0.12, 0.12, { color: DEER, h: 0.18, z: hZ + 0.30 });

    // Antlers
    w.post(0.32, headY - 0.02, hZ + 0.33, 0.85, ANTLER_BONE, 0.04);
    w.post(0.68, headY - 0.02, hZ + 0.33, 0.85, ANTLER_BONE, 0.04);
    w.post(0.30, headY + 0.14, hZ + 0.60, 0.35, ANTLER_BONE, 0.03);
    w.post(0.70, headY + 0.14, hZ + 0.60, 0.35, ANTLER_BONE, 0.03);

  } else if (facing === 0) {
    // ── North: Facing Away ──
    const hZ = 1.65 + headBob;
    w.box(0.32, 0.14, 0.36, 0.32, { color: DEER, h: 0.65, z: 1.10 + headBob * 0.6 });
    w.box(0.30, 0.08, 0.40, 0.36, { color: DEER, h: 0.36, z: hZ });
    w.post(0.32, 0.16, hZ + 0.33, 0.85, ANTLER_BONE, 0.04);
    w.post(0.68, 0.16, hZ + 0.33, 0.85, ANTLER_BONE, 0.04);

    w.box(0.22, 0.20 - legSwing, 0.14, 0.16, { color: DEER, h: 0.72 });
    w.box(0.64, 0.20 + legSwing, 0.14, 0.16, { color: DEER, h: 0.72 });
    w.box(0.22, 0.64 + legSwing, 0.14, 0.16, { color: DEER, h: 0.72 });
    w.box(0.64, 0.64 - legSwing, 0.14, 0.16, { color: DEER, h: 0.72 });
    w.box(0.22, 0.18, 0.56, 0.64, { color: DEER, h: 0.52, z: 0.70 });

    w.box(0.42, 0.74, 0.16, 0.14, { color: DEER_BELLY, h: 0.20, z: isFleeing ? 1.25 : 1.05 });

  } else if (facing === 2) {
    // ── East: Facing +gx ──
    const hZ = 1.65 + headBob;
    const hX = 0.58 + (isGrazing ? 0.15 : 0);
    w.box(0.08, 0.42, 0.14, 0.16, { color: DEER_BELLY, h: 0.20, z: isFleeing ? 1.25 : 1.05 });
    w.box(0.20 + legSwing, 0.22, 0.16, 0.14, { color: DEER, h: 0.72 });
    w.box(0.20 - legSwing, 0.64, 0.16, 0.14, { color: DEER, h: 0.72 });
    w.box(0.64 - legSwing, 0.22, 0.16, 0.14, { color: DEER, h: 0.72 });
    w.box(0.64 + legSwing, 0.64, 0.16, 0.14, { color: DEER, h: 0.72 });

    w.box(0.18, 0.22, 0.64, 0.56, { color: DEER, h: 0.52, z: 0.70 });
    w.box(0.54, 0.32, 0.32, 0.36, { color: DEER, h: 0.65, z: 1.10 + headBob * 0.6 });
    w.box(hX, 0.30, 0.36, 0.40, { color: DEER, h: 0.36, z: hZ });
    w.box(hX + 0.24, 0.36, 0.18, 0.28, { color: DEER_BELLY, h: 0.20, z: hZ + 0.03 });
    w.post(hX - 0.02, 0.32, hZ + 0.33, 0.85, ANTLER_BONE, 0.04);
    w.post(hX - 0.02, 0.68, hZ + 0.33, 0.85, ANTLER_BONE, 0.04);

  } else {
    // ── West: Facing -gx ──
    const hZ = 1.65 + headBob;
    const hX = 0.08 - (isGrazing ? 0.15 : 0);
    w.box(0.74, 0.42, 0.14, 0.16, { color: DEER_BELLY, h: 0.20, z: isFleeing ? 1.25 : 1.05 });
    w.box(0.20 - legSwing, 0.22, 0.16, 0.14, { color: DEER, h: 0.72 });
    w.box(0.20 + legSwing, 0.64, 0.16, 0.14, { color: DEER, h: 0.72 });
    w.box(0.64 + legSwing, 0.22, 0.16, 0.14, { color: DEER, h: 0.72 });
    w.box(0.64 - legSwing, 0.64, 0.16, 0.14, { color: DEER, h: 0.72 });

    w.box(0.18, 0.22, 0.64, 0.56, { color: DEER, h: 0.52, z: 0.70 });
    w.box(0.14, 0.32, 0.32, 0.36, { color: DEER, h: 0.65, z: 1.10 + headBob * 0.6 });
    w.box(hX, 0.30, 0.36, 0.40, { color: DEER, h: 0.36, z: hZ });
    w.box(hX - 0.08, 0.36, 0.18, 0.28, { color: DEER_BELLY, h: 0.20, z: hZ + 0.03 });
    w.post(hX + 0.12, 0.32, hZ + 0.33, 0.85, ANTLER_BONE, 0.04);
    w.post(hX + 0.12, 0.68, hZ + 0.33, 0.85, ANTLER_BONE, 0.04);
  }
};

export const DEER_SPRITE: SpriteDef = defineSprite({
  id: 'deer', w: 1, d: 1, massing: deerMassing,
});

// ── 4. Wolf (Menacing Slate-Grey Apex Stalker with Snapping Fang Bite Lunge) ─────

const wolfMassing: Massing = (w, v, _rng) => {
  const facing = v.flags & 3;
  const stateCode = (v.flags >> 3) & 7;
  const phase = ((v.level % 1000) / 1000);

  const isAttacking = stateCode === 4;
  const isChasing = stateCode === 3;

  // @tier-b — predatory stalk, bite lunge, and aggressive bristling tail
  const biteSin = isAttacking ? Math.sin(phase * Math.PI) : 0;
  const lungeDist = biteSin * 0.38;
  const jawGape = biteSin * 0.24;

  const legSwing = isChasing ? Math.sin(phase * Math.PI * 2) * 0.12 : Math.sin(phase * Math.PI * 2) * 0.07;
  const tailSway = Math.sin(phase * Math.PI * 2) * 0.06;
  const tailZ = (isAttacking || isChasing) ? 0.72 : 0.54;

  w.shadow(0.08, 0.08, 0.84, 0.84, 0.38);

  if (facing === 1) {
    // ── South: Facing Camera ──
    // Tail at north (draw first)
    w.box(0.40 + tailSway, 0.04 - lungeDist * 0.3, 0.20, 0.28, { color: WOLF, h: 0.26, z: tailZ });
    w.box(0.42 + tailSway * 1.4, 0.00 - lungeDist * 0.3, 0.16, 0.16, { color: WOLF_MANE, h: 0.20, z: tailZ - 0.08 });

    // 4 Legs
    w.box(0.18, 0.18 + legSwing, 0.16, 0.18, { color: WOLF, h: 0.48 });
    w.box(0.66, 0.18 - legSwing, 0.16, 0.18, { color: WOLF, h: 0.48 });
    w.box(0.18, 0.64 - legSwing + lungeDist * 0.6, 0.16, 0.18, { color: WOLF, h: 0.48 });
    w.box(0.66, 0.64 + legSwing + lungeDist * 0.6, 0.16, 0.18, { color: WOLF, h: 0.48 });

    // Body & mane
    w.box(0.20, 0.18 + lungeDist * 0.4, 0.60, 0.64, { color: WOLF, h: 0.46, z: 0.46 });
    w.box(0.16, 0.36 + lungeDist * 0.6, 0.68, 0.44, { color: WOLF_MANE, h: 0.54, z: 0.48 });

    // Head, snapping fangs, eyes, ears
    const headY = 0.50 + lungeDist;
    // Lower jaw
    w.box(0.30, headY + 0.12, 0.40, 0.28, { color: WOLF_MANE, h: 0.16, z: 0.60 - jawGape * 0.5 });
    // Upper muzzle
    w.box(0.26, headY, 0.48, 0.38, { color: WOLF, h: 0.36, z: 0.74 + jawGape });
    w.box(0.32, headY + 0.26, 0.36, 0.24, { color: WOLF_MANE, h: 0.22, z: 0.74 + jawGape });
    w.box(0.42, headY + 0.44, 0.16, 0.08, { color: 0x111111ff, h: 0.12, z: 0.82 + jawGape }); // Black nose

    // Red maw and sharp fangs when attacking
    if (isAttacking) {
      w.box(0.32, headY + 0.20, 0.36, 0.20, { color: 0x882222ff, h: 0.12, z: 0.68 });
      // Upper fangs
      w.box(0.32, headY + 0.34, 0.08, 0.08, { color: 0xffffffff, h: 0.16, z: 0.70 + jawGape });
      w.box(0.60, headY + 0.34, 0.08, 0.08, { color: 0xffffffff, h: 0.16, z: 0.70 + jawGape });
      // Lower fangs
      w.box(0.35, headY + 0.30, 0.07, 0.07, { color: 0xffffffff, h: 0.14, z: 0.68 - jawGape * 0.5 });
      w.box(0.58, headY + 0.30, 0.07, 0.07, { color: 0xffffffff, h: 0.14, z: 0.68 - jawGape * 0.5 });
    }

    w.box(0.28, headY + 0.22, 0.06, 0.08, { color: WOLF_EYE, h: 0.08, z: 0.96 + jawGape });
    w.box(0.66, headY + 0.22, 0.06, 0.08, { color: WOLF_EYE, h: 0.08, z: 0.96 + jawGape });

    w.post(0.28, headY - 0.02, 1.10 + jawGape, 0.26, WOLF, 0.06);
    w.post(0.72, headY - 0.02, 1.10 + jawGape, 0.26, WOLF, 0.06);

  } else if (facing === 0) {
    // ── North: Facing Away ──
    const headY = 0.12 - lungeDist * 1.2;
    w.box(0.26, headY, 0.48, 0.38, { color: WOLF, h: 0.40, z: 0.72 });
    w.post(0.28, headY + 0.08, 1.10, 0.26, WOLF, 0.06);
    w.post(0.72, headY + 0.08, 1.10, 0.26, WOLF, 0.06);

    w.box(0.18, 0.18 - legSwing, 0.16, 0.18, { color: WOLF, h: 0.48 });
    w.box(0.66, 0.18 + legSwing, 0.16, 0.18, { color: WOLF, h: 0.48 });
    w.box(0.18, 0.64 + legSwing, 0.16, 0.18, { color: WOLF, h: 0.48 });
    w.box(0.66, 0.64 - legSwing, 0.16, 0.18, { color: WOLF, h: 0.48 });
    w.box(0.20, 0.18 - lungeDist * 0.3, 0.60, 0.64, { color: WOLF, h: 0.46, z: 0.46 });

    w.box(0.40 + tailSway, 0.74 + lungeDist * 0.3, 0.20, 0.28, { color: WOLF, h: 0.26, z: tailZ });

  } else if (facing === 2) {
    // ── East: Facing +gx ──
    const headX = 0.50 + lungeDist;
    w.box(0.04, 0.40 + tailSway, 0.28, 0.20, { color: WOLF, h: 0.26, z: tailZ });
    w.box(0.18 + legSwing, 0.18, 0.18, 0.16, { color: WOLF, h: 0.48 });
    w.box(0.18 - legSwing, 0.66, 0.18, 0.16, { color: WOLF, h: 0.48 });
    w.box(0.64 - legSwing, 0.18, 0.18, 0.16, { color: WOLF, h: 0.48 });
    w.box(0.64 + legSwing, 0.66, 0.16, 0.14, { color: WOLF, h: 0.48 });

    w.box(0.18, 0.20, 0.64, 0.60, { color: WOLF, h: 0.46, z: 0.46 });
    w.box(0.36, 0.16, 0.44, 0.68, { color: WOLF_MANE, h: 0.54, z: 0.48 });

    // Lower jaw
    w.box(headX + 0.10, 0.28, 0.30, 0.44, { color: WOLF_MANE, h: 0.16, z: 0.60 - jawGape * 0.5 });
    // Upper muzzle
    w.box(headX, 0.26, 0.38, 0.48, { color: WOLF, h: 0.36, z: 0.74 + jawGape });
    w.box(headX + 0.26, 0.32, 0.24, 0.36, { color: WOLF_MANE, h: 0.22, z: 0.74 + jawGape });
    w.box(headX + 0.44, 0.42, 0.08, 0.16, { color: 0x111111ff, h: 0.12, z: 0.82 + jawGape });

    if (isAttacking) {
      w.box(headX + 0.15, 0.30, 0.22, 0.40, { color: 0x882222ff, h: 0.12, z: 0.68 });
      w.box(headX + 0.36, 0.32, 0.08, 0.08, { color: 0xffffffff, h: 0.16, z: 0.70 + jawGape });
      w.box(headX + 0.32, 0.34, 0.08, 0.08, { color: 0xffffffff, h: 0.14, z: 0.68 - jawGape * 0.5 });
    }

    w.post(headX - 0.02, 0.28, 1.10 + jawGape, 0.26, WOLF, 0.06);
    w.post(headX - 0.02, 0.72, 1.10 + jawGape, 0.26, WOLF, 0.06);

  } else {
    // ── West: Facing -gx ──
    const headX = 0.12 - lungeDist;
    w.box(0.74, 0.40 + tailSway, 0.28, 0.20, { color: WOLF, h: 0.26, z: tailZ });
    w.box(0.18 - legSwing, 0.18, 0.18, 0.16, { color: WOLF, h: 0.48 });
    w.box(0.18 + legSwing, 0.66, 0.18, 0.16, { color: WOLF, h: 0.48 });
    w.box(0.64 + legSwing, 0.18, 0.18, 0.16, { color: WOLF, h: 0.48 });
    w.box(0.64 - legSwing, 0.66, 0.18, 0.16, { color: WOLF, h: 0.48 });

    w.box(0.18, 0.20, 0.64, 0.60, { color: WOLF, h: 0.46, z: 0.46 });

    // Lower jaw
    w.box(headX - 0.10, 0.28, 0.30, 0.44, { color: WOLF_MANE, h: 0.16, z: 0.60 - jawGape * 0.5 });
    // Upper muzzle
    w.box(headX, 0.26, 0.38, 0.48, { color: WOLF, h: 0.36, z: 0.74 + jawGape });
    w.box(headX - 0.12, 0.32, 0.24, 0.36, { color: WOLF_MANE, h: 0.22, z: 0.74 + jawGape });
    w.box(headX - 0.12, 0.42, 0.08, 0.16, { color: 0x111111ff, h: 0.12, z: 0.82 + jawGape });

    if (isAttacking) {
      w.box(headX - 0.10, 0.30, 0.22, 0.40, { color: 0x882222ff, h: 0.12, z: 0.68 });
      w.box(headX - 0.14, 0.32, 0.08, 0.08, { color: 0xffffffff, h: 0.16, z: 0.70 + jawGape });
      w.box(headX - 0.10, 0.34, 0.08, 0.08, { color: 0xffffffff, h: 0.14, z: 0.68 - jawGape * 0.5 });
    }

    w.post(headX + 0.14, 0.28, 1.10 + jawGape, 0.26, WOLF, 0.06);
    w.post(headX + 0.14, 0.72, 1.10 + jawGape, 0.26, WOLF, 0.06);
  }
};

export const WOLF_SPRITE: SpriteDef = defineSprite({
  id: 'wolf', w: 1, d: 1, massing: wolfMassing,
});

// ── 5. Troll (Massive 2x2 Ancient Moss-Stone Behemoth with 2-Handed Overhead Ground Slam) ──

const trollMassing: Massing = (w, v, _rng) => {
  const facing = v.flags & 3;
  const stateCode = (v.flags >> 3) & 7;
  const isHurt = ((v.flags >> 7) & 1) !== 0;

  const phase = ((v.level % 1000) / 1000);
  const isAttacking = stateCode === 4;

  // @tier-b — a single continuous swing curve: +1 at the windup peak (phase .25), -1 at the
  // ground-impact peak (phase .75), passing back through rest at .5 and 1.0. One sine instead
  // of the old rearUp/slamDown pair — those met at phase .5 with different formulas on each
  // side and popped the club several tenths of a tile in one frame; a single continuous curve
  // cannot do that by construction, wherever the split falls.
  const swing = isAttacking ? Math.sin(phase * Math.PI * 2) : 0;
  // Peaks at 1 for a short window either side of the impact frame (phase ~.75) — this is what
  // drives the dust/rubble burst, not the swing curve directly.
  const impact = isAttacking ? Math.max(0, -swing - 0.5) * 2 : 0;
  // The strike carries a small lunge toward the target. Kept deliberately modest — this writer
  // has no depth buffer, so a weapon is drawn in a fixed place in the paint order (see the club,
  // last, below) and a large lunge would swing it past parts it should sometimes paint behind.
  const lunge = Math.max(0, -swing) * 0.12;

  // @tier-b — idle weight-shift stomp, torso sway, and a hurt-flinch shudder.
  const stompL = isAttacking ? 0 : Math.sin(phase * Math.PI * 2) * 0.07;
  const stompR = -stompL;
  const sway = isAttacking ? 0 : Math.sin(phase * Math.PI * 2) * 0.035;
  const hurtShake = isHurt ? Math.sin(phase * Math.PI * 9) * 0.08 : 0;

  w.shadow(0.06, 0.06, 1.88, 1.88, 0.6);

  // The club: a strapped haft and a spiked stone head, gripped over the right shoulder.
  // Deliberately anchored to the *side* of the body rather than dead-center — a centered grip
  // put the club's head right where the face wants to be at every pose from idle to windup, and
  // there is no depth buffer here to sort it out after the fact; keeping it beside the arm that
  // holds it means it never has reason to cross the face at all. Rest height is chest-level, well
  // under the shoulder/head band, and only the windup carries it up past the head — by design.
  const club = (gripX: number, gripY: number, gripZ: number): void => {
    w.post(gripX, gripY, gripZ - 0.55, 1.00, TROLL_CLUB, 0.105);
    w.box(gripX - 0.19, gripY - 0.09, 0.38, 0.30, { color: TROLL_CLUB_BAND, h: 0.09, z: gripZ + 0.24 });
    w.box(gripX - 0.20, gripY - 0.11, 0.40, 0.34, { color: TROLL_CLUB, h: 0.36, z: gripZ + 0.33 });
    w.post(gripX - 0.11, gripY - 0.02, gripZ + 0.66, 0.20, TROLL_TUSK, 0.045);
    w.post(gripX + 0.11, gripY - 0.02, gripZ + 0.66, 0.20, TROLL_TUSK, 0.045);
    w.post(gripX, gripY + 0.16, gripZ + 0.63, 0.20, TROLL_TUSK, 0.045);
  };

  // Rubble kicked up right at impact — reads the strike as having actually landed.
  const impactBurst = (cx: number, cy: number): void => {
    if (impact < 0.03) return;
    const r = impact;
    w.box(cx - 0.45 * r, cy - 0.20 * r, 0.35 * r + 0.06, 0.22 * r + 0.06, { color: TROLL_DARK, h: 0.05 * r, alpha: r });
    w.box(cx + 0.10, cy - 0.30 * r, 0.30 * r + 0.06, 0.20 * r + 0.06, { color: TROLL_DARK, h: 0.06 * r, alpha: r });
    w.box(cx - 0.10, cy + 0.10, 0.34 * r + 0.06, 0.24 * r + 0.06, { color: 0x8a9478ff, h: 0.04 * r, z: 0.02, alpha: r * 0.85 });
  };

  if (facing === 1) {
    // ── South: Facing Camera — the strike lunges toward +y, the near side, so the club can
    // safely paint last (in front) through the whole swing. ──
    w.box(0.40 + stompL, 0.26, 0.58, 0.62, { color: TROLL, h: 1.15 });
    w.box(0.36 + stompL, 0.74, 0.66, 0.34, { color: TROLL_DARK, h: 0.20 });
    w.box(1.02 + stompR, 0.26, 0.58, 0.62, { color: TROLL, h: 1.15 });
    w.box(0.98 + stompR, 0.74, 0.66, 0.34, { color: TROLL_DARK, h: 0.20 });

    w.box(0.28, 0.70 + lunge, 1.44, 0.28, { color: TROLL_DARK, h: 0.16, z: 0.98 });

    const torsoZ = 0.90 + hurtShake;
    w.box(0.36 + sway, 0.20 + lunge, 1.28, 1.58, { color: TROLL, h: 1.22, z: torsoZ });
    w.box(0.42 + sway, 0.14 + lunge, 1.16, 1.30, { color: TROLL_MOSS, h: 0.40, z: torsoZ + 1.08 });

    const armZ = 0.70 + swing * 0.85 + hurtShake;
    const armY = 0.44 + lunge;
    w.box(0.00 + sway - stompL * 0.4, armY, 0.42, 0.66, { color: TROLL, h: 1.45, z: armZ });
    w.box(-0.04 + sway - stompL * 0.4, armY + 0.42, 0.50, 0.44, { color: TROLL_DARK, h: 0.38, z: armZ - 0.08 });
    w.box(1.58 + sway - stompR * 0.4, armY, 0.42, 0.66, { color: TROLL, h: 1.45, z: armZ });
    w.box(1.54 + sway - stompR * 0.4, armY + 0.42, 0.50, 0.44, { color: TROLL_DARK, h: 0.38, z: armZ - 0.08 });


    const headZ = torsoZ + 1.10 + swing * 0.18;
    w.box(0.52 + sway, 0.60 + lunge * 1.3, 0.96, 0.88, { color: TROLL, h: 1.00, z: headZ });
    w.box(0.46 + sway, 0.94 + lunge * 1.3, 1.08, 0.50, { color: TROLL_MOSS, h: 0.34, z: headZ + 0.82 });
    w.box(0.56 + sway, 0.98 + lunge * 1.3, 0.88, 0.20, { color: TROLL_DARK, h: 0.14, z: headZ + 0.54 });
    w.box(0.66 + sway, 1.40 + lunge * 1.3, 0.16, 0.09, { color: TROLL_EYE, h: 0.15, z: headZ + 0.50 });
    w.box(1.18 + sway, 1.40 + lunge * 1.3, 0.16, 0.09, { color: TROLL_EYE, h: 0.15, z: headZ + 0.50 });
    w.post(0.64 + sway, 1.48 + lunge * 1.3, headZ + 0.14, 0.42, TROLL_TUSK, 0.07);
    w.post(1.26 + sway, 1.48 + lunge * 1.3, headZ + 0.14, 0.42, TROLL_TUSK, 0.07);

    club(1.44 + sway - stompR * 0.4, armY + 0.36, armZ + 0.22);
    impactBurst(0.9, 0.55);

  } else if (facing === 0) {
    // ── North: Facing Away — the strike still lunges toward the world +y the troll is facing,
    // which from behind is the *near* side too (the troll is walking away from us but swinging
    // down in front of its own body), so the club stays safe to draw last here as well. ──
    const torsoZ = 0.90 + hurtShake;
    const headZ = torsoZ + 1.10 + swing * 0.18;
    w.box(0.52 + sway, 0.22 - lunge * 0.6, 0.96, 0.88, { color: TROLL, h: 1.00, z: headZ });
    w.box(0.46 + sway, 0.20 - lunge * 0.6, 1.08, 0.40, { color: TROLL_MOSS, h: 0.34, z: headZ + 0.82 });

    w.box(0.40 + stompL, 0.26, 0.58, 0.62, { color: TROLL, h: 1.15 });
    w.box(1.02 + stompR, 0.26, 0.58, 0.62, { color: TROLL, h: 1.15 });
    w.box(0.36 + stompL, 0.74, 0.66, 0.34, { color: TROLL_DARK, h: 0.20 });
    w.box(0.98 + stompR, 0.74, 0.66, 0.34, { color: TROLL_DARK, h: 0.20 });

    w.box(0.36 + sway, 0.20, 1.28, 1.58, { color: TROLL, h: 1.22, z: torsoZ });
    w.box(0.42 + sway, 0.50, 1.16, 1.10, { color: TROLL_MOSS, h: 0.40, z: torsoZ + 1.08 });


    const armZ = 0.70 + swing * 0.85 + hurtShake;
    const armY = 0.44 + lunge * 0.6;
    w.box(0.00 + sway - stompL * 0.4, armY, 0.42, 0.66, { color: TROLL, h: 1.45, z: armZ });
    w.box(1.58 + sway - stompR * 0.4, armY, 0.42, 0.66, { color: TROLL, h: 1.45, z: armZ });
    w.box(-0.04 + sway - stompL * 0.4, armY - 0.10, 0.50, 0.44, { color: TROLL_DARK, h: 0.38, z: armZ - 0.08 });
    w.box(1.54 + sway - stompR * 0.4, armY - 0.10, 0.50, 0.44, { color: TROLL_DARK, h: 0.38, z: armZ - 0.08 });

    club(1.44 + sway - stompR * 0.4, armY + 0.20, armZ + 0.22);
    impactBurst(0.9, 0.55);

  } else if (facing === 2) {
    // ── East: Facing +gx — the strike lunges toward +x. Screen depth in this projection is
    // driven by (gx + gy), so a swing that also grows +x pushes the club toward camera exactly
    // like the south case; last-drawn stays correct. ──
    w.box(0.26, 0.40 + stompL, 0.62, 0.58, { color: TROLL, h: 1.15 });
    w.box(0.74, 0.36 + stompL, 0.34, 0.66, { color: TROLL_DARK, h: 0.20 });
    w.box(0.26, 1.02 + stompR, 0.62, 0.58, { color: TROLL, h: 1.15 });
    w.box(0.74, 0.98 + stompR, 0.34, 0.66, { color: TROLL_DARK, h: 0.20 });

    const torsoZ = 0.90 + hurtShake;
    w.box(0.20 + lunge, 0.36 + sway, 1.58, 1.28, { color: TROLL, h: 1.22, z: torsoZ });
    w.box(0.14 + lunge, 0.42 + sway, 1.30, 1.16, { color: TROLL_MOSS, h: 0.40, z: torsoZ + 1.08 });

    const armZ = 0.70 + swing * 0.85 + hurtShake;
    const armX = 0.44 + lunge;
    w.box(armX, 0.00 + sway - stompL * 0.4, 0.66, 0.42, { color: TROLL, h: 1.45, z: armZ });
    w.box(armX + 0.42, -0.04 + sway - stompL * 0.4, 0.44, 0.50, { color: TROLL_DARK, h: 0.38, z: armZ - 0.08 });
    w.box(armX, 1.58 + sway - stompR * 0.4, 0.66, 0.42, { color: TROLL, h: 1.45, z: armZ });
    w.box(armX + 0.42, 1.54 + sway - stompR * 0.4, 0.44, 0.50, { color: TROLL_DARK, h: 0.38, z: armZ - 0.08 });


    const headZ = torsoZ + 1.10 + swing * 0.18;
    const headX = 0.60 + lunge * 1.3;
    w.box(headX, 0.52 + sway, 0.88, 0.96, { color: TROLL, h: 1.00, z: headZ });
    w.box(headX + 0.36, 0.46 + sway, 0.50, 1.08, { color: TROLL_MOSS, h: 0.34, z: headZ + 0.82 });
    w.box(headX + 0.36, 0.56 + sway, 0.20, 0.88, { color: TROLL_DARK, h: 0.14, z: headZ + 0.54 });
    w.box(headX + 0.76, 0.66 + sway, 0.09, 0.16, { color: TROLL_EYE, h: 0.15, z: headZ + 0.50 });
    w.box(headX + 0.76, 1.18 + sway, 0.09, 0.16, { color: TROLL_EYE, h: 0.15, z: headZ + 0.50 });
    w.post(headX + 0.82, 0.64 + sway, headZ + 0.14, 0.42, TROLL_TUSK, 0.07);
    w.post(headX + 0.82, 1.26 + sway, headZ + 0.14, 0.42, TROLL_TUSK, 0.07);

    club(armX + 0.42, 1.44 + sway - stompR * 0.4, armZ + 0.22);
    impactBurst(0.55, 0.9);

  } else {
    // ── West: Facing -gx — the strike lunges toward -x, the *far* side by screen depth. To
    // keep the pure-painter's-algorithm renderer honest here the lunge is halved rather than
    // mirrored at full strength, so the club never has to cross in front of geometry it should
    // paint behind; drawing it last stays a safe approximation at this magnitude. ──
    const wl = lunge * 0.5;
    w.box(1.12, 0.40 + stompL, 0.62, 0.58, { color: TROLL, h: 1.15 });
    w.box(0.92, 0.36 + stompL, 0.34, 0.66, { color: TROLL_DARK, h: 0.20 });
    w.box(1.12, 1.02 + stompR, 0.62, 0.58, { color: TROLL, h: 1.15 });
    w.box(0.92, 0.98 + stompR, 0.34, 0.66, { color: TROLL_DARK, h: 0.20 });

    const torsoZ = 0.90 + hurtShake;
    w.box(0.22 - wl, 0.36 + sway, 1.58, 1.28, { color: TROLL, h: 1.22, z: torsoZ });
    w.box(0.56 - wl, 0.42 + sway, 1.30, 1.16, { color: TROLL_MOSS, h: 0.40, z: torsoZ + 1.08 });

    const armZ = 0.70 + swing * 0.85 + hurtShake;
    const armX = 0.90 - wl;
    w.box(armX, 0.00 + sway - stompL * 0.4, 0.66, 0.42, { color: TROLL, h: 1.45, z: armZ });
    w.box(armX - 0.42, -0.04 + sway - stompL * 0.4, 0.44, 0.50, { color: TROLL_DARK, h: 0.38, z: armZ - 0.08 });
    w.box(armX, 1.58 + sway - stompR * 0.4, 0.66, 0.42, { color: TROLL, h: 1.45, z: armZ });
    w.box(armX - 0.42, 1.54 + sway - stompR * 0.4, 0.44, 0.50, { color: TROLL_DARK, h: 0.38, z: armZ - 0.08 });


    const headZ = torsoZ + 1.10 + swing * 0.18;
    const headX = 1.12 - wl * 1.3;
    w.box(headX, 0.52 + sway, 0.88, 0.96, { color: TROLL, h: 1.00, z: headZ });
    w.box(headX - 0.50, 0.46 + sway, 0.50, 1.08, { color: TROLL_MOSS, h: 0.34, z: headZ + 0.82 });
    w.box(headX - 0.20, 0.56 + sway, 0.20, 0.88, { color: TROLL_DARK, h: 0.14, z: headZ + 0.54 });
    w.box(headX - 0.09, 0.66 + sway, 0.09, 0.16, { color: TROLL_EYE, h: 0.15, z: headZ + 0.50 });
    w.box(headX - 0.09, 1.18 + sway, 0.09, 0.16, { color: TROLL_EYE, h: 0.15, z: headZ + 0.50 });
    w.post(headX - 0.14, 0.64 + sway, headZ + 0.14, 0.42, TROLL_TUSK, 0.07);
    w.post(headX - 0.14, 1.26 + sway, headZ + 0.14, 0.42, TROLL_TUSK, 0.07);

    club(armX - 0.42, 1.44 + sway - stompR * 0.4, armZ + 0.22);
    impactBurst(1.35, 0.9);
  }
};

export const TROLL_SPRITE: SpriteDef = defineSprite({
  id: 'troll', w: 2, d: 2, massing: trollMassing,
});

/**
 * Wraps a `SolidWriter` so a massing can be authored at one scale and rendered at another,
 * enlarging every spatial argument (position, size, height) about a pivot point while passing
 * colors and strings through untouched.
 *
 * The bear's massing was written to fill roughly one tile even though its `SpriteDef` declares
 * a 2×2 footprint — "Massive Grizzly" in the doc comment and a creature barely bigger than a fox
 * on screen. Rewriting every coordinate by hand risks introducing exactly the kind of arithmetic
 * slip that shows up as a floating paw three tiles from its shoulder; scaling the writer instead
 * keeps every relative offset (`legSwing`, `rearUp`, …) proportionally intact for free.
 */
function scaledWriter(base: SolidWriter, scale: number, px: number, py: number): SolidWriter {
  const sx = (v: number): number => px + (v - px) * scale;
  const sy = (v: number): number => py + (v - py) * scale;
  const sz = (v: number): number => v * scale;
  const ss = (v: number): number => v * scale;
  return {
    get palette() { return base.palette; },
    tile(gx, gy, fill, stroke, inset = 0, z = 0) {
      base.tile(sx(gx), sy(gy), fill, stroke, ss(inset), sz(z));
    },
    box(gx, gy, bw, bd, opts) {
      base.box(sx(gx), sy(gy), ss(bw), ss(bd), {
        ...opts,
        h: sz(opts.h),
        z: opts.z !== undefined ? sz(opts.z) : opts.z,
        inset: opts.inset !== undefined ? ss(opts.inset) : opts.inset,
      });
    },
    cylinder(gx, gy, radiusTiles, opts) {
      base.cylinder(sx(gx), sy(gy), ss(radiusTiles), {
        ...opts,
        h: sz(opts.h),
        z: opts.z !== undefined ? sz(opts.z) : opts.z,
        inset: opts.inset !== undefined ? ss(opts.inset) : opts.inset,
      });
    },
    roof(gx, gy, rw, rd, z, rise, color, outline) {
      base.roof(sx(gx), sy(gy), ss(rw), ss(rd), sz(z), sz(rise), color, outline);
    },
    patch(gx, gy, pw, pd, z, fill, stroke) {
      base.patch(sx(gx), sy(gy), ss(pw), ss(pd), sz(z), fill, stroke);
    },
    wall(ax, ay, bx, by, z0, z1, fill, stroke) {
      base.wall(sx(ax), sy(ay), sx(bx), sy(by), sz(z0), sz(z1), fill, stroke);
    },
    post(gx, gy, z, h, color, width) {
      base.post(sx(gx), sy(gy), sz(z), sz(h), color, width !== undefined ? ss(width) : width);
    },
    glow(gx, gy, z, color, radius, intensity) {
      base.glow(sx(gx), sy(gy), sz(z), color, radius !== undefined ? ss(radius) : radius, intensity);
    },
    sign(ax, ay, bx, by, ztop, heightLevels, value, color) {
      base.sign(sx(ax), sy(ay), sx(bx), sy(by), sz(ztop), sz(heightLevels), value, color);
    },
    shadow(gx, gy, sw, sd, strength, z = 0) {
      base.shadow(sx(gx), sy(gy), ss(sw), ss(sd), strength, sz(z));
    },
  };
}

// ── 6. Bear (Massive Grizzly with Rearing Maul Swipe & Foraging Snout) ───────────

const bearMassing: Massing = (writer, v, _rng) => {
  const w = scaledWriter(writer, 1.55, 0.68, 0.68);
  const facing = v.flags & 3;
  const stateCode = (v.flags >> 3) & 7;
  const phase = ((v.level % 1000) / 1000);

  const isAttacking = stateCode === 4;
  const isEating = stateCode === 5 || stateCode === 6;

  // @tier-b — rearing up on hind legs for mauling attack or grazing ground
  const maulSin = isAttacking ? Math.sin(phase * Math.PI) : 0;
  const rearUp = maulSin * 0.40;
  const swipe = isAttacking ? Math.sin(phase * Math.PI * 2) * 0.25 : 0;

  const legSwing = Math.sin(phase * Math.PI * 2) * 0.08;
  const headSway = Math.sin(phase * Math.PI * 2) * 0.03 + (isEating ? -0.22 + Math.sin(phase * Math.PI * 6) * 0.03 : 0);

  w.shadow(0.1, 0.1, 1.4, 1.4, 0.45);

  if (facing === 1) {
    // South: Facing camera
    w.box(0.24, 0.24 + legSwing, 0.26, 0.28, { color: BEAR, h: 0.55 + rearUp });
    w.box(0.24, 0.24 + legSwing, 0.26, 0.28, { color: BEAR_CLAW, h: 0.12, z: 0 });
    w.box(0.90, 0.24 - legSwing, 0.26, 0.28, { color: BEAR, h: 0.55 + rearUp });
    w.box(0.90, 0.24 - legSwing, 0.26, 0.28, { color: BEAR_CLAW, h: 0.12, z: 0 });

    // Front paws (raise high during maul attack)
    const fPawZ = isAttacking ? 0.70 + rearUp * 1.5 : 0;
    const fPawY = isAttacking ? 0.88 + maulSin * 0.30 : 0.88 - legSwing;
    w.box(0.24, fPawY, 0.26, 0.28, { color: BEAR, h: 0.55, z: fPawZ });
    w.box(0.24, fPawY, 0.26, 0.28, { color: BEAR_CLAW, h: 0.12, z: fPawZ });
    w.box(0.90, fPawY, 0.26, 0.28, { color: BEAR, h: 0.55, z: fPawZ + swipe });
    w.box(0.90, fPawY, 0.26, 0.28, { color: BEAR_CLAW, h: 0.12, z: fPawZ + swipe });

    // Body & shoulders
    const bodyZ = 0.50 + rearUp;
    w.box(0.26, 0.22, 0.88, 0.96, { color: BEAR, h: 0.70, z: bodyZ });
    w.box(0.32, 0.48, 0.76, 0.58, { color: BEAR, h: 0.85, z: bodyZ + 0.08 });

    // Head, muzzle, ears
    const headZ = 0.85 + rearUp + headSway;
    w.box(0.38, 0.76 + (isAttacking ? 0.15 : 0), 0.64, 0.48, { color: BEAR, h: 0.50, z: headZ });
    w.box(0.48, 1.08 + (isAttacking ? 0.15 : 0), 0.44, 0.28, { color: BEAR_MUZZLE, h: 0.28, z: headZ + 0.03 });
    w.box(0.62, 1.30 + (isAttacking ? 0.15 : 0), 0.16, 0.10, { color: BEAR_NOSE, h: 0.12, z: headZ + 0.13 });

    w.box(0.32, 0.70 + (isAttacking ? 0.15 : 0), 0.18, 0.18, { color: BEAR, h: 0.20, z: headZ + 0.50 });
    w.box(0.90, 0.70 + (isAttacking ? 0.15 : 0), 0.18, 0.18, { color: BEAR, h: 0.20, z: headZ + 0.50 });

  } else if (facing === 0) {
    // North: Facing away
    const bodyZ = 0.50 + rearUp;
    const headZ = 0.85 + rearUp + headSway;
    w.box(0.38, 0.16, 0.64, 0.48, { color: BEAR, h: 0.50, z: headZ });
    w.box(0.32, 0.20, 0.18, 0.18, { color: BEAR, h: 0.20, z: headZ + 0.50 });
    w.box(0.90, 0.20, 0.18, 0.18, { color: BEAR, h: 0.20, z: headZ + 0.50 });

    w.box(0.24, 0.24 - legSwing, 0.26, 0.28, { color: BEAR, h: 0.55 + rearUp });
    w.box(0.90, 0.24 + legSwing, 0.26, 0.28, { color: BEAR, h: 0.55 + rearUp });
    w.box(0.24, 0.88 + legSwing, 0.26, 0.28, { color: BEAR, h: 0.55 });
    w.box(0.90, 0.88 - legSwing, 0.26, 0.28, { color: BEAR, h: 0.55 });

    w.box(0.26, 0.22, 0.88, 0.96, { color: BEAR, h: 0.70, z: bodyZ });
    w.box(0.32, 0.34, 0.76, 0.58, { color: BEAR, h: 0.85, z: bodyZ + 0.08 });

  } else if (facing === 2) {
    // East: Facing +gx
    const bodyZ = 0.50 + rearUp;
    const headZ = 0.85 + rearUp + headSway;
    const hX = 0.76 + (isAttacking ? maulSin * 0.35 : 0);

    w.box(0.24 + legSwing, 0.24, 0.28, 0.26, { color: BEAR, h: 0.55 + rearUp });
    w.box(0.24 - legSwing, 0.90, 0.28, 0.26, { color: BEAR, h: 0.55 + rearUp });
    w.box(0.88 - legSwing, 0.24, 0.28, 0.26, { color: BEAR, h: 0.55 });
    w.box(0.88 + legSwing, 0.90, 0.28, 0.26, { color: BEAR, h: 0.55 });

    w.box(0.22, 0.26, 0.96, 0.88, { color: BEAR, h: 0.70, z: bodyZ });
    w.box(0.48, 0.32, 0.58, 0.76, { color: BEAR, h: 0.85, z: bodyZ + 0.08 });

    w.box(hX, 0.38, 0.48, 0.64, { color: BEAR, h: 0.50, z: headZ });
    w.box(hX + 0.32, 0.48, 0.28, 0.44, { color: BEAR_MUZZLE, h: 0.28, z: headZ + 0.03 });
    w.box(hX + 0.54, 0.62, 0.10, 0.16, { color: BEAR_NOSE, h: 0.12, z: headZ + 0.13 });

  } else {
    // West: Facing -gx
    const bodyZ = 0.50 + rearUp;
    const headZ = 0.85 + rearUp + headSway;
    const hX = 0.16 - (isAttacking ? maulSin * 0.35 : 0);

    w.box(0.24 - legSwing, 0.24, 0.28, 0.26, { color: BEAR, h: 0.55 + rearUp });
    w.box(0.24 + legSwing, 0.90, 0.28, 0.26, { color: BEAR, h: 0.55 + rearUp });
    w.box(0.88 + legSwing, 0.24, 0.28, 0.26, { color: BEAR, h: 0.55 });
    w.box(0.88 - legSwing, 0.90, 0.28, 0.26, { color: BEAR, h: 0.55 });

    w.box(0.22, 0.26, 0.96, 0.88, { color: BEAR, h: 0.70, z: bodyZ });
    w.box(0.34, 0.32, 0.58, 0.76, { color: BEAR, h: 0.85, z: bodyZ + 0.08 });

    w.box(hX, 0.38, 0.48, 0.64, { color: BEAR, h: 0.50, z: headZ });
    w.box(hX - 0.12, 0.48, 0.28, 0.44, { color: BEAR_MUZZLE, h: 0.28, z: headZ + 0.03 });
    w.box(hX - 0.16, 0.62, 0.10, 0.16, { color: BEAR_NOSE, h: 0.12, z: headZ + 0.13 });
  }
};

export const BEAR_SPRITE: SpriteDef = defineSprite({
  id: 'bear', w: 2, d: 2, massing: bearMassing,
});

// ── 7. Wild Boar (Stout Russet Quadruped with Tusk-Headbutt Gore Thrust) ─────────

const boarMassing: Massing = (w, v, _rng) => {
  const facing = v.flags & 3;
  const stateCode = (v.flags >> 3) & 7;
  const phase = ((v.level % 1000) / 1000);

  const isAttacking = stateCode === 4;
  const isEating = stateCode === 5 || stateCode === 6;

  // @tier-b — aggressive tusk headbutt thrust or mud rooting
  const goreSin = isAttacking ? Math.sin(phase * Math.PI) : 0;
  const goreDist = goreSin * 0.26;
  const goreLift = goreSin * 0.16;

  const rootDip = isEating ? -0.15 + Math.sin(phase * Math.PI * 8) * 0.03 : 0;
  const legSwing = Math.sin(phase * Math.PI * 2) * 0.08;

  w.shadow(0.12, 0.12, 0.76, 0.76, 0.32);

  if (facing === 1) {
    // South: Facing Camera
    w.box(0.20, 0.20 + legSwing, 0.16, 0.18, { color: BOAR_MANE, h: 0.38 });
    w.box(0.64, 0.20 - legSwing, 0.16, 0.18, { color: BOAR_MANE, h: 0.38 });
    w.box(0.20, 0.62 - legSwing + goreDist * 0.5, 0.16, 0.18, { color: BOAR_MANE, h: 0.38 });
    w.box(0.64, 0.62 + legSwing + goreDist * 0.5, 0.16, 0.18, { color: BOAR_MANE, h: 0.38 });

    w.box(0.20, 0.18 + goreDist * 0.3, 0.60, 0.64, { color: BOAR, h: 0.48, z: 0.32 });
    w.box(0.38, 0.18 + goreDist * 0.3, 0.24, 0.60, { color: BOAR_MANE, h: 0.18, z: 0.78 });

    const headY = 0.52 + goreDist;
    const headZ = 0.56 + goreLift + rootDip;
    w.box(0.26, headY, 0.48, 0.38, { color: BOAR, h: 0.42, z: headZ });
    w.box(0.32, headY + 0.26, 0.36, 0.22, { color: BOAR_SNOUT, h: 0.26, z: headZ });

    // Tusks thrust up aggressively
    w.post(0.24, headY + 0.30, headZ + 0.06, 0.22 + goreLift, BOAR_TUSK, 0.04);
    w.post(0.76, headY + 0.30, headZ + 0.06, 0.22 + goreLift, BOAR_TUSK, 0.04);

  } else if (facing === 0) {
    // North: Facing Away
    const headY = 0.12 - goreDist;
    const headZ = 0.56 + goreLift + rootDip;
    w.box(0.26, headY, 0.48, 0.38, { color: BOAR, h: 0.42, z: headZ });
    w.box(0.20, 0.20 - legSwing, 0.16, 0.18, { color: BOAR_MANE, h: 0.38 });
    w.box(0.64, 0.20 + legSwing, 0.16, 0.18, { color: BOAR_MANE, h: 0.38 });
    w.box(0.20, 0.62 + legSwing, 0.16, 0.18, { color: BOAR_MANE, h: 0.38 });
    w.box(0.64, 0.62 - legSwing, 0.16, 0.18, { color: BOAR_MANE, h: 0.38 });
    w.box(0.20, 0.18, 0.60, 0.64, { color: BOAR, h: 0.48, z: 0.32 });
    w.box(0.38, 0.22, 0.24, 0.60, { color: BOAR_MANE, h: 0.18, z: 0.78 });

  } else if (facing === 2) {
    // East: Facing +gx
    const headX = 0.50 + goreDist;
    const headZ = 0.56 + goreLift + rootDip;
    w.box(0.20 + legSwing, 0.20, 0.18, 0.16, { color: BOAR_MANE, h: 0.38 });
    w.box(0.20 - legSwing, 0.64, 0.18, 0.16, { color: BOAR_MANE, h: 0.38 });
    w.box(0.62 - legSwing, 0.20, 0.18, 0.16, { color: BOAR_MANE, h: 0.38 });
    w.box(0.62 + legSwing, 0.64, 0.18, 0.16, { color: BOAR_MANE, h: 0.38 });

    w.box(0.18, 0.20, 0.64, 0.60, { color: BOAR, h: 0.48, z: 0.32 });
    w.box(headX, 0.26, 0.38, 0.48, { color: BOAR, h: 0.42, z: headZ });
    w.box(headX + 0.26, 0.32, 0.22, 0.36, { color: BOAR_SNOUT, h: 0.26, z: headZ });
    w.post(headX + 0.32, 0.24, headZ + 0.06, 0.22 + goreLift, BOAR_TUSK, 0.04);
    w.post(headX + 0.32, 0.76, headZ + 0.06, 0.22 + goreLift, BOAR_TUSK, 0.04);

  } else {
    // West: Facing -gx
    const headX = 0.12 - goreDist;
    const headZ = 0.56 + goreLift + rootDip;
    w.box(0.20 - legSwing, 0.20, 0.18, 0.16, { color: BOAR_MANE, h: 0.38 });
    w.box(0.20 + legSwing, 0.64, 0.18, 0.16, { color: BOAR_MANE, h: 0.38 });
    w.box(0.62 + legSwing, 0.20, 0.18, 0.16, { color: BOAR_MANE, h: 0.38 });
    w.box(0.62 - legSwing, 0.64, 0.18, 0.16, { color: BOAR_MANE, h: 0.38 });

    w.box(0.18, 0.20, 0.64, 0.60, { color: BOAR, h: 0.48, z: 0.32 });
    w.box(headX, 0.26, 0.38, 0.48, { color: BOAR, h: 0.42, z: headZ });
    w.box(headX - 0.10, 0.32, 0.22, 0.36, { color: BOAR_SNOUT, h: 0.26, z: headZ });
    w.post(headX + 0.06, 0.24, headZ + 0.06, 0.22 + goreLift, BOAR_TUSK, 0.04);
    w.post(headX + 0.06, 0.76, headZ + 0.06, 0.22 + goreLift, BOAR_TUSK, 0.04);
  }
};

export const BOAR_SPRITE: SpriteDef = defineSprite({
  id: 'boar', w: 1, d: 1, massing: boarMassing,
});

// ── 8. Marsh Crocodile (Armored Aquatic Reptile with Explosive Gaping Jaw Snap) ──

const crocMassing: Massing = (w, v, _rng) => {
  const facing = v.flags & 3;
  const stateCode = (v.flags >> 3) & 7;
  const phase = ((v.level % 1000) / 1000);

  const isAttacking = stateCode === 4;

  // @tier-b — sinuous swimming tail sway and an explosive lunging jaw snap
  const snapSin = isAttacking ? Math.sin(phase * Math.PI) : 0;
  const lunge = snapSin * 0.42;
  const gape = snapSin * 0.20;
  // An ambush predator holds still between strikes — the tail keeps a slow submerged sway even
  // at rest, but the legs stay planted rather than trotting, unlike the pack/herd animals.
  const tailSway = Math.sin(phase * Math.PI * 2) * (isAttacking ? 0.22 : 0.10);

  // Slimmer than the first pass — a crocodile reads as a sleek ambush predator only when it is
  // much longer than it is wide. Body/tail/head all narrow to about three-fifths of their old
  // cross-section here, and the legs pull in to hug that narrower body, while every length-wise
  // (nose-to-tail) measurement is untouched.
  w.shadow(0.42, 0.08, 1.16, 1.86, 0.5);

  // Two eye bumps and a nostril ridge on top of the skull — real crocodilians float with only
  // these breaking the surface, and it is what makes the head silhouette read as croc rather
  // than as a generic lizard. `skullX/Y` is the near-top-left corner of the flat skull slab.
  const head = (skullX: number, skullY: number, alongX: boolean): void => {
    const jawZ = 0.16 - gape * 0.55;
    const snoutZ = 0.24 + gape;
    if (alongX) {
      w.box(skullX, skullY, 0.52, 0.62, { color: CROC, h: 0.16, z: jawZ });
      w.box(skullX + 0.36, skullY + 0.04, 0.44, 0.55, { color: CROC, h: 0.42, z: snoutZ });
      w.box(skullX + 0.46, skullY + 0.12, 0.20, 0.14, { color: CROC_RIDGE, h: 0.13, z: snoutZ + 0.42 });
      w.box(skullX + 0.50, skullY + 0.16, 0.11, 0.07, { color: CROC_EYE, h: 0.08, z: snoutZ + 0.55 });
      w.box(skullX + 0.46, skullY + 0.38, 0.20, 0.14, { color: CROC_RIDGE, h: 0.13, z: snoutZ + 0.42 });
      w.box(skullX + 0.50, skullY + 0.42, 0.11, 0.07, { color: CROC_EYE, h: 0.08, z: snoutZ + 0.55 });
      w.box(skullX + 0.72, skullY + 0.25, 0.16, 0.12, { color: CROC_RIDGE, h: 0.07, z: snoutZ + 0.36 });
      w.post(skullX + 0.06, skullY + 0.09, jawZ + 0.10, 0.11, CROC_TOOTH, 0.035);
      w.post(skullX + 0.06, skullY + 0.47, jawZ + 0.10, 0.11, CROC_TOOTH, 0.035);
      w.post(skullX + 0.30, skullY + 0.14, snoutZ + 0.34, 0.13, CROC_TOOTH, 0.035);
      w.post(skullX + 0.30, skullY + 0.42, snoutZ + 0.34, 0.13, CROC_TOOTH, 0.035);
    } else {
      w.box(skullX, skullY, 0.62, 0.52, { color: CROC, h: 0.16, z: jawZ });
      w.box(skullX + 0.04, skullY + 0.36, 0.55, 0.44, { color: CROC, h: 0.42, z: snoutZ });
      w.box(skullX + 0.12, skullY + 0.46, 0.14, 0.20, { color: CROC_RIDGE, h: 0.13, z: snoutZ + 0.42 });
      w.box(skullX + 0.16, skullY + 0.50, 0.07, 0.11, { color: CROC_EYE, h: 0.08, z: snoutZ + 0.55 });
      w.box(skullX + 0.38, skullY + 0.46, 0.14, 0.20, { color: CROC_RIDGE, h: 0.13, z: snoutZ + 0.42 });
      w.box(skullX + 0.42, skullY + 0.50, 0.07, 0.11, { color: CROC_EYE, h: 0.08, z: snoutZ + 0.55 });
      w.box(skullX + 0.25, skullY + 0.72, 0.12, 0.16, { color: CROC_RIDGE, h: 0.07, z: snoutZ + 0.36 });
      w.post(skullX + 0.09, skullY + 0.06, jawZ + 0.10, 0.11, CROC_TOOTH, 0.035);
      w.post(skullX + 0.47, skullY + 0.06, jawZ + 0.10, 0.11, CROC_TOOTH, 0.035);
      w.post(skullX + 0.14, skullY + 0.30, snoutZ + 0.34, 0.13, CROC_TOOTH, 0.035);
      w.post(skullX + 0.42, skullY + 0.30, snoutZ + 0.34, 0.13, CROC_TOOTH, 0.035);
    }
  };

  if (facing === 1) {
    // ── South: Facing Camera — tail far (low y), head near (high y). ──
    w.box(0.92 + tailSway * 1.4, 0.02, 0.16, 0.20, { color: CROC, h: 0.13, z: 0.05 });
    w.box(0.84 + tailSway, 0.10, 0.32, 0.34, { color: CROC, h: 0.19, z: 0.04 });
    w.box(0.92 + tailSway, 0.14, 0.16, 0.24, { color: CROC_RIDGE, h: 0.09, z: 0.22 });

    w.box(0.50, 0.38, 0.24, 0.32, { color: CROC, h: 0.24 });
    w.box(1.26, 0.38, 0.24, 0.32, { color: CROC, h: 0.24 });

    w.box(0.68, 0.40 + lunge * 0.35, 0.64, 0.85, { color: CROC, h: 0.56, z: 0.10 });
    w.box(0.92, 0.46 + lunge * 0.35, 0.16, 0.22, { color: CROC_RIDGE, h: 0.15, z: 0.66 });
    w.box(0.92, 0.70 + lunge * 0.35, 0.16, 0.22, { color: CROC_RIDGE, h: 0.19, z: 0.66 });
    w.box(0.92, 0.94 + lunge * 0.35, 0.16, 0.22, { color: CROC_RIDGE, h: 0.15, z: 0.66 });

    w.box(0.50, 1.06 + lunge * 0.3, 0.24, 0.32, { color: CROC, h: 0.24 });
    w.box(1.26, 1.06 + lunge * 0.3, 0.24, 0.32, { color: CROC, h: 0.24 });

    head(0.69, 1.20 + lunge, false);

  } else if (facing === 0) {
    // ── North: Facing Away — head far (low y), tail near (high y). ──
    head(0.69, 0.02 - lunge * 0.6, false);

    w.box(0.50, 0.38, 0.24, 0.32, { color: CROC, h: 0.24 });
    w.box(1.26, 0.38, 0.24, 0.32, { color: CROC, h: 0.24 });

    w.box(0.68, 0.74, 0.64, 0.85, { color: CROC, h: 0.56, z: 0.10 });
    w.box(0.92, 0.80, 0.16, 0.22, { color: CROC_RIDGE, h: 0.15, z: 0.66 });
    w.box(0.92, 1.04, 0.16, 0.22, { color: CROC_RIDGE, h: 0.19, z: 0.66 });
    w.box(0.92, 1.28, 0.16, 0.22, { color: CROC_RIDGE, h: 0.15, z: 0.66 });

    w.box(0.50, 1.30, 0.24, 0.32, { color: CROC, h: 0.24 });
    w.box(1.26, 1.30, 0.24, 0.32, { color: CROC, h: 0.24 });

    w.box(0.84 + tailSway, 1.56, 0.32, 0.34, { color: CROC, h: 0.19, z: 0.04 });
    w.box(0.92 + tailSway, 1.62, 0.16, 0.24, { color: CROC_RIDGE, h: 0.09, z: 0.22 });
    w.box(0.92 + tailSway * 1.4, 1.78, 0.16, 0.20, { color: CROC, h: 0.13, z: 0.05 });

  } else if (facing === 2) {
    // ── East: Facing +gx — tail far (low x), head near (high x). ──
    w.box(0.02, 0.92 + tailSway * 1.4, 0.20, 0.16, { color: CROC, h: 0.13, z: 0.05 });
    w.box(0.10, 0.84 + tailSway, 0.34, 0.32, { color: CROC, h: 0.19, z: 0.04 });
    w.box(0.14, 0.92 + tailSway, 0.24, 0.16, { color: CROC_RIDGE, h: 0.09, z: 0.22 });

    w.box(0.38, 0.50, 0.32, 0.24, { color: CROC, h: 0.24 });
    w.box(0.38, 1.26, 0.32, 0.24, { color: CROC, h: 0.24 });

    w.box(0.40 + lunge * 0.35, 0.68, 0.85, 0.64, { color: CROC, h: 0.56, z: 0.10 });
    w.box(0.46 + lunge * 0.35, 0.92, 0.22, 0.16, { color: CROC_RIDGE, h: 0.15, z: 0.66 });
    w.box(0.70 + lunge * 0.35, 0.92, 0.22, 0.16, { color: CROC_RIDGE, h: 0.19, z: 0.66 });
    w.box(0.94 + lunge * 0.35, 0.92, 0.22, 0.16, { color: CROC_RIDGE, h: 0.15, z: 0.66 });

    w.box(1.06 + lunge * 0.3, 0.50, 0.32, 0.24, { color: CROC, h: 0.24 });
    w.box(1.06 + lunge * 0.3, 1.26, 0.32, 0.24, { color: CROC, h: 0.24 });

    head(1.20 + lunge, 0.69, true);

  } else {
    // ── West: Facing -gx — tail far (high x), head near (low x). ──
    head(0.32 - lunge, 0.69, true);

    w.box(1.50, 0.50, 0.32, 0.24, { color: CROC, h: 0.24 });
    w.box(1.50, 1.26, 0.32, 0.24, { color: CROC, h: 0.24 });

    w.box(0.75, 0.68, 0.85, 0.64, { color: CROC, h: 0.56, z: 0.10 });
    w.box(0.86, 0.92, 0.22, 0.16, { color: CROC_RIDGE, h: 0.15, z: 0.66 });
    w.box(1.10, 0.92, 0.22, 0.16, { color: CROC_RIDGE, h: 0.19, z: 0.66 });
    w.box(1.34, 0.92, 0.22, 0.16, { color: CROC_RIDGE, h: 0.15, z: 0.66 });

    w.box(0.82, 0.50, 0.32, 0.24, { color: CROC, h: 0.24 });
    w.box(0.82, 1.26, 0.32, 0.24, { color: CROC, h: 0.24 });

    w.box(1.56 + tailSway, 0.84 + tailSway, 0.34, 0.32, { color: CROC, h: 0.19, z: 0.04 });
    w.box(1.62 + tailSway, 0.92 + tailSway, 0.24, 0.16, { color: CROC_RIDGE, h: 0.09, z: 0.22 });
    w.box(1.78 + tailSway * 1.4, 0.92 + tailSway, 0.20, 0.16, { color: CROC, h: 0.13, z: 0.05 });
  }
};

export const CROC_SPRITE: SpriteDef = defineSprite({
  id: 'croc', w: 2, d: 2, massing: crocMassing,
});

// ── 9. Shade (Conjured Spectral Wraith — Levitating, No Legs, Glowing Eyes) ────

/** A hostile wraith conjured by the wizard tower (see `missions.ts`). Legless by design — it
 *  levitates rather than walks, so unlike every quadruped/biped above it needs no stride-cycle
 *  leg geometry, only a bob. Silhouette stays a hooded robe on every facing (a ghost reads as
 *  itself from any angle); only the glowing eyes and the attack lunge are facing-dependent,
 *  which is enough directional signal without four hand-authored body poses for a minion this
 *  small and short-lived. */
const shadeMassing: Massing = (w, v, _rng) => {
  const facing = v.flags & 3;
  const stateCode = (v.flags >> 3) & 7;
  const isHurt = ((v.flags >> 7) & 1) !== 0;
  const isAttacking = stateCode === 4;
  const isChasing = stateCode === 3 || isAttacking;

  const phase = ((v.level % 1000) / 1000);

  // @tier-b — levitation bob, tattered-hem sway, strike lunge, hurt shudder
  const bob = Math.sin(phase * Math.PI * 2) * (isChasing ? 0.05 : 0.09);
  const hemSway = Math.sin(phase * Math.PI * 2 + 1.3) * 0.05;
  const lunge = isAttacking ? Math.sin(phase * Math.PI) * 0.16 : 0;
  const hurtShake = isHurt ? Math.sin(phase * Math.PI * 10) * 0.06 : 0;
  const z = 0.16 + bob;

  let lx = 0;
  let ly = 0;
  if (facing === 1) ly = lunge; else if (facing === 0) ly = -lunge; else if (facing === 2) lx = lunge; else lx = -lunge;

  w.shadow(0.24, 0.24, 0.52, 0.52, 0.14 + Math.abs(bob) * 0.4);

  // Wispy trailing hem beneath the robe, in place of legs — a couple of shrinking, fading boxes
  w.box(0.40 + lx - hemSway, 0.40 + ly - hemSway * 0.5, 0.20, 0.20, { color: SHADE_ROBE, h: 0.12, z: z - 0.10, outline: false, alpha: 0.4 });
  w.box(0.44 + lx + hemSway, 0.44 + ly + hemSway * 0.5, 0.12, 0.12, { color: SHADE_ROBE, h: 0.08, z: z - 0.20, outline: false, alpha: 0.22 });

  // Tattered robe body — three stacked, slightly shrinking tiers so the hem reads ragged
  // rather than a clean cone.
  w.box(0.22 + lx + hurtShake, 0.22 + ly, 0.56, 0.56, { color: SHADE_ROBE, h: 0.14, z, outline: false, alpha: 0.55 });
  w.box(0.27 + lx + hemSway * 0.4 + hurtShake, 0.27 + ly, 0.46, 0.46, { color: SHADE_ROBE, h: 0.48, z: z + 0.10, outline: true, alpha: 0.9 });
  w.box(0.33 + lx + hurtShake, 0.33 + ly, 0.34, 0.34, { color: SHADE_ROBE_DARK, h: 0.40, z: z + 0.54, outline: true });

  // Hood
  const hoodZ = z + 0.90;
  w.box(0.35 + lx + hurtShake, 0.35 + ly, 0.30, 0.30, { color: SHADE_ROBE_DARK, h: 0.28, z: hoodZ, outline: true });

  // Glowing eyes — the one facing-dependent read on an otherwise symmetric hood
  const eyeZ = hoodZ + 0.10;
  if (facing === 1) {
    w.box(0.44 + lx, 0.58 + ly, 0.05, 0.05, { color: MAGIC_GLOW_CORE, h: 0.06, z: eyeZ });
    w.box(0.55 + lx, 0.58 + ly, 0.05, 0.05, { color: MAGIC_GLOW_CORE, h: 0.06, z: eyeZ });
  } else if (facing === 0) {
    w.box(0.44 + lx, 0.40 + ly, 0.05, 0.05, { color: MAGIC_GLOW, h: 0.05, z: eyeZ, alpha: 0.6 });
    w.box(0.55 + lx, 0.40 + ly, 0.05, 0.05, { color: MAGIC_GLOW, h: 0.05, z: eyeZ, alpha: 0.6 });
  } else if (facing === 2) {
    w.box(0.58 + lx, 0.44 + ly, 0.05, 0.05, { color: MAGIC_GLOW_CORE, h: 0.06, z: eyeZ });
    w.box(0.58 + lx, 0.55 + ly, 0.05, 0.05, { color: MAGIC_GLOW_CORE, h: 0.06, z: eyeZ });
  } else {
    w.box(0.40 + lx, 0.44 + ly, 0.05, 0.05, { color: MAGIC_GLOW_CORE, h: 0.06, z: eyeZ });
    w.box(0.40 + lx, 0.55 + ly, 0.05, 0.05, { color: MAGIC_GLOW_CORE, h: 0.06, z: eyeZ });
  }

  // Reaching claw, only mid-strike, thrust toward the attack direction
  if (isAttacking) {
    const clawZ = z + 0.60;
    if (facing === 1) w.box(0.42, 0.70 + lunge * 1.5, 0.18, 0.14, { color: MAGIC_GLOW, h: 0.12, z: clawZ, outline: false, alpha: 0.75 });
    else if (facing === 0) w.box(0.42, 0.16 - lunge * 1.5, 0.18, 0.14, { color: MAGIC_GLOW, h: 0.12, z: clawZ, outline: false, alpha: 0.75 });
    else if (facing === 2) w.box(0.70 + lunge * 1.5, 0.42, 0.14, 0.18, { color: MAGIC_GLOW, h: 0.12, z: clawZ, outline: false, alpha: 0.75 });
    else w.box(0.16 - lunge * 1.5, 0.42, 0.14, 0.18, { color: MAGIC_GLOW, h: 0.12, z: clawZ, outline: false, alpha: 0.75 });
  }
};

export const SHADE_SPRITE: SpriteDef = defineSprite({
  id: 'shade', w: 1, d: 1, massing: shadeMassing,
});

// ── Declarative Creature Sprite Registry ──────────────────────────────────────

export const CREATURE_SPRITES: Record<Creature['species'], SpriteDef> = {
  rabbit: RABBIT_SPRITE,
  deer:   DEER_SPRITE,
  fox:    FOX_SPRITE,
  wolf:   WOLF_SPRITE,
  troll:  TROLL_SPRITE,
  bear:   BEAR_SPRITE,
  boar:   BOAR_SPRITE,
  croc:   CROC_SPRITE,
  shade:  SHADE_SPRITE,
};

/** Map a creature species to its cached SpriteDef via declarative registry. */
export function spriteForCreature(species: Creature['species']): SpriteDef {
  return CREATURE_SPRITES[species] ?? RABBIT_SPRITE;
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
 * Encodes facing orientation, state, attack phase, and hurt reaction.
 * Reuses an internal scratch variant to guarantee zero allocations on the hot path.
 */
export function creatureVariant(c: Creature): Variant {
  const facingCode = c.facing === 's' ? 1 : c.facing === 'e' ? 2 : c.facing === 'w' ? 3 : 0;
  const stateCode =
    c.state === 'idle' ? 0 :
    c.state === 'wander' ? 1 :
    c.state === 'flee' ? 2 :
    c.state === 'chase' ? 3 :
    c.state === 'attack' ? 4 :
    c.state === 'eat' ? 5 : 6;

  const isHurtFlag = c.hurtTimer > 0 ? (1 << 7) : 0;

  let animPhase = c.walkCycle % 1;
  if (c.attackAnimTimer > 0 || c.state === 'attack') {
    animPhase = Math.min(1.0, Math.max(0.0, 1.0 - c.attackAnimTimer / 0.55));
  } else if (c.state === 'eat' || c.state === 'forage') {
    animPhase = (c.eatTimer % 0.6) / 0.6;
  }

  CREATURE_VARIANT_SCRATCH.seed = hash2(c.id, 0, 0);
  CREATURE_VARIANT_SCRATCH.flags = facingCode | (stateCode << 3) | isHurtFlag;
  CREATURE_VARIANT_SCRATCH.level = Math.floor(animPhase * 1000);
  CREATURE_VARIANT_SCRATCH.progress = c.traits.size;
  CREATURE_VARIANT_SCRATCH.label = '';
  return CREATURE_VARIANT_SCRATCH;
}

/**
 * Build a `Variant` for a player — encodes facing orientation, movement, weapon, action type, and action phase.
 * Reuses an internal scratch variant to guarantee zero allocations on the hot path.
 */
export function playerVariant(p: Player): Variant {
  const facingCode = p.facing === 's' ? 1 : p.facing === 'e' ? 2 : p.facing === 'w' ? 3 : 0;
  const isMovingFlag = p.isMoving ? 4 : 0;
  const weaponCode = p.weapon === 'hands' ? 0 : p.weapon === 'axe' ? 1 : p.weapon === 'sword' ? 2 : 3;

  const actionCode =
    p.actionType === 'sword_slash' ? 1 :
    p.actionType === 'axe_chop' ? 2 :
    p.actionType === 'fist_punch' ? 3 :
    p.actionType === 'bow_draw' ? 4 :
    p.actionType === 'chop' ? 5 :
    p.actionType === 'mine' ? 6 :
    p.actionType === 'forage' ? 7 :
    p.actionType === 'repair' ? 8 :
    p.actionType === 'dig' ? 9 :
    p.actionType === 'raise' ? 10 : 0;

  const isHurtFlag = p.hurtFlash > 0 ? (1 << 10) : 0;

  const actionProgress = (p.actionDuration > 0 && p.actionTimer > 0)
    ? Math.min(1.0, Math.max(0.0, 1.0 - p.actionTimer / p.actionDuration))
    : 0;

  PLAYER_VARIANT_SCRATCH.seed = hash2(p.index, 42, 0);
  PLAYER_VARIANT_SCRATCH.flags = facingCode | isMovingFlag | (weaponCode << 4) | (actionCode << 6) | isHurtFlag;
  PLAYER_VARIANT_SCRATCH.level = Math.floor(actionProgress * 1000);
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



