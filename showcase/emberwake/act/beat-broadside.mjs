/**
 * **Beat 1 — the broadside.** Run down the shoreline of the first island and empty both barrels
 * into it at fifty yards until the whole waterfront is alight.
 *
 * Shot for `?seed=emberwake`, where the run opens at (6.7, 30.5) with the first magazine island
 * bearing due screen-right at (16.9, 20.3). The boat is pointed at the middle of the map on the
 * first frame, so *ahead* is already the right course and the act does not have to steer to find
 * the beat — which is the test this act is really running: **the opening frame has to have a
 * target in it.** If a future change to `world.ts` moves the start, this film goes wrong in a way
 * a still frame will not show, and that is the point of keeping it.
 *
 * ```bash
 * node tools/trailer/capture.mjs 'http://localhost:5190/?seed=emberwake' \
 *   --size 1280x720 --frames 260 --warmup 1600 \
 *   --act showcase/emberwake/act/beat-broadside.mjs --out /tmp/ember/broadside
 * ```
 *
 * ## Every character `keyDown` carries its `text`
 *
 * A `keyDown` with virtual key codes and no `text` is a *raw* press; Chrome hands an unconsumed
 * raw press to the macOS menu accelerators, `KeyW` matches one, and the exhibit is backgrounded
 * mid-shot with every held key released. `test/contracts/act-keys.test.ts` fails the build on it.
 */
export default function broadside({ frames, width, height }) {
  const cues = [];
  const key = (type, k, code, keyCode) => ({
    keyboard: type, key: k, code,
    windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode,
    ...(type === 'keyDown' ? { text: k, unmodifiedText: k } : {}),
  });

  // Ahead full from before the shutter opens. A cue at a negative index only fires if the warmup
  // is long enough to reach it: at -70 that needs 1400 ms, and the command line above passes 1600.
  cues.push({ at: -70, events: [key('keyDown', 'w', 'KeyW', 87)] });
  // A touch of port to bring her parallel with the beach rather than bows-on. Bows-on is a worse
  // shot and a much worse picture: a broadside is a *side*.
  cues.push({ at: -60, events: [key('keyDown', 'a', 'KeyA', 65)] });
  cues.push({ at: -44, events: [key('keyUp', 'a', 'KeyA', 65)] });

  // **And then she is left alone.** Three other versions of this act are recorded in the git
  // history and all three were worse: pulsed helm turns her into the beach and she spends the
  // shot aground, held helm gives a four-tile circle, and cutting the throttle stops her dead in
  // two seconds because the drag curve is steep. A straight pass at nine knots is a *tracking
  // shot* — the island enters top-right, burns, and leaves top-left under a camera that is
  // moving — and it is the only one of the four that is both a good picture and something a
  // person would actually do.

  // The aim sweeps along the shoreline from right to centre as the island comes abeam, so the
  // salvos walk down the waterfront instead of stacking on one hut.
  // Inland of the waterline, not on it. Aimed at the beach the salvos land among the palisade
  // posts, which are half-tile sticks: fourteen of them alight is fourteen candles and no
  // picture at all. Two tiles up the hill is where the huts are, and a hut is a fire.
  const y = Math.round(height * 0.30);
  const xAt = (f) => Math.round(width * (0.72 - 0.2 * Math.min(1, (f + 70) / (frames * 0.9))));

  // **The trigger is the space bar, not the mouse button, and that is a finding rather than a
  // preference.**
  //
  // `fire` is bound to both `tap` and `key:Space`, and a held mouse button looks like the obvious
  // way to keep the guns going. It is not: a pointer that *moves* while down stops being a tap
  // and becomes a drag, `held('fire')` goes false on the first move, and the act fires exactly
  // one salvo at the moment of the press and never again. The film that came back was a boat
  // sailing past an island with a single puff of smoke on her bow and nothing on fire, which
  // reads as a broken game rather than as a broken act — and two capture rounds were spent
  // adjusting `buttons` masks before a probe act read `__emberwake.firing` and said `false`.
  //
  // Space is held state and cannot be reinterpreted, so the mouse does one job — aim — and the
  // keyboard does the other. Which is also how a person plays it.
  for (let f = -70; f <= frames; f += 2) {
    cues.push({ at: f, events: [{ mouse: 'mouseMoved', x: xAt(f), y, button: 'none', buttons: 0 }] });
  }
  cues.push({ at: -40, events: [key('keyDown', ' ', 'Space', 32)] });
  cues.push({ at: frames - 24, events: [key('keyUp', ' ', 'Space', 32)] });
  return cues;
}
