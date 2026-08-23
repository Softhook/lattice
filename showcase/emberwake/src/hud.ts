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
import { createOverlay, el, roll, toasts, type Overlay, type Roll } from '@latticekit/ui';
import { HULL, Phase, RUN_SECONDS, type Beat, type Game } from './game.js';

/** What the HUD needs each update. Read off the game rather than pushed into it, so a frame the
 *  HUD skipped can never leave the world and the readout disagreeing. */
export interface Hud {
  readonly overlay: Overlay;
  /** Refresh from the run. Cheap: every write is guarded on the value having changed, because a
   *  `textContent` assignment with an identical string still invalidates layout. */
  update(game: Game, worstMs: number, cadenceMs: number): void;
  /**
   * Name a beat the simulation reported.
   *
   * The words live here and not in `game.ts` for the reason `GameHooks.beat` gives: the
   * simulation has to run in Node, and a run's copy is a presentation decision.
   */
  notice(what: Beat, left: number): void;
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
  if (game.phase === Phase.Dawn) return 'The sun found her in open water.';
  if (game.dawn > 0.86) return `Light in the east. ${String(game.left)} to go — there is no second night.`;
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
  // Short-lived on purpose. The package's 7000 ms floor is written for an idle game where a
  // notice is the only thing happening; here three of them stacked would be a wall of text over
  // a boat that is being shot at.
  const bar = toasts(overlay, { max: 2, minMs: 1300, msPerChar: 26 });

  const briefLine = el('p', { class: 'brief', text: 'W to get under way. A and D put the helm over.' });
  const hullFill = el('i', {});
  const nightFill = el('i', {});
  const nightBar = el('div', { class: 'bar night' }, nightFill);
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
      // The dark, draining. The sea says the same thing in colour and this says it in a number
      // of pixels, because a player deep in a fight is not looking at the horizon.
      el('div', { class: 'gauge' },
        el('span', { class: 'gauge-label', text: 'NIGHT' }),
        nightBar),
      el('div', { class: 'gauge' },
        el('span', { class: 'gauge-label', text: 'MAGAZINES' }),
        el('span', { class: 'tally' }, magRoll.node)),
      perf,
      mute),
    { layer: 'panels', interactive: true },
  );

  let lastBrief = '';
  let lastHull = -1;
  let lastNight = -1;
  let card: HTMLElement | undefined;

  return {
    overlay,
    notice(what, left): void {
      switch (what) {
        case 'magazine':
          bar.show(`MAGAZINE GONE — ${String(left)} LEFT`, 'good');
          break;
        case 'last':
          bar.show('ONE MAGAZINE LEFT', 'good');
          break;
        case 'wave':
          bar.show('THE FLEET ANSWERS', 'bad');
          break;
        case 'light':
          bar.show('LIGHT IN THE EAST', 'bad');
          break;
        default:
          // Aground. Once per session: a player who keeps hitting the beach knows, and a toast
          // that repeats trains the dismissal — see `ToastHost.once`.
          bar.once('aground', 'HARD AGROUND — SHE WILL NOT TAKE MANY OF THOSE', 'bad');
          break;
      }
    },
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
      // The gauge is **linear in time left**, while `game.dawn` is squared for the colour ramp.
      // Two different questions: the sky is asking "how different does this look", the bar is
      // asking "how many seconds have I got", and a bar that emptied on the colour curve would sit
      // at ninety per cent with thirty seconds to go.
      const night = Math.round((1 - clamp01(game.t / RUN_SECONDS)) * 100);
      if (night !== lastNight) {
        lastNight = night;
        nightFill.style.width = `${String(night)}%`;
        // Below a quarter the gauge starts breathing. The sky has been saying this for a minute
        // and the toast says it once at fifteen seconds; a player in a fight is watching neither,
        // and "the dawn arrived without warning" was the first thing a real playthrough reported.
        nightBar.classList.toggle('low', night <= 25 && night > 0);
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
      const title = won
        ? 'THE ARCHIPELAGO BURNS'
        : game.phase === Phase.Dawn ? 'DAWN' : 'EMBERWAKE IS LOST';
      card = el('div', { class: 'card' },
        el('h2', { class: won ? 'won' : 'lost', text: title }),
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
