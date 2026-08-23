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
 * **Dispatched as a DOM event through `{ eval }` rather than as a `{ keyboard }` cue.**
 *
 * The reason recorded here was wrong, and the wrong reason cost a week — it was filed as issue
 * #62, a "200x performance collapse", and root-caused only after a profile. What this comment
 * used to say was that `Input.dispatchKeyEvent` "produced no `keydown` at all in this headless
 * session". It produced one. What it *also* produced was a `chrome://help/` tab in the
 * foreground, because a `keyDown` carrying virtual key codes and **no `text`** is a raw press,
 * and Chrome hands an unconsumed raw press to the macOS menu accelerators. The exhibit went to
 * the background, `@latticekit/input` released every held key on `visibilitychange` — which is
 * the stuck-key guard being right — and so the boat never moved. That is the symptom this
 * comment described. A hidden tab also produces no BeginFrames, so every later
 * `Input.dispatchMouseEvent` blocked for its five-second fallback, which is where the 434 s went.
 *
 * So a `{ keyboard }` cue is usable, and `showcase/emberwake/act/raid-bisect.mjs` uses one: give
 * every character `keyDown` its `text`. `test/contracts/act-keys.test.ts` enforces it.
 *
 * This act keeps the `{ eval }` form anyway, for the reason that was always the good one: a
 * synthetic `KeyboardEvent` on `document` reaches `@latticekit/input`'s listener exactly the way
 * a real one does — it reads `code`, `repeat`, `target` and the modifier flags, and a constructed
 * event has all of them — and it can never be re-offered to a menu bar, so a film shot with it
 * does not depend on which platform the camera is on.
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
