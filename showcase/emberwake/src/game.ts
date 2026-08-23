/**
 * The run: hulls, shot, fire, and the pressure that makes you move.
 *
 * **This file is the whole simulation and it never allocates.** Every boat, shell and particle
 * is a slot in an array built once by {@link createGame}; the update loop writes fields in place
 * and iterates with `for…of`, which yields the element type rather than `T | undefined` and so
 * costs neither a bounds check nor a non-null assertion. An action game is exactly where
 * non-negotiable 7 earns its keep: forty shells and two hundred particles a second, allocated,
 * is a collector pause on the frame the magazine goes up.
 *
 * ## Every number here is Tier A
 *
 * There is no `sin`, `cos`, `pow`, `exp` or `**` anywhere in this file, and that is not an
 * accident of style — it is what lets the same seed and the same inputs produce the same run on
 * any engine. Two tricks buy it:
 *
 * | wanted | the Tier B way | what this does instead |
 * |---|---|---|
 * | rotate a heading by θ | `cos θ`, `sin θ` | `normalize(v + k·perp(v))`, which rotates by **exactly** `atan k` |
 * | decay a value over `dt` | `exp(−λ·dt)` | a per-tick multiplier, because the tick is fixed and the constant is one number |
 *
 * The first is the interesting one. `v + k·perp(v)` has angle `angle(v) + atan(k)` identically,
 * for any `k`, so choosing the turn parameter directly *is* choosing the angle — and the whole
 * of it is two multiplies, two adds and one `sqrt`, all of which ECMA-262 specifies exactly.
 *
 * ## What lives here and what does not
 *
 * Nothing in this file knows what anything looks like, and nothing in it touches a `Pen`. It
 * emits *events* — {@link GameHooks} — and the art and the sound decide what those mean. That
 * split is what let the fire system be tuned by ear and by eye without either half being
 * rewritten.
 */

import { clamp, clamp01, type Rng } from '@latticekit/core';
import { Burn, Kind, MAP, STEP_PX, onLand, type Prop, type World } from './world.js';

// ── the shapes ─────────────────────────────────────────────────────────────────────────────

/** A hull, player or raider. One shape for both, because they take the same damage from the
 *  same shells and the difference is only who steers. */
export interface Boat {
  x: number;
  y: number;
  /** Heading, a unit vector in grid space. Never an angle: see the module header. */
  hx: number;
  hy: number;
  /** Velocity in tiles per second. Not `heading · speed` — the difference between the two is
   *  the skid, and the skid is most of what makes this feel like a boat. */
  vx: number;
  vy: number;
  /** Hits left. The player's is a hundred and reads as a bar; a raider's is small. */
  hull: number;
  /** Seconds until the guns are ready. */
  reload: number;
  /** 0–1 damage flash, decaying. */
  hurt: number;
  /** 0–1 how alight this hull is. A raider that catches fire is a raider that is going to sink,
   *  and it is the same value the flame art reads. */
  fire: number;
  /** Seconds since sinking began, or -1 while afloat. */
  sinking: number;
  /** True while the slot is in use. */
  live: boolean;
  /** 0–1, stable per instance, for art variation. */
  seed: number;
  /** Wake emission accumulator, in seconds. */
  wake: number;
  /** The last position this hull was in open water. **The whole of the grounding fix.** */
  wx: number;
  wy: number;
  /** Seconds of muzzle flash left. The art reads it for the glow and the light field reads it
   *  for the pool, so the flash that lights the sea is the same event as the one you hear. */
  muzzle: number;
}

/** A shell in flight. `z` is world pixels above the sea, which is the same unit the height
 *  field and the light pools use, so nothing has to convert on the hot path. */
export interface Shell {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Seconds left before it is given up on. A shell that never lands is a shell that never
   *  frees its slot. */
  life: number;
  /** 0 the player's, 1 theirs. Decides who it can hurt and what color it is. */
  team: 0 | 1;
  live: boolean;
  /** 0–1, for the tumble in the art. */
  seed: number;
}

/** What a particle is doing. The kind picks the art and the physics in one field. */
export const Puff = {
  /** Bow spray. Arcs, lands, and is gone. */
  Spray: 0,
  /** A wake puff. Lies on the water, spreads, fades. */
  Foam: 1,
  /** Smoke. Rises, spreads, drifts downwind. */
  Smoke: 2,
  /** An ember off a fire. Rises fast, then falls, and can start a fire where it lands — which
   *  is why the wind matters. */
  Ember: 3,
  /** A splinter off something that was hit. Ballistic, and it bounces once. */
  Debris: 4,
} as const;
/** See {@link Puff}. */
export type Puff = (typeof Puff)[keyof typeof Puff];

/** One particle. Pooled; `live` is the whole of its lifecycle. */
export interface Mote {
  x: number;
  y: number;
  /** World pixels above the sea. Water-level motes keep this at 0 and are drawn under the boats. */
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Seconds lived. */
  age: number;
  /** Seconds it gets. */
  ttl: number;
  kind: Puff;
  /** Tiles. Grows with age for smoke and foam. */
  size: number;
  seed: number;
  live: boolean;
}

/** What the run reports outward. Sound, the HUD and the camera all hang off these, and none of
 *  them can reach into the simulation to ask. */
export interface GameHooks {
  /** Something happened at `(gx, gy)` worth hearing. `force` is 0–1. */
  readonly sound: (name: SoundEvent, gx: number, gy: number, force: number) => void;
  /** Shake the camera by `mag` screen pixels and hold the world for `stopTicks` ticks. */
  readonly punch: (mag: number, stopTicks: number, zoom: number) => void;
}

