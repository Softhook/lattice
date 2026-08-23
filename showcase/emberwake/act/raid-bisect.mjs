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
 */
export default function raid({ frames, width, height }) {
  const cues = [];
  const key = (type, k, code, keyCode) => ({ keyboard: type, key: k, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });

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
