/**
 * Gamepad support for a single player — DOM-impure by design; touches `navigator`, `window`,
 * and `document`. Nothing in this file should run in Node.
 *
 * Two-channel design, matching how the game's input pipeline is split:
 *
 * 1. **Keyboard bridge** — discrete one-shot actions (attack, dig, raise, inventory) fire
 *    synthetic `KeyboardEvent`s on `document`. `createKeyState`'s `keydown`/`keyup` listeners
 *    are attached to `document`, so they receive these events without any modification.
 *    The existing `pollActions` rising-edge detection then handles gamepad button presses
 *    exactly as it handles key presses — no changes to the action system required.
 *
 *    Why `document`, not `window`: DOM events bubble *upward*. Dispatching on `window` has
 *    nowhere to propagate to, so `document` listeners never see it. Dispatching on `document`
 *    bubbles up to `window`, reaching both.
 *
 * 2. **Analog stick read** — `readStick(out)` writes left-stick x/y directly into a caller-
 *    supplied out-param each tick. The keyboard bridge cannot carry magnitude — a held-key Set
 *    is boolean — so the direct numeric read is the only honest path for analog movement.
 *
 * To add a second player's gamepad, instantiate `PlayerGamepad` a second time with
 * `gamepadIndex: 1` and the matching `keyMap` and `playerLabel`.
 */

import type { Vec2Out } from './input.js';

// ── Controller layout maps ─────────────────────────────────────────────────────
//
// Three hardware families, differentiated at connect-time by `id` string heuristics.
// Every field that does not exist on a given layout is -1; callers guard with `idx >= 0`.

interface ControllerMap {
  readonly name: string;
  // Face buttons (South / East / West / North in W3C Gamepad terminology)
  readonly A: number; readonly B: number; readonly X: number; readonly Y: number;
  // Shoulder bumpers
  readonly L1: number; readonly R1: number;
  // Triggers as digital buttons (-1 when the layout has no trigger button)
  readonly L2_BTN: number; readonly R2_BTN: number;
  // D-pad: discrete button indices for standard layouts, or -1 when a HAT axis is used instead
  readonly D_UP: number; readonly D_DOWN: number; readonly D_LEFT: number; readonly D_RIGHT: number;
  // HAT axis index: single axis that encodes all 8 D-pad directions as a float (-1 = not used)
  readonly HAT: number;
  // Left and right stick axis indices
  readonly LX: number; readonly LY: number; readonly RX: number; readonly RY: number;
  // System buttons
  readonly SELECT: number; readonly START: number; readonly HOME: number;
  readonly L3: number; readonly R3: number;
}

const CONTROLLER_MAPS = {
  // Standard mapping (Xbox / most modern controllers with mapping:"standard")
  X: {
    name: 'X-MODE (Xbox/standard)',
    A: 0, B: 1, X: 2, Y: 3, L1: 4, R1: 5, L2_BTN: 6, R2_BTN: 7,
    D_UP: 12, D_DOWN: 13, D_LEFT: 14, D_RIGHT: 15, HAT: -1,
    LX: 0, LY: 1, RX: 2, RY: 3,
    SELECT: 8, START: 9, HOME: 16, L3: 10, R3: 11,
  },
  // Generic non-standard gamepads (PS-like USB pads, cheap third-party controllers).
  // Most HID stacks report face buttons at 0-3, bumpers at 4-5, triggers at 6-7,
  // select=8, start=9, stick clicks=10-11. HAT switch (D-pad encoded as one axis
  // value) is typically on axis 9 when present — if that axis is absent the D-pad
  // simply reads as all-false and movement falls back to the analog stick.
  D: {
    name: 'D-MODE (generic)',
    A: 0, B: 1, X: 2, Y: 3, L1: 4, R1: 5, L2_BTN: 6, R2_BTN: 7,
    D_UP: -1, D_DOWN: -1, D_LEFT: -1, D_RIGHT: -1, HAT: 9,
    LX: 0, LY: 1, RX: 2, RY: 3,
    SELECT: 8, START: 9, HOME: -1, L3: 10, R3: 11,
  },
  // Nintendo Switch Pro Controller / Joy-Con (A/B swapped vs Xbox convention)
  S: {
    name: 'S-MODE (Switch)',
    A: 1, B: 0, X: 3, Y: 2, L1: 4, R1: 5, L2_BTN: 6, R2_BTN: 7,
    D_UP: 12, D_DOWN: 13, D_LEFT: 14, D_RIGHT: 15, HAT: -1,
    LX: 0, LY: 1, RX: 2, RY: 3,
    SELECT: 8, START: 9, HOME: 17, L3: 10, R3: 11,
  },
} as const satisfies Record<string, ControllerMap>;