/** Everything the run can ask to be heard. A closed union so a typo is a compile error. */
export type SoundEvent =
  | 'cannon' | 'thud' | 'splash' | 'catch' | 'blast' | 'magazine' | 'hull' | 'sink' | 'shore';

/** How the run ended, or that it has not. */
export const Phase = { Playing: 0, Won: 1, Lost: 2 } as const;
/** See {@link Phase}. */
export type Phase = (typeof Phase)[keyof typeof Phase];

// ── tuning ─────────────────────────────────────────────────────────────────────────────────
//
// Every one of these was moved until the game felt right and then left alone. They are together
// so that the next person can find the one they mean without reading the code around it.

/** Thrust, in tiles per second squared. */
const THRUST = 15;
/** Reverse is worth about a third of ahead, which is what makes a mistake cost something. */
const ASTERN = 5.5;
/** Linear and quadratic drag. Together they set the top speed at about nine tiles a second —
 *  roughly six hundred world pixels, which crosses a 1280-wide frame in two seconds. */
const DRAG_LIN = 1.15;
const DRAG_SQ = 0.032;
/** Per-tick survival of the sideways component of velocity. 0.9 per tick is a keel that bites
 *  but does not grip: hard over at speed and the stern steps out, which is the entire feel. */
const KEEL = 0.9;
/** Radians per second of turn at full rudder authority, expressed as the `k` of the rotate
 *  trick in the module header. */
const TURN = 2.05;
/** Rudder authority against speed. A boat dead in the water barely answers her helm; the floor
 *  is a playability concession and not a physical one. */
const TURN_FLOOR = 0.3;

/** The player's hull, and the denominator of the bar. */
export const HULL = 100;
/** Seconds between salvos. */
const RELOAD = 0.46;
/** Tiles per second a shell leaves the muzzle at. */
const SHELL_SPEED = 27;
/** World pixels per second squared. Sets how high an arc gets for a given range. */
const GRAVITY = 640;
/** Muzzle height in world pixels. */
const MUZZLE_Z = 15;

/** How close a shell has to pass a hull to fuse. Generous, because an arcing shot at a moving
 *  target is otherwise a coin toss and the game is about movement, not about leading. */
const FUSE = 0.95;
/** How high the fuse still works, in world pixels. Above this the shell is over the target. */
const FUSE_Z = 26;

/** Tiles. Inside this a hit lights whatever it touched outright; out to twice it, it only heats. */
const BLAST = 1.5;
/** What a direct hit does to a wooden thing. Over 1, so a hit is an ignition and not a maybe. */
const HIT_HEAT = 1.35;

/** Seconds of flame per second of fuel, and the rate heat leaks away from something that is only
 *  scorched. Together they decide whether a fire spreads or dies, which is the single most
 *  load-bearing pair of numbers in the game. */
const SPREAD = 0.62;
/** How much faster fire runs downwind. At 2.4 the wind is legible from the first island. */
const WIND_GAIN = 2.4;
/** Heat lost per second by something that caught a little and then was left alone. */
const COOL = 0.22;

/** Tiles. The magazine's blast radius, and it is bigger than it looks — standing off is the
 *  lesson the first one teaches. */
const MAG_BLAST = 7.5;

/** Raider pressure. The interval shortens and the ceiling rises with every magazine gone. */
const SPAWN_BASE = 11;
const SPAWN_MIN = 3.4;

// ── the state ──────────────────────────────────────────────────────────────────────────────

/** The two quarters a wake comes off, and the two barrels a salvo comes out of. Module scope
 *  because `for (const side of [-1, 1])` inside a per-tick function is an array literal sixty
 *  times a second per boat — the exact shape non-negotiable 7 exists to catch. */
const SIDES: readonly number[] = [-1, 1];
/** See {@link SIDES}. The pair straddles the aim rather than sitting on it. */
const BARRELS: readonly number[] = [-0.5, 0.5];

/** Pool sizes. Fixed, because a pool that grows is a pool that allocates on the worst frame of
 *  the run — the one where the magazine went up. */
const MAX_RAIDERS = 12;
const MAX_SHELLS = 96;
const MAX_MOTES = 320;

/** A run in progress. Everything mutable about the game is on this object. */
export interface Game {
  readonly world: World;
  readonly rng: Rng;
  readonly hooks: GameHooks;
  readonly player: Boat;
  readonly raiders: readonly Boat[];
  readonly shells: readonly Shell[];
  readonly motes: readonly Mote[];
  /** Seconds of run. Sim time, so it does not advance during hit-stop. */
  t: number;
  phase: Phase;
  /** Magazines still standing. The objective, and the escalation counter. */
  left: number;
  /** Magazines at the start, for the HUD's denominator. */
  readonly total: number;
  /** Things burned and hulls sunk, for the end card. */
  burned: number;
  sunk: number;
  /** Seconds until the next raider. */
  spawn: number;
  /** Ticks of hit-stop left. While this is positive the world does not advance — see
   *  {@link stepGame}. */
  stop: number;
  /** Fire currently in the world, 0–1ish, for the bed and the sky glow. */
  heat: number;
  /** Where the player is aiming, in tiles. Written by the input layer every frame. */
  aimX: number;
  aimY: number;
  /** Throttle and rudder, −1…1, written by the input layer every tick. */
  throttle: number;
  rudder: number;
  /** True while the trigger is down. */
  firing: boolean;
  /** The last big explosion: where it was and how long ago, in seconds, counting up. The art
   *  reads it for the white flash and the light field for one enormous transient pool. Kept as
   *  three numbers on the game rather than as an event, because a flash has a *duration* and an
   *  event that has already been delivered cannot be asked how old it is. */
  flashX: number;
  flashY: number;
  flashAge: number;
}

