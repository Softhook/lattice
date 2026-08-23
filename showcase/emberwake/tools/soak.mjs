#!/usr/bin/env node
/**
 * **Play the game with no browser.** A crude autopilot, two hundred and forty seconds of virtual
 * time, and a printed shape of the run.
 *
 * This exists because balance is the one thing a screenshot cannot show and a capture is too slow
 * to iterate on: a four-minute run films in twelve minutes of wall clock and simulates here in
 * about a second. It also proves something the kit claims and nothing else in this game checks —
 * **`world.ts` and `game.ts` touch no DOM at all.** They import `@latticekit/core` and
 * `@latticekit/iso`, both isomorphic, and they run unchanged in Node with no shims.
 *
 * ```bash
 * npx tsc -p showcase/emberwake/tsconfig.json
 * node showcase/emberwake/tools/soak.mjs               # the default seed
 * node showcase/emberwake/tools/soak.mjs harbourlight  # any other
 * ```
 */
import { createRng } from '@latticekit/core';
import { Burn, Kind, createWorld } from '../dist-ts/world.js';
import { HULL, Phase, createGame, stepGame } from '../dist-ts/game.js';

const seed = process.argv[2] ?? 'emberwake';
const world = createWorld(createRng(seed));
const counts = {};
for (const p of world.props) counts[p.kind] = (counts[p.kind] ?? 0) + 1;
console.log(
  `seed ${seed}: ${String(world.props.length)} props ${JSON.stringify(counts)}, ` +
  `${String(world.batteries.length)} batteries, ${String(world.islands.length)} islands, ` +
  `wind ${world.windX.toFixed(2)},${world.windY.toFixed(2)}`,
);

let sounds = 0;
let shakes = 0;
const tally = {};
const game = createGame(world, createRng(`${seed}:run`), {
  sound: (name) => { sounds++; tally[name] = (tally[name] ?? 0) + 1; },
  punch: () => { shakes++; },
});

const dt = 1 / 60;
let left = game.left;
let worstHull = HULL;
for (let tick = 0; tick < 60 * 240; tick++) {
  // The autopilot: run at the nearest standing magazine, hold nine tiles off, and fire.
  const p = game.player;
  let best;
  let bestD = 1e9;
  for (const q of world.props) {
    if (q.kind !== Kind.Magazine || q.state === Burn.Spent) continue;
    const d = Math.hypot(q.gx - p.x, q.gy - p.y);
    if (d < bestD) { bestD = d; best = q; }
  }
  // A raider inside seven and a half tiles is the thing that is actually shooting at you, so it is the
  // thing a competent player shoots first. Without this the pilot ignores the fleet entirely and
  // the run measures the game's patience rather than its balance.
  let threat;
  let threatD = 7.5;
  for (const b of game.raiders) {
    if (!b.live || b.sinking >= 0) continue;
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (d < threatD) { threatD = d; threat = b; }
  }

  if (best !== undefined) {
    // **Orbit, do not charge.** A pilot that steers straight at the target and parks is a pilot
    // that eats every shell fired at it, and tuning the game against one would produce a game
    // nobody can lose. The heading wanted is the bearing to the magazine turned most of a right
    // angle, pulled inward when it is far and outward when it is close — which is what a person
    // does within ten seconds of playing.
    const ux = (best.gx - p.x) / (bestD || 1);
    const uy = (best.gy - p.y) / (bestD || 1);
    const pull = Math.max(-0.9, Math.min(0.9, (bestD - 10) * 0.16));
    const wx = -uy * 0.8 + ux * pull;
    const wy = ux * 0.8 + uy * pull;
    const n = Math.hypot(wx, wy) || 1;
    game.rudder = Math.max(-1, Math.min(1, (p.hx * (wy / n) - p.hy * (wx / n)) * 3));
    game.throttle = 1;
    if (threat !== undefined) {
      // Lead the target by the shell's own flight time, which is the same sum the raiders do.
      const flight = threatD / 27;
      game.aimX = threat.x + threat.vx * flight;
      game.aimY = threat.y + threat.vy * flight;
      game.firing = true;
    } else {
      game.aimX = best.gx;
      game.aimY = best.gy;
      game.firing = bestD < 15;
    }
  }
  stepGame(game, dt);
  if (p.hull < worstHull) worstHull = p.hull;
  if (game.left !== left) {
    left = game.left;
    console.log(
      `  ${game.t.toFixed(1).padStart(6)}s  magazine down, ${String(left)} left  ` +
      `hull ${p.hull.toFixed(0)}  burned ${String(game.burned)}  sunk ${String(game.sunk)}`,
    );
  }
  if (game.phase !== Phase.Playing) break;
  if (!Number.isFinite(p.x)) { console.log(`NaN position at tick ${String(tick)}`); break; }
}

const verdict = game.phase === Phase.Won ? 'WON' : game.phase === Phase.Lost ? 'LOST' : 'UNFINISHED';
console.log(
  `${verdict} at ${game.t.toFixed(1)}s — hull ${game.player.hull.toFixed(0)} (worst ${worstHull.toFixed(0)}), ` +
  `${String(game.burned)} burned, ${String(game.sunk)} sunk, ${String(sounds)} sounds, ${String(shakes)} shakes`,
);
console.log('  events', JSON.stringify(tally));
