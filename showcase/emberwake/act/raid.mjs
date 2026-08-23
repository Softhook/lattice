/**
 * A raid, driven from the outside, at exactly 60 fps.
 *
 * `tools/trailer/capture.mjs` freezes the page's clock and steps it by hand, so this file is the
 * player: it holds the helm over, aims at the island, and fires. Everything it sends is an
 * ordinary DOM event, so the game cannot tell it apart from a person and nothing in the game
 * knows this file exists.
 *
 * Run it with:
 *
 * ```bash
 * node tools/trailer/capture.mjs 'http://localhost:5190/?seed=emberwake' \
 *   --size 1280x720 --frames 420 --warmup 600 \
 *   --act showcase/emberwake/act/raid.mjs --out /tmp/ember-film
 * ```
 */

/**
 * One key, held from `from` to `to` in capture frames.
 *
 * **Dispatched as a DOM event through `{ eval }` rather than as a `{ keyboard }` cue**, and that
 * is not a style choice. `Input.dispatchKeyEvent` — which is what a `{ keyboard }` cue becomes —
 * produced no `keydown` at all in this headless session: the mouse cues in the same act landed,
 * the shells flew, and the boat never moved. Measured twice, with `keyDown` and with
 * `rawKeyDown`. A synthetic `KeyboardEvent` on `document` reaches `@latticekit/input`'s listener
 * exactly the same way a real one does — it reads `code`, `repeat`, `target` and the modifier
 * flags, and a constructed event has all of them — so the game cannot tell the difference.
 *
 * Reported as a finding against `tools/trailer`, which this file does not modify.
 */
function key(cues, at, type, code) {
  cues.push({
    at,
    events: [{ eval: `document.dispatchEvent(new KeyboardEvent('${type}',{code:'${code}',bubbles:true}))` }],
  });
}

/** See {@link key}. */
function hold(cues, code, _k, _vk, from, to) {
  key(cues, from, 'keydown', code);
  key(cues, to, 'keyup', code);
}

/** A salvo: press and release, two frames apart, at a point on screen. */
function salvo(cues, at, x, y) {
  cues.push({ at, events: [{ mouse: 'mouseMoved', x, y, buttons: 0 }] });
  cues.push({ at: at + 1, events: [{ mouse: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }] });
  cues.push({ at: at + 4, events: [{ mouse: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }] });
}

export default function raid({ frames, width, height }) {
  const cues = [];
  const cx = Math.round(width * 0.5);
  const cy = Math.round(height * 0.5);

  // Ahead full, from before the shutter opens, and never let go. The whole shot is the boat
  // moving; a shot of a stationary boat is a shot of a diagram.
  hold(cues, 'KeyW', 'w', 87, 1, frames - 1);

  // Two turns, so the wake curves and the deck heels. The first is a hard turn to port to bring
  // the island abeam; the second is a lazier one to starboard on the way past.
  hold(cues, 'KeyA', 'a', 65, Math.round(frames * 0.16), Math.round(frames * 0.29));
  hold(cues, 'KeyD', 'd', 68, Math.round(frames * 0.55), Math.round(frames * 0.66));

  // Nine salvos into the island, which sits up and to the left of the opening position. The
  // reload is 0.46 s — twenty-eight frames — so this is roughly as fast as the guns will go.
  const targets = [
    [0.3, 0.24], [0.34, 0.3], [0.26, 0.2], [0.22, 0.34], [0.3, 0.4],
    [0.38, 0.28], [0.2, 0.26], [0.28, 0.36], [0.33, 0.22],
  ];
  targets.forEach(([fx, fy], i) => {
    salvo(cues, Math.round(frames * 0.08) + i * 30, Math.round(width * fx), Math.round(height * fy));
  });

  // Leave the pointer somewhere the gun can point at for the last second, so the barrel is not
  // frozen at the last click's bearing while the boat keeps turning under it.
  cues.push({ at: frames - 40, events: [{ mouse: 'mouseMoved', x: cx - 220, y: cy - 120, buttons: 0 }] });
  return cues;
}
