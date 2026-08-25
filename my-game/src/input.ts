/**
 * Keyboard input for two players.
 *
 * Player movement is continuous (held-key), tracked in a set.
 * Actions (dig, raise, attack/place, toggle inventory) use rising-edge detection so they fire
 * once per press.
 *
 * Designed to allocate ZERO objects on the 60 Hz simulation tick:
 * - Movement writes into caller-supplied out-parameters.
 * - Action edge detection reuses a static ActionEdges struct (one `PlayerActionEdges` per player,
 *   never reallocated — see `edges.p[0]` / `edges.p[1]`).
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
 * keys re-purpose as up/down/left/right navigation (`navUp` etc. below) instead of moving the
 * player, and Space/N confirms the highlighted entry.
 */

export interface KeyState {
  readonly held: Set<string>;
}

export interface Vec2Out {
  dx: number;
  dy: number;
}

/** Rising-edge action signals for one player. Both players share this shape — see `KEY_MAPS` —
 *  so the dispatch logic that consumes it (`main.ts`) is written once and run twice. */
export interface PlayerActionEdges {
  dig: boolean;
  raise: boolean;
  /** Interact/attack when nothing is armed, or place the armed build kind — see the key layout
   *  note above. Also confirms the highlighted row while the Inventory overlay is open. */
  attack: boolean;
  /** Open/close the Inventory overlay. Bound to two keys (C/V or ,/.) — either fires this. */
  invToggle: boolean;
  navUp: boolean;
  navDown: boolean;
  navLeft: boolean;
  navRight: boolean;
}

function createPlayerActionEdges(): PlayerActionEdges {
  return {
    dig: false,
    raise: false,
    attack: false,
    invToggle: false,
    navUp: false,
    navDown: false,
    navLeft: false,
    navRight: false,
  };
}

/** Rising-edge action signals for both players, indexed by player number (`p[0]` is Player 1). */
export interface ActionEdges {
  readonly p: readonly [PlayerActionEdges, PlayerActionEdges];
}

export function createActionEdges(): ActionEdges {
  return { p: [createPlayerActionEdges(), createPlayerActionEdges()] };
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

/** The `KeyboardEvent.code`s bound to one player's actions — the single source of truth `Key
 *  layout` above is generated from. */
interface PlayerKeyMap {
  readonly dig: string;
  readonly raise: string;
  readonly attack: string;
  readonly invToggleA: string;
  readonly invToggleB: string;
  readonly navUp: string;
  readonly navDown: string;
  readonly navLeft: string;
  readonly navRight: string;
}

const P1_KEYS: PlayerKeyMap = {
  dig: 'KeyQ', raise: 'KeyR', attack: 'Space',
  invToggleA: 'KeyC', invToggleB: 'KeyV',
  navUp: 'KeyW', navDown: 'KeyS', navLeft: 'KeyA', navRight: 'KeyD',
};

const P2_KEYS: PlayerKeyMap = {
  dig: 'KeyU', raise: 'KeyY', attack: 'KeyN',
  invToggleA: 'Comma', invToggleB: 'Period',
  navUp: 'KeyI', navDown: 'KeyK', navLeft: 'KeyJ', navRight: 'KeyL',
};

/** Compute one player's rising-edge action signals into the reusable `out` struct. */
function pollPlayerActions(
  prev: ReadonlySet<string>,
  curr: ReadonlySet<string>,
  keys: PlayerKeyMap,
  out: PlayerActionEdges,
): void {
  out.dig    = curr.has(keys.dig) && !prev.has(keys.dig);
  out.raise  = curr.has(keys.raise) && !prev.has(keys.raise);
  out.attack = curr.has(keys.attack) && !prev.has(keys.attack);
  out.invToggle =
    (curr.has(keys.invToggleA) && !prev.has(keys.invToggleA)) ||
    (curr.has(keys.invToggleB) && !prev.has(keys.invToggleB));
  out.navUp    = curr.has(keys.navUp) && !prev.has(keys.navUp);
  out.navDown  = curr.has(keys.navDown) && !prev.has(keys.navDown);
  out.navLeft  = curr.has(keys.navLeft) && !prev.has(keys.navLeft);
  out.navRight = curr.has(keys.navRight) && !prev.has(keys.navRight);
}

/** Compute rising-edge action signals for both players into the reusable `out` struct. */
export function pollActions(
  prev: ReadonlySet<string>,
  curr: ReadonlySet<string>,
  out: ActionEdges,
): void {
  pollPlayerActions(prev, curr, P1_KEYS, out.p[0]);
  pollPlayerActions(prev, curr, P2_KEYS, out.p[1]);
}

/** Copy current held set into `target` Set in-place without reallocating. */
export function copyKeys(source: ReadonlySet<string>, target: Set<string>): void {
  target.clear();
  for (const k of source) {
    target.add(k);
  }
}
