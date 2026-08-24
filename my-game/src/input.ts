/**
 * Keyboard input for two players.
 *
 * Player movement is continuous (held-key), tracked in a set.
 * Actions (dig, raise, build, cycle tool) use rising-edge detection so they fire once per press.
 *
 * Designed to allocate ZERO objects on the 60 Hz simulation tick:
 * - Movement writes into caller-supplied out-parameters.
 * - Action edge detection reuses a static ActionEdges struct.
 * - Key snapshotting copies into a reusable Set without allocations.
 *
 * Key layout:
 *
 *   Player 1 (Left Viewport)       Player 2 (Right Viewport)
 *   W / S    → move N / S          I / K    → move N / S
 *   A / D    → move W / E          J / L    → move W / E
 *   Q        → Dig ground          U        → Dig ground
 *   R        → Raise ground        Y        → Raise ground
 *   E        → Build / Harvest     O        → Build / Harvest
 *   F        → Cycle building      H        → Cycle building
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
  p1Build: boolean;
  p1Cycle: boolean;

  p2Dig: boolean;
  p2Raise: boolean;
  p2Build: boolean;
  p2Cycle: boolean;
}

export function createActionEdges(): ActionEdges {
  return {
    p1Dig: false,
    p1Raise: false,
    p1Build: false,
    p1Cycle: false,
    p2Dig: false,
    p2Raise: false,
    p2Build: false,
    p2Cycle: false,
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
  out.p1Build = curr.has('KeyE') && !prev.has('KeyE');
  out.p1Cycle = curr.has('KeyF') && !prev.has('KeyF');

  out.p2Dig   = curr.has('KeyU') && !prev.has('KeyU');
  out.p2Raise = curr.has('KeyY') && !prev.has('KeyY');
  out.p2Build = curr.has('KeyO') && !prev.has('KeyO');
  out.p2Cycle = curr.has('KeyH') && !prev.has('KeyH');
}

/** Copy current held set into `target` Set in-place without reallocating. */
export function copyKeys(source: ReadonlySet<string>, target: Set<string>): void {
  target.clear();
  for (const k of source) {
    target.add(k);
  }
}