/** Build the pools and put the player in the water. Called once per run. */
export function createGame(world: World, rng: Rng, hooks: GameHooks): Game {
  const boat = (): Boat => ({
    x: 0, y: 0, hx: 1, hy: 0, vx: 0, vy: 0, hull: 0, reload: 0,
    hurt: 0, fire: 0, sinking: -1, live: false, seed: 0, wake: 0, muzzle: 0, wx: 0, wy: 0,
  });
  const raiders: Boat[] = [];
  for (let i = 0; i < MAX_RAIDERS; i++) raiders.push(boat());
  const shells: Shell[] = [];
  for (let i = 0; i < MAX_SHELLS; i++) {
    shells.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, team: 0, live: false, seed: 0 });
  }
  const motes: Mote[] = [];
  for (let i = 0; i < MAX_MOTES; i++) {
    motes.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, ttl: 0, kind: Puff.Spray, size: 0, seed: 0, live: false });
  }

  const player = boat();
  player.x = world.startX;
  player.y = world.startY;
  player.wx = world.startX;
  player.wy = world.startY;
  player.hull = HULL;
  player.live = true;
  // Pointed at the middle of the map, which is where the islands are: the opening frame has the
  // bow toward something rather than toward open water.
  const dx = MAP * 0.5 - player.x;
  const dy = MAP * 0.5 - player.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  player.hx = dx / d;
  player.hy = dy / d;

  let total = 0;
  for (const p of world.props) if (p.kind === Kind.Magazine) total++;

  return {
    world, rng, hooks, player, raiders, shells, motes,
    t: 0, phase: Phase.Playing, left: total, total, burned: 0, sunk: 0,
    spawn: 5, stop: 0, heat: 0, flashX: 0, flashY: 0, flashAge: 99,
    aimX: player.x + player.hx * 8, aimY: player.y + player.hy * 8,
    throttle: 0, rudder: 0, firing: false,
  };
}

// ── the pools, taken from ──────────────────────────────────────────────────────────────────

/**
 * The first free slot, or `undefined` when the pool is full.
 *
 * Returning `undefined` rather than recycling the oldest is deliberate: a full shell pool means
 * ninety-six shells are in the air, and the frame where a ninety-seventh silently deletes one
 * already in flight is a frame where a hit does not register for a reason nothing can show. A
 * dropped *new* shell is invisible; a deleted live one is a bug report.
 */
function freeShell(game: Game): Shell | undefined {
  for (const s of game.shells) if (!s.live) return s;
  return undefined;
}

/** See {@link freeShell}. Particles recycle the oldest instead, because losing the tail of a
 *  wake is what a full particle budget is *supposed* to look like — and unlike a shell, no
 *  gameplay decision has ever been made from the last frame of a smoke puff. */
function freeMote(game: Game): Mote | undefined {
  let oldest: Mote | undefined;
  let best = -1;
  for (const m of game.motes) {
    if (!m.live) return m;
    const spent = m.age / m.ttl;
    if (spent > best) { best = spent; oldest = m; }
  }
  return oldest;
}

/** Put a particle in the world. Every field is written, so a recycled slot carries nothing over
 *  from its last life. */
export function spawnMote(
  game: Game, kind: Puff, x: number, y: number, z: number,
  vx: number, vy: number, vz: number, ttl: number, size: number,
): void {
  const m = freeMote(game);
  if (m === undefined) return;
  m.kind = kind; m.x = x; m.y = y; m.z = z;
  m.vx = vx; m.vy = vy; m.vz = vz;
  m.age = 0; m.ttl = ttl; m.size = size;
  m.seed = game.rng.next();
  m.live = true;
}

// ── the player's boat ──────────────────────────────────────────────────────────────────────

/**
 * Steer and drive one hull.
 *
 * The rotate-by-`atan k` trick is here, once, and every other turning thing in the game calls
 * this rather than reimplementing it.
 */
function drive(b: Boat, dt: number, throttle: number, rudder: number, thrust: number): void {
  const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);

  // Rudder. `k` is the tangent of the angle turned this tick, so the heading stays exactly a
  // unit vector and exactly `atan k` further round — no drift, no renormalization error.
  if (rudder !== 0) {
    const authority = clamp(speed / 5, TURN_FLOOR, 1);
    const k = rudder * TURN * authority * dt;
    const nx = b.hx - k * b.hy;
    const ny = b.hy + k * b.hx;
    const inv = 1 / Math.sqrt(nx * nx + ny * ny);
    b.hx = nx * inv;
    b.hy = ny * inv;
  }

  // Thrust along the heading, drag against the velocity.
  const push = (throttle > 0 ? throttle * thrust : throttle * ASTERN) * dt;
  b.vx += b.hx * push;
  b.vy += b.hy * push;
  const drag = 1 - (DRAG_LIN + DRAG_SQ * speed) * dt;
  b.vx *= drag;
  b.vy *= drag;

  // The keel. Split velocity along and across the heading, keep the along part, bite the across
  // part — this is the skid, and without it a boat is a cursor with a sprite.
  const along = b.vx * b.hx + b.vy * b.hy;
  const latX = b.vx - b.hx * along;
  const latY = b.vy - b.hy * along;
  b.vx = b.hx * along + latX * KEEL;
  b.vy = b.hy * along + latY * KEEL;

  b.x += b.vx * dt;
  b.y += b.vy * dt;
}

/** Keep a hull inside the map and off the rocks. Land is a wall that costs speed rather than a
 *  wall that kills: grounding at nine knots should hurt and should not end the run in silence. */
