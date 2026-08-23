/**
 * Emberwake, played rather than watched.
 *
 * At rest the game is a boat on open water, which is the least interesting second it has. This
 * drives it the way the brief describes: throttle toward the near island, sweep the aim along the
 * shoreline, and fire in bursts so several wooden things burn at once.
 *
 * **Every cue index is relative to capture frame 0, and a negative index only fires if the warmup
 * is long enough to reach it.** A cue at -260 under a 1500 ms warmup (90 frames at 60) is simply
 * never dispatched, silently — which is how the first version of this file produced a boat that
 * never moved and a report that the game ignored its keys. Keep the earliest cue inside -80 and
 * pass a warmup of at least 1400 ms.
 *
 * Keys go down and stay down: `@latticekit/input` reads a held key as state, so releasing between
 * steps would put a stutter in the capture that is not in the game.
 *
 * ## Every keyDown carries its `text`, and that is load-bearing (issue #62)
 *
 * A `keyDown` cue with virtual key codes and **no `text`** is a *raw* key press as far as Chrome
 * is concerned. Blink offers a raw press to the page, and when the page does not consume it the
 * event is handed back to the browser to be matched against the **menu accelerators** — and on
 * macOS `KeyW` matches one, so Chrome opens `chrome://help/` in a new foreground tab. Three
 * things then happen, in this order, and only the third is visible in a wall-clock number:
 *
 * 1. the exhibit's tab goes to the background, so `document.visibilityState` is `hidden`;
 * 2. `@latticekit/input` releases every held key on `visibilitychange` — correctly, that is the
 *    stuck-key guard — so the boat never gets under way at all and the capture shows a game that
 *    ignores its keys;
 * 3. a hidden tab produces no BeginFrames, so Blink's rAF-aligned mouse-move queue never flushes
 *    and **every subsequent `Input.dispatchMouseEvent` blocks for its 5-second fallback timeout.**
 *
 * This act dispatches 82 mouse moves. 82 x 5 s is 411 s, which was the whole of the "200x
 * performance collapse" filed as #62: the game was never slow, the harness was blocked. Supplying
 * `text` makes the press a text-producing one, which Blink never re-offers to the menu bar.
 *
 * Measured on macOS, Chrome 151, all five variants: `nativeVirtualKeyCode` alone steals the
 * foreground; adding `text`, or dropping `nativeVirtualKeyCode`, does not.
 */
export default function raid({ frames, width, height }) {
  const cues = [];
  // `text` on the press and not on the release: a release is never matched against an
  // accelerator, and a `text` on it would be a second character. See the header for what the
  // missing `text` cost.
  const key = (type, k, code, keyCode) => ({
    keyboard: type, key: k, code,
    windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode,
    ...(type === 'keyDown' ? { text: k, unmodifiedText: k } : {}),
  });

  cues.push({ at: -80, events: [key('keyDown', 'w', 'KeyW', 87)] });
  cues.push({ at: -60, events: [key('keyDown', 'a', 'KeyA', 65)] });
  cues.push({ at: -44, events: [key('keyUp', 'a', 'KeyA', 65)] });

  const y = Math.round(height * 0.34);
  const xAt = (f) => Math.round(width * (0.18 + 0.46 * ((f + 80) / (frames + 80))));
  for (let f = -78; f <= frames; f++) {
    cues.push({ at: f, events: [{ mouse: 'mouseMoved', x: xAt(f), y, button: 'none', buttons: 0 }] });
  }

  // Bursts, not a metronome: three shells, a beat, three more. Pressure reads; rhythm does not.
  for (const f of [-70, -62, -54, -24, -16, -8, 12, 20, 28, 58, 66, 74, 96, 104]) {
    const x = xAt(f);
    cues.push({ at: f, events: [
      { mouse: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 },
      { mouse: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 },
    ] });
  }
  return cues;
}
