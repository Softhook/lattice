/**
 * Keyboard input for two players.
 *
 * Player movement is continuous (held-key), tracked in a set.
 * Actions (dig, raise, build, toggle inventory) use rising-edge detection so they fire once per press.
 *
 * Designed to allocate ZERO objects on the 60 Hz simulation tick:
 * - Movement writes into caller-supplied out-parameters.
 * - Action edge detection reuses a static ActionEdges struct.
 * - Key snapshotting copies into a reusable Set without allocations.
 *
 * Key layout:
 *
 *   Player 1 (Left Viewport)         Player 2 (Right Viewport)
 *   W / S    → move N / S            I / K    → move N / S
 *   A / D    → move W / E            J / L    → move W / E
 *   Q        → Dig ground            U        → Dig ground
 *   R        → Raise ground          Y        → Raise ground
 *   Space    → Interact / Attack /   N        → Interact / Attack /
 *              Place armed building             Place armed building
 *   C or V   → Open/close Inventory  , or .   → Open/close Inventory
 *
 * Space/N is one contextual button: it places the currently armed build kind if one is armed,
 * otherwise it's interact-or-attack. What to build and which weapon to equip is chosen ahead of
 * time in the Inventory overlay (C/V, ,/.) — not by cycling through options in the world — so a
 * player is never mid-decision when a fight starts. While the Inventory is open, the movement
 * keys re-purpose as up/down/left/right navigation (see `pNavUp` etc. below) instead of moving
 * the player, and Space/N confirms the highlighted entry.
 */

export interface KeyState {
  readonly held: Set<string>;
}

export interface Vec2Out {
  dx: number;
  dy: number;
}

export interface ActionEdges {
  p1Dig: boolean;
  p1Raise: boolean;
  p1Attack: boolean;
  p1InvToggle: boolean;
  p1NavUp: boolean;
  p1NavDown: boolean;
  p1NavLeft: boolean;
  p1NavRight: boolean;

  p2Dig: boolean;
  p2Raise: boolean;
  p2Attack: boolean;
  p2InvToggle: boolean;
  p2NavUp: boolean;
  p2NavDown: boolean;
  p2NavLeft: boolean;
  p2NavRight: boolean;
}

export function createActionEdges(): ActionEdges {
  return {
    p1Dig: false,
    p1Raise: false,
    p1Attack: false,
    p1InvToggle: false,
    p1NavUp: false,
    p1NavDown: false,
    p1NavLeft: false,
    p1NavRight: false,

    p2Dig: false,
    p2Raise: false,
    p2Attack: false,
    p2InvToggle: false,
    p2NavUp: false,
    p2NavDown: false,
    p2NavLeft: false,
    p2NavRight: false,
  };
}

/** Create and attach keyboard listeners to the document. Returns a disposer. */
export function createKeyState(): { state: KeyState; dispose: () => void } {
  const held = new Set<string>();
  const onDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    held.add(e.code);
  };
  const onUp = (e: KeyboardEvent) => {
    held.delete(e.code);
  };
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

// ── Movement polls (Zero-allocation) ──────────────────────────────────────────

/** Poll movement directions for Player 1 into an out-parameter. */
export function pollP1Movement(keys: ReadonlySet<string>, out: Vec2Out): void {
  let dx = 0;
  let dy = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft'))  dx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp'))    dy -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown'))  dy += 1;
  out.dx = dx;
  out.dy = dy;
}

/** Poll movement directions for Player 2 into an out-parameter. */
export function pollP2Movement(keys: ReadonlySet<string>, out: Vec2Out): void {
  let dx = 0;
  let dy = 0;
  if (keys.has('KeyJ')) dx -= 1;
  if (keys.has('KeyL')) dx += 1;
  if (keys.has('KeyI')) dy -= 1;
  if (keys.has('KeyK')) dy += 1;
  out.dx = dx;
  out.dy = dy;
}

// ── Action edge detection (Zero-allocation) ───────────────────────────────────

/**
 * Compute rising-edge action signals into the reusable `out` struct.
 */
export function pollActions(
  prev: ReadonlySet<string>,
  curr: ReadonlySet<string>,
  out: ActionEdges,
): void {
  out.p1Dig   = curr.has('KeyQ') && !prev.has('KeyQ');
  out.p1Raise = curr.has('KeyR') && !prev.has('KeyR');
  out.p1Attack = curr.has('Space') && !prev.has('Space');
  out.p1InvToggle =
    (curr.has('KeyC') && !prev.has('KeyC')) ||
    (curr.has('KeyV') && !prev.has('KeyV'));
  out.p1NavUp    = curr.has('KeyW') && !prev.has('KeyW');
  out.p1NavDown  = curr.has('KeyS') && !prev.has('KeyS');
  out.p1NavLeft  = curr.has('KeyA') && !prev.has('KeyA');
  out.p1NavRight = curr.has('KeyD') && !prev.has('KeyD');

  out.p2Dig   = curr.has('KeyU') && !prev.has('KeyU');
  out.p2Raise = curr.has('KeyY') && !prev.has('KeyY');
  out.p2Attack = curr.has('KeyN') && !prev.has('KeyN');
  out.p2InvToggle =
    (curr.has('Comma') && !prev.has('Comma')) ||
    (curr.has('Period') && !prev.has('Period'));
  out.p2NavUp    = curr.has('KeyI') && !prev.has('KeyI');
  out.p2NavDown  = curr.has('KeyK') && !prev.has('KeyK');
  out.p2NavLeft  = curr.has('KeyJ') && !prev.has('KeyJ');
  out.p2NavRight = curr.has('KeyL') && !prev.has('KeyL');
}

/** Copy current held set into `target` Set in-place without reallocating. */
export function copyKeys(source: ReadonlySet<string>, target: Set<string>): void {
  target.clear();
  for (const k of source) {
    target.add(k);
  }
}