function shoreCheck(game: Game, b: Boat, isPlayer: boolean): void {
  const w = game.world;
  b.x = clamp(b.x, 2, MAP - 3);
  b.y = clamp(b.y, 2, MAP - 3);
  if (!onLand(w, b.x, b.y)) {
    // The last tile of open water she was in. Cheap to keep and the only thing that makes the
    // grounding recovery below unconditional.
    b.wx = b.x;
    b.wy = b.y;
    return;
  }

  // **Back to the last water, not back along the velocity.** Reversing by a fraction of the
  // frame's motion is what the first build did, and it is correct only for a hull that arrived
  // fast: a boat that drifts onto a beach at half a knot backs out by three centimetres, stays
  // aground, and is then *inside the island* for the rest of the run — which is what happened,
  // and the symptom was a player who had vanished from her own frame with no error anywhere.
  // A remembered position cannot fail that way, because it was water when it was written.
  const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  b.x = b.wx;
  b.y = b.wy;
  b.vx *= -0.22;
  b.vy *= -0.22;
  if (speed > 2.4) {
    b.hurt = 1;
    b.hull -= isPlayer ? speed * 0.9 : speed * 2;
    game.hooks.sound('shore', b.x, b.y, clamp01(speed / 9));
    if (isPlayer) game.hooks.punch(clamp(speed * 0.9, 2, 9), 2, 0.02);
    for (let i = 0; i < 5; i++) {
      const r = game.rng;
      spawnMote(game, Puff.Spray, b.x, b.y, 6, r.float(-3, 3), r.float(-3, 3), r.float(2, 8) * 20, 0.5, 0.22);
    }
  }
}

/** Wake and spray, emitted by anything moving. Rate is tied to speed rather than to the frame,
 *  so a slow boat leaves a thin wake and a fast one leaves a wall of it. */
function wake(game: Game, b: Boat, dt: number): void {
  const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  if (speed < 0.6) return;
  b.wake += dt * speed;
  if (b.wake < 0.55) return;
  b.wake = 0;
  // Two puffs off the quarters, thrown outward, which is what makes a wake a V rather than a
  // trail. The stern is one tile behind the middle of the hull.
  const sx = b.x - b.hx * 0.9;
  const sy = b.y - b.hy * 0.9;
  const px = -b.hy;
  const py = b.hx;
  const spread = 0.28 + speed * 0.035;
  for (const side of SIDES) {
    spawnMote(
      game, Puff.Foam, sx + px * side * 0.45, sy + py * side * 0.45, 0,
      px * side * spread - b.hx * 0.35, py * side * spread - b.hy * 0.35, 0,
      1.5 + speed * 0.06, 0.34,
    );
  }
  if (speed > 5.5) {
    const r = game.rng;
    spawnMote(
      game, Puff.Spray, b.x + b.hx * 1.1, b.y + b.hy * 1.1, 4,
      b.hx * 1.4 + r.float(-1.2, 1.2), b.hy * 1.4 + r.float(-1.2, 1.2), r.float(40, 110),
      0.55, 0.2,
    );
  }
}

// ── guns ───────────────────────────────────────────────────────────────────────────────────

/**
 * Launch a shell from `(x, y)` toward `(tx, ty)`, arriving in a time chosen by range.
 *
 * The vertical solution is closed form and worth stating because it is what makes the shadow
 * readable: given the flight time, the muzzle rise is exactly what puts the shell back on the
 * water at the end of it, so the shadow meets the shell at the moment of impact. A launch that
 * guessed at `vz` gets a shadow that arrives early or late, and the eye reads that as the shot
 * missing even when it hit.
 */
function launch(game: Game, x: number, y: number, tx: number, ty: number, team: 0 | 1, lofted: number): void {
  const s = freeShell(game);
  if (s === undefined) return;
  const dx = tx - x;
  const dy = ty - y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
  const speed = team === 0 ? SHELL_SPEED : SHELL_SPEED * 0.62;
  const flight = clamp(dist / speed, 0.2, 1.8) * lofted;
  s.x = x; s.y = y; s.z = MUZZLE_Z;
  s.vx = dx / flight;
  s.vy = dy / flight;
  s.vz = (0.5 * GRAVITY * flight * flight - MUZZLE_Z) / flight;
  s.life = flight + 0.4;
  s.team = team;
  s.seed = game.rng.next();
  s.live = true;
}

/** The player pulls the trigger: two barrels, a small spread, a shove astern, and a flash. */
function fire(game: Game): void {
  const p = game.player;
  if (p.reload > 0 || !p.live) return;
  p.reload = RELOAD;
  p.muzzle = 0.09;
  const dx = game.aimX - p.x;
  const dy = game.aimY - p.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const ax = dx / d;
  const ay = dy / d;
  // The pair straddles the aim by a fixed fraction of range rather than by a fixed angle, so
  // the spread is a group on the water and not a cone that misses everything far away.
  for (const side of BARRELS) {
    const jitter = side * (0.35 + d * 0.035);
    launch(game, p.x + ax * 0.7 - ay * side * 0.5, p.y + ay * 0.7 + ax * side * 0.5,
      game.aimX - ay * jitter, game.aimY + ax * jitter, 0, 1);
  }
  // Recoil. Small, and it is the difference between a gun and a click.
  p.vx -= ax * 0.85;
  p.vy -= ay * 0.85;
  for (let i = 0; i < 3; i++) {
    const r = game.rng;
    spawnMote(game, Puff.Smoke, p.x + ax * 1.1, p.y + ay * 1.1, MUZZLE_Z,
      ax * r.float(1, 3.4), ay * r.float(1, 3.4), r.float(10, 30), 0.8, 0.3);
  }
  game.hooks.sound('cannon', p.x, p.y, 1);
  game.hooks.punch(3.4, 0, 0);
}