// ── Key bindings ───────────────────────────────────────────────────────────────
//
// Maps a player's logical gamepad actions to the `KeyboardEvent.code` strings the bridge
// synthesises. Must mirror the corresponding `PlayerKeyMap` constants in `input.ts`.

export interface GamepadKeyMap {
  /** Interact / attack / place armed building. */
  readonly attack: string;
  /** Dig ground. */
  readonly dig: string;
  /** Raise ground. */
  readonly raise: string;
  /** Open/close the Inventory overlay. */
  readonly invToggle: string;
  /** D-pad / nav up (also used as inventory nav while overlay is open). */
  readonly navUp: string;
  /** D-pad / nav down. */
  readonly navDown: string;
  /** D-pad / nav left. */
  readonly navLeft: string;
  /** D-pad / nav right. */
  readonly navRight: string;
}

/** Key map for Player 2 — mirrors `P2_KEYS` in `input.ts`. */
export const P2_GAMEPAD_KEYS: GamepadKeyMap = {
  attack:    'KeyN',
  dig:       'KeyU',
  raise:     'KeyY',
  invToggle: 'Comma',
  navUp:     'KeyI',
  navDown:   'KeyK',
  navLeft:   'KeyJ',
  navRight:  'KeyL',
};

// ── Options ────────────────────────────────────────────────────────────────────

export interface PlayerGamepadOptions {
  /**
   * Which slot in `navigator.getGamepads()` to use.
   * Index 0 → first connected controller (Player 2's pad).
   * Index 1 → second connected controller (future Player 1 pad).
   */
  readonly gamepadIndex?: number;
  /** Action → key-code bindings for the keyboard bridge. Defaults to `P2_GAMEPAD_KEYS`. */
  readonly keyMap?: GamepadKeyMap;
  /**
   * Short label shown in the connect/disconnect toast, e.g. `'Player 2'`.
   * Lets future instances for other players produce distinct notifications.
   */
  readonly playerLabel?: string;
  /** Stick deadzone [0, 1). Values below this magnitude read as zero. Default: 0.15. */
  readonly deadzone?: number;
  /** Show a toast notification on connect/disconnect. Default: true. */
  readonly toast?: boolean;
}

// ── Parsed per-frame state ─────────────────────────────────────────────────────
//
// Only the inputs the bridge actually uses. Everything else (triggers, right stick,
// select button) can be added here if a future feature needs it.

interface FrameState {
  readonly a: boolean;
  readonly x: boolean;
  readonly y: boolean;
  readonly l1: boolean; readonly r1: boolean;
  readonly start: boolean;
  readonly dpad: { readonly up: boolean; readonly down: boolean; readonly left: boolean; readonly right: boolean };
  readonly lx: number; readonly ly: number;
}

// ── PlayerGamepad ──────────────────────────────────────────────────────────────

/**
 * Manages one player's gamepad. Call `pollTick()` once per fixed-update tick (before
 * `pollActions`) and `readStick(out)` to merge analog movement. Call `dispose()` on teardown.
 *
 * One instance per player: each has its own gamepad index, key map, and held-key set.
 * Parameterising a single shared manager by player would push that ownership concern
 * up to every call site.
 */
export class PlayerGamepad {
  private readonly _gamepadIndex: number;
  private readonly _keyMap: GamepadKeyMap;
  private readonly _playerLabel: string;
  private readonly _deadzone: number;
  private readonly _showToast: boolean;

  // Map is resolved once at connect-time and held until the next connect event.
  // Re-detecting on every tick is unnecessary: the hardware doesn't change mid-session.
  private _map: ControllerMap = CONTROLLER_MAPS.X;

  private _curr: FrameState | null = null;
  private _prev: FrameState | null = null;
  private _connected = false;

  /** Synthetic key codes currently held down by the bridge — used to release them on disconnect. */
  private readonly _keysHeld = new Set<string>();

  private readonly _onConnect: (e: GamepadEvent) => void;
  private readonly _onDisconnect: (e: GamepadEvent) => void;

