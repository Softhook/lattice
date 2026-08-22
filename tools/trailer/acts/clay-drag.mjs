/**
 * **Shot 6 — a hill raised out of a flat valley, on a live height field.**
 *
 * The exhibit's claim is that terrain here is a field and not an asset, and the only way to film
 * a claim like that is to make it: press on the near bank, work the brush in a slow ellipse for a
 * second and a half, and let 2,200 props, sixteen walker routes and the river resettle onto ground
 * that did not exist when the shot started. The readout goes `0 ft` → `1,042 ft`,
 * `1,097 tiles under water` → `1,083`, `16 routes planned` → `180 · 1 stranded`.
 *
 * ## Three things that were tried and rejected, so nobody re-tries them
 *
 * | attempt | what the frames showed |
 * |---|---|
 * | a straight drag across the river at the opening zoom | a 440 ft swell about 200 px across, which reads as a lighting change rather than a landform |
 * | a drag *along* the channel, to dam it lengthwise | the river narrowed slightly. The least legible of the three |
 * | `?zoom=1.7` on the URL | **no effect.** `bootstrap` reads `zoom` from the query, and then `clay` fits its own camera over the top, so the parameter is silently discarded |
 *
 * What works is the third row's problem solved a different way: **three wheel notches in the
 * warmup**. The camera controller takes a wheel as a pointer-anchored zoom, which is a real
 * gesture rather than an option, so nothing downstream can discard it. At that zoom the brush
 * covers enough of the frame that a thousand feet of new mountain is a mountain.
 *
 * ## Why an ellipse and not a line
 *
 * The brush raises where it dwells. A line spends its height over a long thin band; a tight
 * ellipse spends it in one place, and the result is a peak with a shaded face, which is the only
 * version of this where you can see the *shape* of what the field is doing. Two and a fifth turns,
 * because a whole number of turns ends where it began and the last half second then looks like a
 * stall.
 *
 * ## Why the release is at 74% and not at the end
 *
 * The best frames are the ones after the finger lifts: the water finds its way around the new
 * toe, and the trees that rode up let go of the slope. Release on the last frame and they are
 * all in the next shot instead of this one.
 *
 * One `mouseMoved` per step, never a batch: `@latticekit/input` reads its pointer buffer once per
 * update, so two moves between one pair of steps collapse into one sample and the brush teleports.
 */
export default function clayDrag({ frames, width, height }) {
  const cues = [];

  // Three notches in, spaced six frames apart so the camera's own smoothing has somewhere to go.
  // Early in the warmup, so the world has settled at the new zoom well before frame 0.
  for (let i = 0; i < 3; i++) {
    cues.push({
      at: -(200 - i * 6),
      events: [{ mouse: 'mouseWheel', x: Math.round(width * 0.5), y: Math.round(height * 0.55), deltaX: 0, deltaY: -120, button: 'none', buttons: 0 }],
    });
  }

  const cx = 0.40 * width;
  const cy = 0.50 * height;
  const radius = 60;
  const press = 4;
  const release = Math.round(frames * 0.74);
  const at = (angle) => ({
    x: Math.round(cx + radius * Math.cos(angle)),
    // 0.55, because the ground is an isometric plane: a circle on screen is an ellipse on the
    // ground, and a circle on the *ground* is what makes a round hill.
    y: Math.round(cy + radius * 0.55 * Math.sin(angle)),
  });

  const start = at(0);
  cues.push({ at: -2, events: [{ mouse: 'mouseMoved', x: start.x, y: start.y, button: 'none', buttons: 0 }] });
  cues.push({ at: press, events: [{ mouse: 'mousePressed', x: start.x, y: start.y, button: 'left', buttons: 1, clickCount: 1 }] });
  for (let frame = press + 1; frame <= release; frame++) {
    const point = at(((frame - press) / (release - press)) * Math.PI * 2.2);
    cues.push({ at: frame, events: [{ mouse: 'mouseMoved', x: point.x, y: point.y, button: 'left', buttons: 1 }] });
  }
  const end = at(Math.PI * 2.2);
  cues.push({ at: release + 1, events: [{ mouse: 'mouseReleased', x: end.x, y: end.y, button: 'left', buttons: 0, clickCount: 1 }] });
  return cues;
}