// ── fire ───────────────────────────────────────────────────────────────────────────────────

/** Light something, if it is not already alight or already gone. Returns whether it caught, so
 *  the caller can make a noise about it exactly once. */
function ignite(game: Game, p: Prop): boolean {
  if (p.state !== Burn.Cold) return false;
  p.state = Burn.Lit;
  p.heat = 1;
  game.hooks.sound('catch', p.gx, p.gy, 0.5);
  return true;
}

/**
 * Deposit heat in a circle. The whole of how anything sets anything else alight — a shell, an
 * ember, a magazine and a burning raider all come through here, so there is one falloff and one
 * place to tune it.
 */
function scorch(game: Game, x: number, y: number, radius: number, amount: number): void {
  const r2 = radius * radius;
  for (const p of game.world.props) {
    if (p.state !== Burn.Cold) continue;
    const dx = p.gx - x;
    const dy = p.gy - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    p.heat += amount * (1 - Math.sqrt(d2) / radius);
    if (p.heat >= 1) ignite(game, p);
  }
}

/** The moment a magazine finishes burning. The loudest thing in the game, and the reason the
 *  player learns to stand off. */
function detonate(game: Game, p: Prop): void {
  game.left = Math.max(0, game.left - 1);
  game.flashX = p.gx;
  game.flashY = p.gy;
  game.flashAge = 0;
  game.hooks.sound('magazine', p.gx, p.gy, 1);
  game.hooks.punch(30, 6, 0.16);
  scorch(game, p.gx, p.gy, MAG_BLAST, 3);

  const r = game.rng;
  for (let i = 0; i < 26; i++) {
    const a = r.float(-1, 1);
    const b = r.float(-1, 1);
    const n = Math.sqrt(a * a + b * b) || 1;
    const sp = r.float(4, 17);
    spawnMote(game, i % 3 === 0 ? Puff.Debris : Puff.Ember, p.gx, p.gy, p.zPx + 18,
      (a / n) * sp, (b / n) * sp, r.float(120, 460), r.float(0.9, 2.4), r.float(0.16, 0.4));
  }
  for (let i = 0; i < 10; i++) {
    spawnMote(game, Puff.Smoke, p.gx + r.float(-1.5, 1.5), p.gy + r.float(-1.5, 1.5), p.zPx + 20,
      r.float(-1.4, 1.4), r.float(-1.4, 1.4), r.float(30, 90), r.float(2.5, 4.5), 0.9);
  }

  // A magazine takes its island's gun with it, and the fleet stands off for a few seconds. Both
  // are relief valves, and they are the reason the escalation curve is survivable: the pressure
  // rises with every objective *and* every objective buys back a little of it. Without them the
  // last two magazines are unreachable no matter how well anybody steers.
  for (const gun of game.world.batteries) {
    if (gun.hp <= 0) continue;
    const gdx = gun.gx - p.gx;
    const gdy = gun.gy - p.gy;
    if (gdx * gdx + gdy * gdy < MAG_BLAST * MAG_BLAST) {
      gun.hp = 0;
      gun.hurt = 1;
    }
  }
  game.spawn = Math.max(game.spawn, 6);

  // Everything close enough is caught in it, including the player. The magazine does not care
  // whose side you are on, and finding that out is the best lesson the first island teaches.
  for (const b of game.raiders) {
    if (!b.live || b.sinking >= 0) continue;
    const dx = b.x - p.gx;
    const dy = b.y - p.gy;
    if (dx * dx + dy * dy < 16) { b.hull = 0; b.fire = 1; }
  }
  const pl = game.player;
  const dx = pl.x - p.gx;
  const dy = pl.y - p.gy;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < MAG_BLAST * 0.7) {
    const share = 1 - d / (MAG_BLAST * 0.7);
    pl.hull -= 34 * share;
    pl.hurt = 1;
    pl.vx += (dx / (d || 1)) * 9 * share;
    pl.vy += (dy / (d || 1)) * 9 * share;
    game.hooks.sound('hull', pl.x, pl.y, 1);
  }
}

