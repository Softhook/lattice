/**
 * **Shot 7 — hanging four chimes, then calling the wind.**
 *
 * `HUNG 0` and `THE PATH IS SILENT` is the opening state, and it is honest: the game is a trail
 * with nothing on it until somebody hangs something. Filming that is filming an empty stage.
 *
 * So the warmup taps four points down the trail — `actions: { touch: ['tap'] }` in the game's own
 * boot, so these are the same taps a player makes — and the shot itself presses **Space**, which
 * the game binds to `nudge` and turns into a gust. The gust is what makes the chimes swing and
 * ring, and it is the only input in the game that produces motion you can point at.
 *
 * ## Why the taps are in the warmup and the gusts are in the shot
 *
 * A chime appears instantly and then hangs still; a gust takes about a second to cross the
 * mountain. Putting the appearances before the shutter and the gusts inside it spends the two
 * seconds on the part that moves. The second gust is timed so its front is mid-frame when the
 * shot ends, which gives the edit something to cut on.
 */
export default function chimePath({ frames, width, height }) {
  const trail = [
    [0.35, 0.90],
    [0.41, 0.70],
    [0.44, 0.52],
    [0.48, 0.34],
  ];
  const cues = [];
  // Spaced through the warmup rather than fired together: the game sorts and re-versions its
  // chime list on every hang, and four hangs in one frame is one frame of work a player never does.
  trail.forEach(([fx, fy], i) => {
    const at = -120 + i * 24;
    const x = Math.round(width * fx);
    const y = Math.round(height * fy);
    cues.push({ at, events: [{ mouse: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }] });
    cues.push({ at: at + 2, events: [{ mouse: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }] });
  });

  const space = (at) => {
    const key = { code: 'Space', key: ' ', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 };
    cues.push({ at, events: [{ keyboard: 'keyDown', ...key }] });
    cues.push({ at: at + 3, events: [{ keyboard: 'keyUp', ...key }] });
  };
  space(4);
  space(Math.round(frames * 0.45));

  // A slow pan along the ridge, which is the game's own `DRAG TO WALK THE RIDGE`. Two seconds of
  // a green hillside with four chimes on it measures 0.70% frame-to-frame at its liveliest — real
  // motion, and not enough of it to read as motion. Walking the camera turns the whole frame over
  // and carries the chimes past the lens, and it is a gesture rather than a camera hack: the
  // gesture recogniser tells a drag from the taps above by distance, so a chime is never hung by
  // accident.
  const from = { x: Math.round(width * 0.66), y: Math.round(height * 0.40) };
  const to = { x: Math.round(width * 0.55), y: Math.round(height * 0.52) };
  const panFrom = Math.round(frames * 0.08);
  const panTo = frames - 2;
  cues.push({ at: panFrom, events: [{ mouse: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 }] });
  for (let frame = panFrom + 1; frame <= panTo; frame++) {
    const t = (frame - panFrom) / (panTo - panFrom);
    const eased = t * t * (3 - 2 * t);
    cues.push({
      at: frame,
      events: [{ mouse: 'mouseMoved', x: Math.round(from.x + (to.x - from.x) * eased), y: Math.round(from.y + (to.y - from.y) * eased), button: 'left', buttons: 1 }],
    });
  }
  cues.push({ at: panTo + 1, events: [{ mouse: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1 }] });
  return cues;
}
