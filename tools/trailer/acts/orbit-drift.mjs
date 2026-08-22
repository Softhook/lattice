/**
 * **Shot 5 — a slow crossing of the void.**
 *
 * Orbit is the most self-sufficient scene in the gallery: eight stations orbit, three parallax
 * star bands drift, ring dashes crawl and beacons pulse, all with no input at all. It is also the
 * *slowest*. Measured over 72 frames of the opening state: **0.44% of pixels change frame to
 * frame, 3.50% across the whole shot** — real motion, and at 1.2 seconds not enough of it to read
 * as motion next to Crowd's 4.4%.
 *
 * The fix is the one thing this scene has that no other does: **three star bands at three
 * parallax depths**. Standing still, that is invisible. Moving, it is the whole reason the shot
 * exists — it is what says *there is no ground here, and this is a depth-sorted world anyway*.
 *
 * So the shot crosses. Slowly, and eased at both ends, because a pan that starts at speed is a
 * cut and a pan that stops at speed is a mistake. `DRAG TO CROSS THE VOID` is printed in the
 * corner of the exhibit; this is that drag.
 */
export default function orbitDrift({ frames, width, height }) {
  const from = { x: Math.round(width * 0.62), y: Math.round(height * 0.42) };
  const to = { x: Math.round(width * 0.44), y: Math.round(height * 0.52) };
  const start = 2;
  const end = frames - 2;
  const cues = [
    { at: start, events: [{ mouse: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 }] },
  ];
  for (let frame = start + 1; frame <= end; frame++) {
    const t = (frame - start) / (end - start);
    const eased = t * t * (3 - 2 * t);
    cues.push({
      at: frame,
      events: [
        {
          mouse: 'mouseMoved',
          x: Math.round(from.x + (to.x - from.x) * eased),
          y: Math.round(from.y + (to.y - from.y) * eased),
          button: 'left',
          buttons: 1,
        },
      ],
    });
  }
  cues.push({ at: end + 1, events: [{ mouse: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1 }] });
  return cues;
}