/** Advance every fire in the world by one tick. */
function stepFire(game: Game, dt: number): void {
  const w = game.world;
  const props = w.props;
  let total = 0;

  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    if (p === undefined) continue;

    if (p.state === Burn.Cold) {
      // Scorched and then left alone: heat leaks away, so a single glancing hit does not light
      // an island ten seconds later with nothing on screen to explain it.
      if (p.heat > 0) p.heat = Math.max(0, p.heat - COOL * dt);
      continue;
    }
    if (p.state === Burn.Spent) {
      if (p.smoke > 0) p.smoke -= dt;
      continue;
    }

    // Alight. The flame ramps in over about a second, holds while there is fuel, and is the
    // number both the art and the light field read.
    p.fuel -= dt;
    const burnt = 1 - p.fuel / p.fuelMax;
    p.flame = Math.min(1, p.flame + dt * 1.6);
    const intensity = p.flame * (burnt > 0.82 ? clamp01((1 - burnt) / 0.18) : 1);
    total += intensity * p.size;

    // Spread. Only to the neighbors this prop was born knowing about, and biased downwind — the
    // dot product is the whole of the wind model and it is worth every one of its four multiplies.
    for (const j of p.near) {
      const q = props[j];
      if (q === undefined || q.state !== Burn.Cold) continue;
      const dx = q.gx - p.gx;
      const dy = q.gy - p.gy;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
      const lean = 1 + WIND_GAIN * Math.max(0, (dx * w.windX + dy * w.windY) / d);
      q.heat += SPREAD * intensity * lean * dt / d;
      if (q.heat >= 1) ignite(game, q);
    }

    // Embers, which is how fire crosses a gap the neighbor table does not span. Rate-limited by
    // the same accumulator the wake uses, so a hundred fires do not fill the mote pool in a frame.
    if (game.rng.next() < intensity * dt * 1.6) {
      const r = game.rng;
      spawnMote(game, Puff.Ember, p.gx, p.gy, p.zPx + 10 + p.size * 8,
        w.windX * r.float(1.5, 4.5) + r.float(-1, 1), w.windY * r.float(1.5, 4.5) + r.float(-1, 1),
        r.float(60, 150), r.float(1.4, 2.8), 0.1);
    }
    if (game.rng.next() < intensity * dt * 1.1) {
      const r = game.rng;
      spawnMote(game, Puff.Smoke, p.gx + r.float(-0.4, 0.4), p.gy + r.float(-0.4, 0.4), p.zPx + p.size * 10,
        w.windX * 1.6, w.windY * 1.6, r.float(30, 70), r.float(2.2, 3.6), p.size * 0.4);
    }

    if (p.fuel <= 0) {
      p.state = Burn.Spent;
      p.flame = 0;
      p.smoke = 6;
      game.burned++;
      if (p.kind === Kind.Magazine) detonate(game, p);
    }
  }

  // A single number for how much of the world is on fire. The music rides it, the sky glows with
  // it, and the HUD does not show it at all — it is a feeling, not a statistic.
  game.heat = clamp01(total / 14);
}

// ── shells ─────────────────────────────────────────────────────────────────────────────────

/** A shell reached the water or the ground. Everything that happens on impact is here. */
function land(game: Game, s: Shell): void {
  s.live = false;
  const w = game.world;
  const ashore = onLand(w, s.x, s.y);
  const r = game.rng;

  if (s.team === 0) {
    scorch(game, s.x, s.y, BLAST, HIT_HEAT);
    scorch(game, s.x, s.y, BLAST * 2.4, 0.5);
    for (const b of w.batteries) {
      if (b.hp <= 0) continue;
      const dx = b.gx - s.x;
      const dy = b.gy - s.y;
      if (dx * dx + dy * dy > BLAST * BLAST) continue;
      b.hp -= 1;
      b.hurt = 1;
      if (b.hp <= 0) {
        game.hooks.punch(9, 3, 0.05);
        game.hooks.sound('blast', b.gx, b.gy, 0.9);
        for (let i = 0; i < 8; i++) {
          spawnMote(game, Puff.Debris, b.gx, b.gy, b.zPx + 10, r.float(-7, 7), r.float(-7, 7), r.float(120, 300), 1.4, 0.22);
        }
      }
    }
  } else {
    const p = game.player;
    const dx = p.x - s.x;
    const dy = p.y - s.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 3.2 && p.live) {
      const share = 1 - Math.sqrt(d2) / 1.8;
      p.hull -= 7 * clamp01(share);
      p.hurt = 1;
      game.hooks.sound('hull', p.x, p.y, 1);
      game.hooks.punch(11, 2, 0.03);
    }
  }

  game.hooks.sound(ashore ? 'thud' : 'splash', s.x, s.y, 0.7);
  game.hooks.punch(ashore ? 2 : 1.2, 0, 0);
  const lift = ashore ? Puff.Debris : Puff.Spray;
  for (let i = 0; i < (ashore ? 5 : 7); i++) {
    spawnMote(game, lift, s.x, s.y, ashore ? w.heights.get(Math.floor(s.x), Math.floor(s.y)) * STEP_PX : 0,
      r.float(-3.4, 3.4), r.float(-3.4, 3.4), r.float(60, 190), r.float(0.35, 0.7), r.float(0.14, 0.26));
  }
  if (!ashore) {
    spawnMote(game, Puff.Foam, s.x, s.y, 0, 0, 0, 0, 1.1, 0.5);
  }
}

/** Move every shell, and fuse the ones that pass close to a hull. */
function stepShells(game: Game, dt: number): void {
  for (const s of game.shells) {
    if (!s.live) continue;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    s.vz -= GRAVITY * dt;
    s.life -= dt;

    if (s.z < FUSE_Z) {
      if (s.team === 0) {
        for (const b of game.raiders) {
          if (!b.live || b.sinking >= 0) continue;
          const dx = b.x - s.x;
          const dy = b.y - s.y;
          if (dx * dx + dy * dy > FUSE * FUSE) continue;
          b.hull -= 1;
          b.hurt = 1;
          b.fire = Math.min(1, b.fire + 0.55);
          s.live = false;
          game.hooks.sound('blast', b.x, b.y, 0.8);
          const r = game.rng;
          for (let i = 0; i < 6; i++) {
            spawnMote(game, Puff.Debris, b.x, b.y, 12, r.float(-5, 5), r.float(-5, 5), r.float(80, 240), 1.1, 0.2);
          }
          break;
        }
      } else {
        const p = game.player;
        const dx = p.x - s.x;
        const dy = p.y - s.y;
        if (p.live && dx * dx + dy * dy < FUSE * FUSE) { land(game, s); continue; }
      }
    }
    if (!s.live) continue;
    if (s.z <= 0 || s.life <= 0) land(game, s);
  }
}

// ── raiders and shore batteries ────────────────────────────────────────────────────────────

