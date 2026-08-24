/**
 * Keyboard input for two players.
 *
 * Player movement is continuous (held-key), so we track currently held keys in a Set
 * rather than using @latticekit/input's action system (which is event-based).
 *
 * @latticekit/input handles pointer and camera for each viewport.
 *
 * Key layout (chosen to avoid overlap and keep both hands on natural positions):
 *
 *   Player 1              Player 2
 *   W / S  → move N / S   I / K  → move N / S
 *   A / D  → move W / E   J / L  → move W / E
 *   Q      → dig action    U      → dig action
 *   E      → build action  O      → build action
 *   F      → switch mode   H      → switch mode
 */

export interface KeyState {
  readonly held: Set<string>;
}

/** Create and attach keyboard listeners to the document. Returns a disposer. */
export function createKeyState(): { state: KeyState; dispose: () => void } {
  const held = new Set<string>();
  const onDown = (e: KeyboardEvent) => {
    // Ignore if focus is in an input field.
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    held.add(e.code);
  };
  const onUp   = (e: KeyboardEvent) => { held.delete(e.code); };
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
//
// Actions (dig, build) fire once per keydown, not continuously.
// We track which action keys were held last tick to compute rising edges.

export interface ActionEdges {
  /** True on the first tick a key is held (rising edge). */
  p1Action: boolean;
  p2Action: boolean;
  p1Mode: boolean;
  p2Mode: boolean;
}

/**
 * Compute rising-edge action signals.
 *
 * `prev` is the set from the previous tick; `curr` is the current held set.
 * A rising edge is a key in `curr` that was NOT in `prev`.
 */
export function pollActions(prev: Set<string>, curr: Set<string>): ActionEdges {
  return {
    p1Action: (curr.has('KeyQ') && !prev.has('KeyQ')) || (curr.has('KeyE') && !prev.has('KeyE')),
    p2Action: (curr.has('KeyU') && !prev.has('KeyU')) || (curr.has('KeyO') && !prev.has('KeyO')),
    p1Mode:   curr.has('KeyF') && !prev.has('KeyF'),
    p2Mode:   curr.has('KeyH') && !prev.has('KeyH'),
  };
}

/** Snapshot the current held set for next-tick edge detection. */
export function snapshotKeys(held: Set<string>): Set<string> {
  return new Set(held);
}

// ── Action type disambiguation ─────────────────────────────────────────────────

/** True if Player 1's action key this tick was the "dig" key (Q). */
export function isP1Dig(curr: Set<string>, prev: Set<string>): boolean {
  return curr.has('KeyQ') && !prev.has('KeyQ');
}

/** True if Player 2's action key this tick was the "dig" key (U). */
export function isP2Dig(curr: Set<string>, prev: Set<string>): boolean {
  return curr.has('KeyU') && !prev.has('KeyU');
}
