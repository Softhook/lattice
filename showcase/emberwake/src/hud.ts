/**
 * **`@browser-only`** — the DOM half of the game: four readings, one line of instruction, a mute,
 * and the card that appears exactly once.
 *
 * ## Why the HUD is DOM and not canvas
 *
 * Because it must be readable at midnight, and `renderFrame` composites the night mask in pass 5
 * with the HUD in pass 6 — but only if the HUD is in pass 6. A canvas HUD is a HUD somebody
 * eventually draws in the Solids pass, and then it goes dark with the world. DOM sidesteps the
 * question entirely, costs no frame time, and gets text shaping and system fonts for free, which
 * matters in a kit that ships no font.
 *
 * ## The ten-second rule
 *
 * There is no splash, no sign-in and no modal at boot. The first frame shows the world with a
 * boat in it and **one line of text naming the next action**, and that line changes as the run
 * does: it tells you to sail, then to shoot, then how many magazines are left. A tutorial that
 * is one sentence long and always current is the only kind anybody reads.
 */

import { clamp01 } from '@latticekit/core';
import { createOverlay, el, roll, type Overlay, type Roll } from '@latticekit/ui';
import { HULL, Phase, type Game } from './game.js';

/** What the HUD needs each update. Read off the game rather than pushed into it, so a frame the
 *  HUD skipped can never leave the world and the readout disagreeing. */
export interface Hud {
  readonly overlay: Overlay;
  /** Refresh from the run. Cheap: every write is guarded on the value having changed, because a
   *  `textContent` assignment with an identical string still invalidates layout. */
  update(game: Game, worstMs: number, cadenceMs: number): void;
  /** Show the end card. Idempotent. */
  finish(game: Game, onAgain: () => void, onNext: () => void): void;
  destroy(): void;
}

/**
 * The line of text under the title.
 *
 * Four states, in the order a player meets them: get moving, get shooting, understand the
 * objective, finish it. Each is replaced only when it changes.
 */
function brief(game: Game): string {
  if (game.phase === Phase.Won) return 'Every magazine is gone. The fleet has nothing left to guard.';
  if (game.phase === Phase.Lost) return 'She is down. The islands are still standing.';
  const speed = Math.sqrt(game.player.vx * game.player.vx + game.player.vy * game.player.vy);
  if (game.t < 6 && speed < 1.5) return 'W to get under way. A and D put the helm over.';
  if (game.burned === 0 && game.t < 22) return 'Aim with the mouse. Click to fire — wooden things catch.';
  if (game.left === game.total) return 'Burn the magazines. The tall one with the red light, on every big island.';
  if (game.left === 1) return 'One magazine left. Stand off when it goes up.';
  return `${String(game.left)} magazines left. Fire spreads downwind — light the near end.`;
}

/** Build the HUD. Nothing here reads a clock of its own; `now` is the loop's. */
export function createHud(now: () => number): Hud {
  const overlay = createOverlay({ now, zIndex: 3 });

  const briefLine = el('p', { class: 'brief', text: 'W to get under way. A and D put the helm over.' });
  const hullFill = el('i', {});
  const magRoll: Roll = roll(overlay);
  const perf = el('p', { class: 'perf', text: '' });

  overlay.mount(
    el('div', { class: 'dock dock-tl' },
      el('p', { class: 'title', text: 'EMBERWAKE' }),
      briefLine,
      el('p', { class: 'keys', text: 'W A S D · MOUSE AIM · CLICK FIRE · M MUTE' })),
    { layer: 'panels' },
  );

  const mute = el('button', { class: 'mute', 'data-on': '1', text: 'SOUND ON', type: 'button' });
  overlay.mount(
    el('div', { class: 'dock dock-tr' },
      el('div', { class: 'gauge' },
        el('span', { class: 'gauge-label', text: 'HULL' }),
        el('div', { class: 'bar hull' }, hullFill)),
      el('div', { class: 'gauge' },
        el('span', { class: 'gauge-label', text: 'MAGAZINES' }),
        el('span', { class: 'tally' }, magRoll.node)),
      perf,
      mute),
    { layer: 'panels', interactive: true },
  );

  let lastBrief = '';
  let lastHull = -1;
  let card: HTMLElement | undefined;

  return {
    overlay,
    update(game, worstMs, cadenceMs): void {
      const next = brief(game);
      if (next !== lastBrief) {
        lastBrief = next;
        briefLine.textContent = next;
      }
      const hull = Math.round(clamp01(game.player.hull / HULL) * 100);
      if (hull !== lastHull) {
        lastHull = hull;
        hullFill.style.width = `${String(hull)}%`;
      }
      magRoll.set(game.left);
      // The pair, not the number: a worst gap means nothing without the display's own period, so
      // a visitor can do the division themselves rather than trust a threshold calibrated on
      // somebody else's laptop.
      perf.textContent = `${worstMs.toFixed(1)} ms worst · ${cadenceMs.toFixed(1)} ms cadence`;
    },
    finish(game, onAgain, onNext): void {
      if (card !== undefined) return;
      const won = game.phase === Phase.Won;
      card = el('div', { class: 'card' },
        el('h2', { class: won ? 'won' : 'lost', text: won ? 'THE ARCHIPELAGO BURNS' : 'EMBERWAKE IS LOST' }),
        el('p', {
          text: `${String(game.total - game.left)}/${String(game.total)} magazines · ` +
            `${String(game.burned)} burned · ${String(game.sunk)} sunk · ${game.t.toFixed(0)}s`,
        }),
        el('button', { type: 'button', text: 'SAIL AGAIN', onclick: onAgain }),
        el('button', { type: 'button', text: 'NEW ARCHIPELAGO', onclick: onNext, style: 'margin-left:10px' }));
      overlay.mount(card, { layer: 'modal', interactive: true });
    },
    destroy(): void {
      overlay.destroy();
    },
  };
}

/** Wire the mute button to whatever the game does about it, and keep its label honest. */
export function bindMute(hud: Hud, toggle: () => boolean): void {
  const button = hud.overlay.root.querySelector('.mute');
  if (!(button instanceof HTMLButtonElement)) return;
  button.addEventListener('click', () => {
    const muted = toggle();
    button.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
    button.dataset['on'] = muted ? '0' : '1';
  });
}