/** Put a raider in the water, out of sight, on the side of the player the map has room for. */
function spawnRaider(game: Game): void {
  let slot: Boat | undefined;
  for (const b of game.raiders) if (!b.live) { slot = b; break; }
  if (slot === undefined) return;
  const p = game.player;
  const r = game.rng;
  for (let attempt = 0; attempt < 24; attempt++) {
    const a = r.float(-1, 1);
    const b2 = r.float(-1, 1);
    const n = Math.sqrt(a * a + b2 * b2) || 1;
    const d = r.float(23, 31);
    const x = clamp(p.x + (a / n) * d, 3, MAP - 4);
    const y = clamp(p.y + (b2 / n) * d, 3, MAP - 4);
    if (onLand(game.world, x, y)) continue;
    slot.x = x; slot.y = y; slot.wx = x; slot.wy = y;
    const dx = p.x - x;
    const dy = p.y - y;
    const dn = Math.sqrt(dx * dx + dy * dy) || 1;
    slot.hx = dx / dn; slot.hy = dy / dn;
    slot.vx = slot.hx * 3; slot.vy = slot.hy * 3;
    slot.hull = 2; slot.reload = r.float(0.5, 2.5); slot.hurt = 0; slot.fire = 0;
    slot.sinking = -1; slot.seed = r.next(); slot.wake = 0; slot.live = true;
    return;
  }
}

/**
 * Raider behaviour, which is four lines of steering and one decision.
 *
 * They hold a stand-off ring rather than ramming, because a swarm that closes to zero range is a
 * swarm you cannot see past — and then they fire on a cooldown. The `cross` sign is the whole of
 * "which way do I turn", and it costs two multiplies.
 */
function stepRaiders(game: Game, dt: number): void {
  const p = game.player;
  for (const b of game.raiders) {
    if (!b.live) continue;

    if (b.sinking >= 0) {
      b.sinking += dt;
      b.vx *= 0.94;
      b.vy *= 0.94;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (game.rng.next() < dt * 6) {
        const r = game.rng;
        spawnMote(game, Puff.Smoke, b.x, b.y, 10, r.float(-1, 1), r.float(-1, 1), r.float(30, 70), 2.2, 0.5);
      }
      if (b.sinking > 2.6) b.live = false;
      continue;
    }

    if (b.fire > 0) {
      b.fire = Math.min(1, b.fire + dt * 0.22);
      b.hull -= dt * 0.55;
      if (game.rng.next() < dt * 5) {
        const r = game.rng;
        spawnMote(game, Puff.Ember, b.x, b.y, 14, r.float(-1.5, 1.5), r.float(-1.5, 1.5), r.float(60, 140), 1.6, 0.1);
      }
    }
    if (b.hurt > 0) b.hurt = Math.max(0, b.hurt - dt * 2.4);
    if (b.muzzle > 0) b.muzzle -= dt;

    if (b.hull <= 0) {
      b.sinking = 0;
      game.sunk++;
      game.hooks.sound('sink', b.x, b.y, 0.9);
      game.hooks.punch(7, 3, 0.045);
      continue;
    }

    const dx = p.x - b.x;
    const dy = p.y - b.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const tx = dx / dist;
    const ty = dy / dist;
    // Positive cross means the target is to port; the sign is the rudder.
    const cross = b.hx * ty - b.hy * tx;
    const facing = b.hx * tx + b.hy * ty;
    const rudder = clamp(cross * 3.2, -1, 1);
    // Close to the ring, then hold it. Sitting still would make them easy; the ring keeps them
    // moving across the player's aim, which is what makes the shooting interesting.
    const want = 9;
    const throttle = dist > want ? 1 : dist < want * 0.6 ? -0.4 : 0.25;
    drive(b, dt, throttle, rudder, THRUST * 0.62);
    shoreCheck(game, b, false);
    wake(game, b, dt);

    b.reload -= dt;
    if (b.reload <= 0 && dist < 14.5 && facing > 0.25) {
      b.reload = game.rng.float(3.1, 4.8);
      b.muzzle = 0.09;
      // Lead the shot by roughly the flight time, and then miss it a little on purpose. A
      // raider that solves the intercept exactly is a raider you cannot dodge, and a game whose
      // incoming fire cannot be dodged is a game about hull points rather than about steering.
      const lead = dist / (SHELL_SPEED * 0.62);
      const r = game.rng;
      launch(game, b.x, b.y,
        p.x + p.vx * lead * 0.62 + r.float(-1.4, 1.4),
        p.y + p.vy * lead * 0.62 + r.float(-1.4, 1.4), 1, 1.18);
      game.hooks.sound('cannon', b.x, b.y, 0.55);
    }

    // Contact. Cheap, and it stops the ring from being a place the player can park inside. The
    // push is strong and the damage is small: a raider that shoves is pressure, a raider that
    // grinds is a health bar draining for reasons the player cannot see.
    if (dist < 1.8) {
      const push = (1.8 - dist) * 26;
      b.vx -= tx * push * dt;
      b.vy -= ty * push * dt;
      p.vx += tx * push * dt * 0.7;
      p.vy += ty * push * dt * 0.7;
      p.hull -= dt * 4.5;
      if (p.hurt < 0.55) p.hurt = 0.55;
    }
  }
}