  constructor(options: PlayerGamepadOptions = {}) {
    this._gamepadIndex = options.gamepadIndex ?? 0;
    this._keyMap       = options.keyMap       ?? P2_GAMEPAD_KEYS;
    this._playerLabel  = options.playerLabel  ?? `Player ${(options.gamepadIndex ?? 0) + 1}`;
    this._deadzone     = options.deadzone     ?? 0.15;
    this._showToast    = options.toast        ?? true;

    this._onConnect    = this._handleConnect.bind(this);
    this._onDisconnect = this._handleDisconnect.bind(this);

    window.addEventListener('gamepadconnected',    this._onConnect);
    window.addEventListener('gamepaddisconnected', this._onDisconnect);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** True while the assigned gamepad slot is occupied. */
  get connected(): boolean { return this._connected; }

  /**
   * Snapshot the Gamepad API and fire synthetic key events for discrete actions.
   * Call once per fixed-update tick, **before** `pollActions`, so any keydown events
   * fired here land in `keyState.held` before the edge-detection pass reads it.
   */
  pollTick(): void {
    this._prev = this._curr;

    const gp = navigator.getGamepads()[this._gamepadIndex] ?? null;

    if (gp !== null) {
      this._connected = true;
      this._curr = this._parse(gp);
      this._bridge();
    } else {
      this._connected = false;
      this._curr = null;
      this._releaseAll();
    }
  }

  /**
   * Write the left-stick x/y (deadzone-applied, [-1, 1]) into `out`.
   * Writes (0, 0) when no pad is connected, making this a safe no-op for keyboard-only play.
   *
   * Kept separate from `pollTick` so the caller can pass the same `Vec2Out` scratch object
   * directly into `pollP2Movement`, avoiding any extra allocation.
   */
  readStick(out: Vec2Out): void {
    out.dx = this._curr?.lx ?? 0;
    out.dy = this._curr?.ly ?? 0;
  }

  /** Release all synthetic keys and remove event listeners. Call on HMR teardown. */
  dispose(): void {
    window.removeEventListener('gamepadconnected',    this._onConnect);
    window.removeEventListener('gamepaddisconnected', this._onDisconnect);
    this._releaseAll();
  }

  // ── Controller map detection ───────────────────────────────────────────────
  //
  // Run once at connect-time; the hardware family doesn't change mid-session.

  private _detectMap(gp: Gamepad): void {
    const id  = (gp.id      ?? '').toLowerCase();
    const map = (gp.mapping ?? '').toLowerCase();

    const isStandard = map === 'standard';
    const isNintendo = id.includes('pro controller') || id.includes('057e') ||
                       id.includes('nintendo')       || id.includes('switch') ||
                       id.includes('joy-con');
    const isXbox   = id.includes('xbox') || id.includes('xinput');
    const is8BitDo = id.includes('8bitdo');

    if (isNintendo || (is8BitDo && isStandard && !isXbox)) {
      this._map = CONTROLLER_MAPS.S;
    } else if (isXbox || isStandard) {
      this._map = CONTROLLER_MAPS.X;
    } else {
      this._map = CONTROLLER_MAPS.D;
    }
  }

  // ── Frame parse ────────────────────────────────────────────────────────────

  private _parse(gp: Gamepad): FrameState {
    const m   = this._map;
    const btn = (i: number) => i >= 0 && (gp.buttons[i]?.pressed ?? false);

    // D-pad: HAT axis (single float encoding 8 directions) or discrete buttons
    let dUp = false, dDown = false, dLeft = false, dRight = false;
    if (m.HAT >= 0) {
      const h = gp.axes[m.HAT] ?? 0;
      dUp    = h < -0.5 || (h > 0.8  && h <= 1.05);
      dRight = h > -0.85 && h < -0.1;
      dDown  = h > -0.25 && h <  0.5;
      dLeft  = h >  0.3  && h <= 1.05;
    } else {
      dUp    = btn(m.D_UP);
      dDown  = btn(m.D_DOWN);
      dLeft  = btn(m.D_LEFT);
      dRight = btn(m.D_RIGHT);
    }

    return {
      a: btn(m.A), x: btn(m.X), y: btn(m.Y),
      l1: btn(m.L1), r1: btn(m.R1),
      start: btn(m.START),
      dpad: { up: dUp, down: dDown, left: dLeft, right: dRight },
      lx: this._dz(gp.axes[m.LX] ?? 0),
      ly: this._dz(gp.axes[m.LY] ?? 0),
    };
  }

  // ── Keyboard bridge ────────────────────────────────────────────────────────
  //
  // For each logical action, fire a synthetic keydown/keyup on `document` when the
  // button state changes. `createKeyState` listens on `document`, so these events land
  // in `keyState.held` exactly as real keypresses do.
  //
  // D-pad directions use the same key codes as P2's movement keys (KeyI/J/K/L), so
  // inventory navigation driven by D-pad works automatically — `pollPlayerActions`
  // treats `navUp` etc. as rising-edge checks on those same codes.

  private _bridge(): void {
    if (this._curr === null) return;
    const p = this._prev;
    const c = this._curr;
    const km = this._keyMap;

    this._sync(c.a,                                       p?.a     ?? false,  km.attack);
    this._sync(c.x,                                       p?.x     ?? false,  km.dig);
    this._sync(c.y,                                       p?.y     ?? false,  km.raise);
    this._sync(c.l1 || c.r1 || c.start,
               (p?.l1 ?? false) || (p?.r1 ?? false) || (p?.start ?? false),   km.invToggle);
    this._sync(c.dpad.up,    p?.dpad.up    ?? false, km.navUp);
    this._sync(c.dpad.down,  p?.dpad.down  ?? false, km.navDown);
    this._sync(c.dpad.left,  p?.dpad.left  ?? false, km.navLeft);
    this._sync(c.dpad.right, p?.dpad.right ?? false, km.navRight);
  }

  private _sync(curr: boolean, prev: boolean, code: string): void {
    if (curr === prev) return;
    this._fire(code, curr);
    if (curr) { this._keysHeld.add(code); }
    else       { this._keysHeld.delete(code); }
  }

  private _fire(code: string, down: boolean): void {
    document.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {
      code, key: this._codeToKey(code), bubbles: true, cancelable: true,
    }));
  }

  private _codeToKey(code: string): string {
    if (code.startsWith('Key'))   return code[3]?.toLowerCase() ?? code;
    if (code.startsWith('Digit')) return code[5] ?? code;
    const table: Record<string, string> = {
      Comma: ',', Period: '.', Space: ' ',
      Enter: 'Enter', Escape: 'Escape', Tab: 'Tab',
      ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown',
      ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
    };
    return table[code] ?? code;
  }

  private _releaseAll(): void {
    for (const code of this._keysHeld) this._fire(code, false);
    this._keysHeld.clear();
  }

  // ── Math ───────────────────────────────────────────────────────────────────

  private _dz(v: number): number {
    return Math.abs(v) < this._deadzone ? 0 : v;
  }

  // ── Connection events ──────────────────────────────────────────────────────

  private _handleConnect(e: GamepadEvent): void {
    if (e.gamepad.index !== this._gamepadIndex) return;
    this._connected = true;
    this._detectMap(e.gamepad);
    console.log(
      `[GamepadP2] connected: "${e.gamepad.id}"`,
      `mapping="${e.gamepad.mapping || 'none'}"`,
      `→ ${this._map.name}`,
      `| buttons: ${e.gamepad.buttons.length}`,
      `| axes: ${e.gamepad.axes.length}`,
    );
    if (this._showToast) {
      const name = e.gamepad.id.split('(')[0]?.trim() ?? 'Gamepad';
      this._toast(`🎮 ${name} connected (${this._playerLabel})`);
    }
  }

  private _handleDisconnect(e: GamepadEvent): void {
    if (e.gamepad.index !== this._gamepadIndex) return;
    this._connected = false;
    this._curr = null;
    this._prev = null;
    this._releaseAll();
    if (this._showToast) {
      this._toast(`🎮 Controller disconnected (${this._playerLabel})`);
    }
  }

  // ── Toast ──────────────────────────────────────────────────────────────────

  private _toast(msg: string): void {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed', bottom: '52px', left: '75%', transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.85)', color: '#fff', padding: '8px 20px',
      borderRadius: '8px', fontSize: '13px', fontFamily: 'system-ui, sans-serif',
      zIndex: '99999', transition: 'opacity 0.4s', opacity: '0', pointerEvents: 'none',
    });
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => { el.remove(); }, 500);
    }, 2500);
  }
}
