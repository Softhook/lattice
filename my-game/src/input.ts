/**
 * Keyboard input for two players.
 *
 * Player movement is continuous (held-key), so we track currently held keys in a Set.
 * Actions (dig, raise, build, cycle tool) use rising-edge detection so they fire once per press.
 *
 * Key layout:
 *
 *   Player 1 (Left Viewport)       Player 2 (Right Viewport)
 *   W / S    → move N / S          I / K    → move N / S
 *   A / D    → move W / E          J / L    → move W / E
 *   Q        → Dig ground          U        → Dig ground
 *   R        → Raise ground        Y        → Raise ground
 *   E        → Build structure     O        → Build structure
 *   F        → Cycle building      H        → Cycle building
 */

export interface KeyState {
  readonly held: Set<string>;
}

/** Create and attach keyboard listeners to the document. Returns a disposer. */
export function createKeyState(): { state: KeyState; dispose: () => void } {
  const held = new Set<string>();
  const onDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    held.add(e.code);
  };
  const onUp = (e: KeyboardEvent) => { held.delete(e.code); };
  document.addEventListener('keydown', onDown);
  document.addEventListener('keyup',   onUp);
  return {
    state:   { held },
    dispose: () => {
      document.removeEventListener('keydown', onDown);
      document.removeEventListener('keyup',   onUp);
    },
  };
}

// ── Movement polls ─────────────────────────────────────────────────────────────

/** -1, 0, or +1 in each axis for Player 1 this tick. */
export function pollP1Movement(keys: Set<string>): { dx: number; dy: number } {
  let dx = 0;
  let dy = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft'))  dx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp'))    dy -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown'))  dy += 1;
  return { dx, dy };
}

/** -1, 0, or +1 in each axis for Player 2 this tick. */
export function pollP2Movement(keys: Set<string>): { dx: number; dy: number } {
  let dx = 0;
  let dy = 0;
  if (keys.has('KeyJ')) dx -= 1;
  if (keys.has('KeyL')) dx += 1;
  if (keys.has('KeyI')) dy -= 1;
  if (keys.has('KeyK')) dy += 1;
  return { dx, dy };
}

// ── Action edge detection ──────────────────────────────────────────────────────

export interface ActionEdges {
  p1Dig: boolean;
  p1Raise: boolean;
  p1Build: boolean;
  p1Cycle: boolean;

  p2Dig: boolean;
  p2Raise: boolean;
  p2Build: boolean;
  p2Cycle: boolean;
}

/**
 * Compute rising-edge action signals.
 *
 * `prev` is the set from the previous tick; `curr` is the current held set.
 */
export function pollActions(prev: Set<string>, curr: Set<string>): ActionEdges {
  return {
    p1Dig:   curr.has('KeyQ') && !prev.has('KeyQ'),
    p1Raise: curr.has('KeyR') && !prev.has('KeyR'),
    p1Build: curr.has('KeyE') && !prev.has('KeyE'),
    p1Cycle: curr.has('KeyF') && !prev.has('KeyF'),

    p2Dig:   curr.has('KeyU') && !prev.has('KeyU'),
    p2Raise: curr.has('KeyY') && !prev.has('KeyY'),
    p2Build: curr.has('KeyO') && !prev.has('KeyO'),
    p2Cycle: curr.has('KeyH') && !prev.has('KeyH'),
  };
}

/** Snapshot the current held set for next-tick edge detection. */
export function snapshotKeys(held: Set<string>): Set<string> {
  return new Set(held);
}
