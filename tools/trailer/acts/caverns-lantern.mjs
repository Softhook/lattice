/**
 * **Shot 4 — three hundred torches, and a lantern walking into the dark.**
 *
 * Two problems, one file.
 *
 * **The number.** The caption for this exhibit is *704 light pools*, and the opening state is
 * `POOLS 85`. 704 is `examples/caverns/README.md`'s bottom row, reached at **300 torches**, which
 * is three presses of the exhibit's own `Light 100 more`. Those presses happen here, at the very
 * top of the warmup, so the field has settled long before the shutter. The number this actually
 * produces at 1280×720 is **692**, not 704 — `POOLS` is `LightField.count`, which counts the pools
 * that survived the cull *for the current view*, so it is viewport-dependent and the README's
 * figure was measured through a different window. Film it and read the frame; do not caption it
 * from the README.
 *
 * **The motion.** Braziers flicker and glow-worms pulse, but the exhibit's subject is a light that
 * *moves*, so the shot taps the floor twice and the lantern walks. `damp()` at 3.4/s is an
 * exponential approach rather than a tween, which is why a second tap mid-walk retargets smoothly
 * instead of restarting — and it is why the two taps are 0.6 s apart rather than at the ends.
 */
export default function cavernsLantern({ frames, width, height }) {
  const tap = (at, x, y) => [
    { at, events: [{ mouse: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }] },
    { at: at + 1, events: [{ mouse: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }] },
  ];
  return [
    ...tap(Math.round(frames * 0.05), Math.round(width * 0.30), Math.round(height * 0.68)),
    ...tap(Math.round(frames * 0.45), Math.round(width * 0.72), Math.round(height * 0.40)),
  ];
}
