# Verdant — A Two-Player Split-Screen Living World

Verdant is a local cooperative, split-screen isometric game built on the Lattice kit.
Players cooperate to shape the world (dig and build) and defend against hostile creatures.

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
| **Dig / Action** | <kbd>Q</kbd> | <kbd>U</kbd> |
| **Build / Action** | <kbd>E</kbd> | <kbd>O</kbd> |
| **Switch Mode** | <kbd>F</kbd> | <kbd>H</kbd> |

### Modes
- **Move Mode**: Normal movement. Action keys do nothing.
- **Dig Mode**: Action keys dig the tile the player is currently facing, lowering the terrain.
- **Build Mode**: Action keys place the selected structure at the facing tile:
  - **Wall**: Block that blocks movement and shields players.
  - **Floor**: Platform for walking and bridges.
  - **Tower**: Large structure; trolls attack towers first.
  - **Ramp**: Sloped platform allowing players to walk up dug cliffs.
  - Pressing <kbd>F</kbd> / <kbd>H</kbd> cycles through the building types before returning to Move Mode.

---

## Technical Architecture

The game is modularized inside the `my-game/` workspace:

- **[main.ts](file:///Users/softhook/Documents/GitHub/lattice/my-game/src/main.ts)**: The bootstrapping and game loop wiring. Sets up cameras, input, world state, and day/night cycle.
- **[world.ts](file:///Users/softhook/Documents/GitHub/lattice/my-game/src/world.ts)**: Heightfield grid math, seed-driven terrain generator (`core.fbm2`), and dig/raise vertex mutations.
- **[creatures.ts](file:///Users/softhook/Documents/GitHub/lattice/my-game/src/creatures.ts)**: AI wander/flee/chase state machine, and the generational evolution loop.
- **[buildings.ts](file:///Users/softhook/Documents/GitHub/lattice/my-game/src/buildings.ts)**: Definition and footprint validation of constructible elements.
- **[players.ts](file:///Users/softhook/Documents/GitHub/lattice/my-game/src/players.ts)**: Player stats, movement physics, and action dispatch.
- **[input.ts](file:///Users/softhook/Documents/GitHub/lattice/my-game/src/input.ts)**: Continuous key held polling and edge-trigger action checks.
- **[sprites.ts](file:///Users/softhook/Documents/GitHub/lattice/my-game/src/sprites.ts)**: Procedural, zero-asset render definitions (`SpriteDef`) for all entities.
- **[render.ts](file:///Users/softhook/Documents/GitHub/lattice/my-game/src/render.ts)**: Split-screen clip rendering, camera follow, and day/night light composition.
- **[palette.ts](file:///Users/softhook/Documents/GitHub/lattice/my-game/src/palette.ts)**: Color constants for terrain biomes, species, and day/night transitions.

---

## Lattice Kit References

- Constitutions and Rules: [`AGENTS.md`](file:///Users/softhook/Documents/GitHub/lattice/AGENTS.md)
- Core API: [`packages/core/src/index.ts`](file:///Users/softhook/Documents/GitHub/lattice/packages/core/src/index.ts)
- Iso API: [`packages/iso/src/index.ts`](file:///Users/softhook/Documents/GitHub/lattice/packages/iso/src/index.ts)
- Draw API: [`packages/draw/src/index.ts`](file:///Users/softhook/Documents/GitHub/lattice/packages/draw/src/index.ts)