/** Shore batteries: turn toward the player, and lob one over when they are lined up. */
function stepBatteries(game: Game, dt: number): void {
  const p = game.player;
  for (const b of game.world.batteries) {
    if (b.hurt > 0) b.hurt = Math.max(0, b.hurt - dt * 1.6);
    if (b.hp <= 0) continue;
    const dx = p.x - b.gx;
    const dy = p.y - b.gy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    if (dist > 20) continue;
    const tx = dx / dist;
    const ty = dy / dist;
    // Turn the muzzle by the same trick the hulls use, slowly, so a player who is moving is a
    // player the gun is always a beat behind.
    const k = clamp((b.ax * ty - b.ay * tx) * 2.2 * dt, -0.06, 0.06);
    const nx = b.ax - k * b.ay;
    const ny = b.ay + k * b.ax;
    const inv = 1 / Math.sqrt(nx * nx + ny * ny);
    b.ax = nx * inv;
    b.ay = ny * inv;

    b.cd -= dt;
    if (b.cd <= 0 && b.ax * tx + b.ay * ty > 0.93) {
      b.cd = game.rng.float(4.6, 7.4);
      const lead = dist / (SHELL_SPEED * 0.62);
      const r = game.rng;
      launch(game, b.gx, b.gy,
        p.x + p.vx * lead * 0.66 + r.float(-1.6, 1.6),
        p.y + p.vy * lead * 0.66 + r.float(-1.6, 1.6), 1, 1.3);
      game.hooks.sound('cannon', b.gx, b.gy, 0.7);
      for (let i = 0; i < 3; i++) {
        spawnMote(game, Puff.Smoke, b.gx + b.ax, b.gy + b.ay, b.zPx + 12,
          b.ax * r.float(1, 3), b.ay * r.float(1, 3), r.float(10, 40), 0.9, 0.28);
      }
    }
  }
}

// ── particles ──────────────────────────────────────────────────────────────────────────────

/** Move every live particle. One switch, five behaviours, no allocation. */
function stepMotes(game: Game, dt: number): void {
  const w = game.world;
  for (const m of game.motes) {
    if (!m.live) continue;
    m.age += dt;
    if (m.age >= m.ttl) {
      m.live = false;
      continue;
    }
    switch (m.kind) {
      case Puff.Foam:
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.vx *= 0.965;
        m.vy *= 0.965;
        m.size += dt * 0.42;
        break;
      case Puff.Smoke:
        m.x += (m.vx + w.windX * 1.1) * dt;
        m.y += (m.vy + w.windY * 1.1) * dt;
        m.z += m.vz * dt;
        m.vz *= 0.985;
        m.size += dt * 0.75;
        break;
      case Puff.Ember:
        m.x += (m.vx + w.windX * 0.8) * dt;
        m.y += (m.vy + w.windY * 0.8) * dt;
        m.z += m.vz * dt;
        m.vz -= GRAVITY * 0.16 * dt;
        // An ember that lands on something dry lights it. This is the only path fire has across
        // open ground, and it is why the wind direction is worth reading off the smoke.
        if (m.z <= 0) {
          m.live = false;
          if (onLand(w, m.x, m.y)) scorch(game, m.x, m.y, 1.1, 0.5);
        }
        break;
      case Puff.Debris:
      case Puff.Spray:
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.z += m.vz * dt;
        m.vz -= GRAVITY * dt;
        if (m.z <= 0) {
          m.z = 0;
          m.vz = 0;
          m.vx *= 0.4;
          m.vy *= 0.4;
          if (m.kind === Puff.Spray && m.age < m.ttl - 0.15) m.age = m.ttl - 0.15;
        }
        break;
      default:
        break;
    }
  }
}

// ── the tick ───────────────────────────────────────────────────────────────────────────────

/**
 * One fixed step of the whole run.
 *
 * **Hit-stop is a skipped update, not a scaled one.** Scaling `dt` would make every integrator
 * in the file take a different-sized step during the freeze, and a fixed-step simulation whose
 * step is not fixed is a simulation that no longer replays. Skipping is exact: the world is
 * simply not there for four ticks, which is what a punch feels like anyway.
 */
export function stepGame(game: Game, dt: number): void {
  if (game.phase !== Phase.Playing) {
    // The world keeps burning after the last shot, because the end card over a still frame is a
    // worse ending than the end card over an island going up.
    game.flashAge += dt;
    stepFire(game, dt);
    stepMotes(game, dt);
    return;
  }
  if (game.stop > 0) {
    game.stop--;
    return;
  }
  game.t += dt;
  game.flashAge += dt;

  const p = game.player;
  if (p.live) {
    if (p.hurt > 0) p.hurt = Math.max(0, p.hurt - dt * 1.8);
    if (p.muzzle > 0) p.muzzle -= dt;
    p.reload -= dt;
    drive(p, dt, game.throttle, game.rudder, THRUST);
    shoreCheck(game, p, true);
    wake(game, p, dt);
    if (game.firing) fire(game);
  }

  stepRaiders(game, dt);
  stepBatteries(game, dt);
  stepShells(game, dt);
  stepFire(game, dt);
  stepMotes(game, dt);

  // Pressure. The fleet wakes as the islands burn, which is the whole escalation curve: the game
  // gets loudest exactly as you are winning it.
  const gone = game.total - game.left;
  game.spawn -= dt;
  let alive = 0;
  for (const b of game.raiders) if (b.live && b.sinking < 0) alive++;
  if (game.spawn <= 0) {
    game.spawn = Math.max(SPAWN_MIN, SPAWN_BASE - gone * 1.4);
    if (alive < 2 + gone * 1.4) spawnRaider(game);
  }

  if (game.left === 0) game.phase = Phase.Won;
  else if (p.hull <= 0) {
    p.hull = 0;
    p.live = false;
    game.phase = Phase.Lost;
    game.hooks.sound('sink', p.x, p.y, 1);
    game.hooks.punch(18, 5, 0.1);
  }
}
