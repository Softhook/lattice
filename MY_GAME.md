# Verdant — A Two-Player Split-Screen Living World

Verdant is a local cooperative, split-screen isometric game built on the Lattice kit.
Players cooperate to shape the world (dig and build), gather procedural resources, and defend against hostile nocturnal creatures.

## How to Run

1. Run the game development server from the root of the repository:
   ```bash
   npm run game
   ```
2. Open your browser to:
   [http://localhost:5174](http://localhost:5174)
3. To load a specific world seed, pass it in the query string:
   `http://localhost:5174?seed=12345`

---

## Controls Cheat Sheet

| Action | Player 1 (Left Viewport) | Player 2 (Right Viewport) |
|---|---|---|
| **Movement** | <kbd>W</kbd> / <kbd>A</kbd> / <kbd>S</kbd> / <kbd>D</kbd> (Continuous) | <kbd>I</kbd> / <kbd>J</kbd> / <kbd>K</kbd> / <kbd>L</kbd> (Continuous) |
| **Dig** | <kbd>Q</kbd> | <kbd>U</kbd> |
| **Raise** | <kbd>R</kbd> | <kbd>Y</kbd> |
| **Act** (harvest / attack / place) | <kbd>Space</kbd> | <kbd>N</kbd> |
| **Cycle Build Mode** | <kbd>E</kbd> or <kbd>F</kbd> | <kbd>O</kbd> or <kbd>H</kbd> |
| **Cycle Weapon** | <kbd>C</kbd> | <kbd>,</kbd> |
| **Craft / Equip Next Weapon** | <kbd>V</kbd> | <kbd>.</kbd> |

### Modes & Controls
- **Move Mode**: The Act key (<kbd>Space</kbd> / <kbd>N</kbd>) harvests resources from the facing tile (chopping trees for Wood, mining boulders for Stone, foraging bushes for Wood/Fiber), attacks a targeted creature, stokes a campfire, or repairs a damaged building — whichever the on-screen prompt is currently pointing at.
- **Dig / Raise**: <kbd>Q</kbd> / <kbd>U</kbd> digs down; <kbd>R</kbd> / <kbd>Y</kbd> raises terrain.
- **Build Mode**: The Act key (<kbd>Space</kbd> / <kbd>N</kbd>) places the selected structure if the player has the required materials:
  - **Wood Wall** (4 Wood): 1×1 solid timber palisade; blocks and keeps out animals.
  - **Stone Wall** (4 Stone): 1×1 heavy masonry fortification with high HP.
  - **Wood Tower** (12 Wood, 2 Stone): 2×2 timber lookout tower emitting lantern light at night.
  - **Stone Tower** (6 Wood, 14 Stone): 2×2 massive fortress tower with defensive lantern beacon.
  - **Floor** (2 Wood): 1×1 wooden plank decking and bridges.
  - Pressing <kbd>E</kbd>/<kbd>F</kbd> (P1) or <kbd>O</kbd>/<kbd>H</kbd> (P2) cycles through the building modes and returns to Move Mode.

---

## Technical Architecture

The game is modularized inside the `my-game/` workspace:

- **[main.ts](file:///Users/softhook/Documents/GitHub/lattice/my-game/src/main.ts)**: Orchestration and lifecycle: loop, cameras, audio, input, persistent storage, and tick wiring.
- **[world.ts](file:///Users/softhook/Documents/GitHub/lattice/my-game/src/world.ts)**: Heightfield grid math, seed-driven terrain generator (`core.fbm2`), and zero-allocation dig/raise vertex mutations.
- **[creatures.ts](file:///Users/softhook/Documents/GitHub/lattice/my-game/src/creatures.ts)**: AI wander/flee/chase state machine, boid repulsions, and generational evolution loop.
- **[buildings.ts](file:///Users/softhook/Documents/GitHub/lattice/my-game/src/buildings.ts)**: Definition, massings, costs, and footprint collision validation of constructible structures.
- **[players.ts](file:///Users/softhook/Documents/GitHub/lattice/my-game/src/players.ts)**: Player stats, continuous movement physics, combat, and action dispatch.
- **[combat.ts](file:///Users/softhook/Documents/GitHub/lattice/my-game/src/combat.ts)**: Weapon definitions, zero-allocation projectile ballistics, melee hit resolution, and combat/harvest visual FX pooling.
- **[flora.ts](file:///Users/softhook/Documents/GitHub/lattice/my-game/src/flora.ts)**: Procedural trees, shrubs, flowers, rocks, harvesting yields, and ecosystem regrowth.
- **[audio.ts](file:///Users/softhook/Documents/GitHub/lattice/my-game/src/audio.ts)**: Zero-asset procedural WebAudio sound synthesizer and dynamic day/night ambient drone bed via `@latticekit/audio`.
- **[storage.ts](file:///Users/softhook/Documents/GitHub/lattice/my-game/src/storage.ts)**: Versioned save/load schema and autosave integration via `@latticekit/persist`.
- **[input.ts](file:///Users/softhook/Documents/GitHub/lattice/my-game/src/input.ts)**: Zero-allocation continuous key held polling and edge-trigger action checks.
- **[hud.ts](file:///Users/softhook/Documents/GitHub/lattice/my-game/src/hud.ts)**: Zero-allocation in-canvas UI cards, health bars, inventory badges, and respawn banners.
- **[sprites.ts](file:///Users/softhook/Documents/GitHub/lattice/my-game/src/sprites.ts)**: Procedural, zero-asset render definitions (`SpriteDef`) for all players and creatures.
- **[render.ts](file:///Users/softhook/Documents/GitHub/lattice/my-game/src/render.ts)**: Split-screen multi-pass renderer & depth sorting pipeline without per-frame garbage.
- **[spatial.ts](file:///Users/softhook/Documents/GitHub/lattice/my-game/src/spatial.ts)**: Zero-allocation uniform-grid spatial index, shared by creatures and flora for $O(1)$ neighborhood queries instead of $O(N^2)$ brute force.
- **[ambient.ts](file:///Users/softhook/Documents/GitHub/lattice/my-game/src/ambient.ts)**: Atmospheric particles: soaring birds, night fireflies, floating motes, and watchtower beacon smoke.
- **[sky.ts](file:///Users/softhook/Documents/GitHub/lattice/my-game/src/sky.ts)**: Celestial backdrop, sun/moon arcs, stars, and distant parallax mountain horizon ranges.
- **[palette.ts](file:///Users/softhook/Documents/GitHub/lattice/my-game/src/palette.ts)**: Color constants for terrain biomes, species, and day/night transitions.

---

## Lattice Kit References

- Constitutions and Rules: [`AGENTS.md`](file:///Users/softhook/Documents/GitHub/lattice/AGENTS.md)
- Core API: [`packages/core/src/index.ts`](file:///Users/softhook/Documents/GitHub/lattice/packages/core/src/index.ts)
- Iso API: [`packages/iso/src/index.ts`](file:///Users/softhook/Documents/GitHub/lattice/packages/iso/src/index.ts)
- Draw API: [`packages/draw/src/index.ts`](file:///Users/softhook/Documents/GitHub/lattice/packages/draw/src/index.ts)
- Audio API: [`packages/audio/src/index.ts`](file:///Users/softhook/Documents/GitHub/lattice/packages/audio/src/index.ts)
- Persist API: [`packages/persist/src/index.ts`](file:///Users/softhook/Documents/GitHub/lattice/packages/persist/src/index.ts)
- Loop API: [`packages/loop/src/index.ts`](file:///Users/softhook/Documents/GitHub/lattice/packages/loop/src/index.ts)
- Input API: [`packages/input/src/index.ts`](file:///Users/softhook/Documents/GitHub/lattice/packages/input/src/index.ts)
