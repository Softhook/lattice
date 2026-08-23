/**
 * **Beat 2 — the magazine.** Close the first island, put four salvos into the tall building with
 * the red light, then turn and run while the fuse burns down and it takes the hillside with it.
 *
 * The whole beat *emerges*: nothing here scripts an explosion. The act aims at a magazine, the
 * magazine takes three and a half heats to catch, its warning light strobes faster as it does,
 * it burns for six seconds and then `detonate` fires. The shot is timed so that the shutter is
 * open across the last second of the fuse and the two seconds after it — which is the shockwave,
 * the white flash, the debris, the six ticks of hit-stop and the shore going up.
 *
 * ```bash
 * node tools/trailer/capture.mjs 'http://localhost:5190/?seed=emberwake' \
 *   --size 1280x720 --frames 120 --warmup 11400 \
 *   --act showcase/emberwake/act/beat-magazine.mjs --out /tmp/ember/magazine
 * ```
 *
 * The warmup carries the approach and the bombardment, which is why every cue below is negative.
 * **A cue earlier than `-warmupSteps` is silently never dispatched** by `capture.mjs`, which is
 * how the first act in this directory produced a film of a boat that ignored its keys — so
 * rehearse it before filming, and the rehearsal will say so in as many words:
 *
 * ```bash
 * node showcase/emberwake/tools/rehearse.mjs act/beat-magazine.mjs --frames 120 --warmup 11400
 * ```
 *
 * Fire is on the space bar and not the mouse button. A pointer that moves while held stops being
 * a tap, `held('fire')` goes false on the first move, and the guns fire once — see
 * `beat-broadside.mjs`, which cost two capture rounds finding that out.
 */
export default function magazine({ frames, width, height }) {
  const cues = [];
  const key = (type, k, code, keyCode) => ({
    keyboard: type, key: k, code,
    windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode,
    ...(type === 'keyDown' ? { text: k, unmodifiedText: k } : {}),
  });

  /**
   * How far before the shutter the run starts, in frames.
   *
   * Everything below is written in **run frames** `g`, where `g = 0` is the moment she opens
   * fire, and then shifted by this. Writing the act in its own time and shifting once is the
   * only way to keep it tunable: the fuse is six seconds, so lining the explosion up with the
   * shutter means moving the *whole* approach by twenty frames at a time, and doing that by hand
   * across thirty cues is how an act ends up with two of them off by one.
   */
  const LEAD = 602;
  const at = (g) => g - LEAD;
  const move = (g, x, y) => {
    cues.push({
      at: at(g),
      events: [{ mouse: 'mouseMoved', x: Math.round(x), y: Math.round(y), button: 'none', buttons: 0 }],
    });
  };
  const press = (g, k, code, vk) => { cues.push({ at: at(g), events: [key('keyDown', k, code, vk)] }); };
  const release = (g, k, code, vk) => { cues.push({ at: at(g), events: [key('keyUp', k, code, vk)] }); };

  // ── the approach ──────────────────────────────────────────────────────────────────────
  //
  // The same course `beat-broadside.mjs` runs, deliberately: it is the one heading out of the
  // start that passes the first island at eight tiles instead of ending on its beach, and two
  // acts that disagree about how to leave harbour are two acts to re-tune when the drag changes.
  press(-70, 'w', 'KeyW', 87);
  press(-60, 'a', 'KeyA', 65);
  release(-44, 'a', 'KeyA', 65);
  // And the engine comes off well short of the beach: she carries her way in and arrives at
  // walking pace with the guns already bearing, rather than at six knots with the helm over.
  release(104, 'w', 'KeyW', 87);

  // **Aimed at the magazine as drawn, which is only correct because the aim marches the ground.**
  //
  // The pointer used to resolve on the sea plane, and a magazine standing eight levels up a hill
  // is drawn seventy pixels above the tile it occupies — so pointing at the building put every
  // shell into the water on the far side of the island, with the splash hidden behind the hill
  // and no feedback of any kind. `main.ts` now runs `screenToTileOnHeights`, so the ray that goes
  // through the roof comes down on the summit and the sight lands where the eye is.
  //
  // **And she shoots from a standstill, which is why this act works and three earlier cuts did
  // not.** While she is moving the target's screen position is a function of her speed, her
  // heading and the camera's lead all at once, and no linear track through it survives a change
  // to the drag curve — two cuts of this act missed by a tile and a half and simply never lit the
  // thing. Stopped, the magazine sits at one pixel and stays there, which a cue list can hit
  // exactly. It is also what a person does: you do not bombard a fort at nine knots.
  //
  // The number below is read off the rehearsal rather than derived:
  //
  // ```bash
  // node showcase/emberwake/tools/rehearse.mjs act/beat-magazine.mjs \
  //   --frames 130 --warmup 11400 --target magazine
  // ```
  const MARK_X = 528 / 1280;
  const MARK_Y = 61 / 720;

  // A rough track while she is still closing, so the barrel is alive rather than frozen ahead.
  for (let g = -70; g < 118; g += 4) {
    const k = (g + 70) / 188;
    move(g, width * (0.74 - 0.28 * k), height * (0.27 - 0.16 * k));
  }
  // Then the sight settles on it and stays.
  for (let g = 118; g <= LEAD + frames; g += 12) move(g, width * MARK_X, height * MARK_Y);

  // ── the bombardment ───────────────────────────────────────────────────────────────────
  //
  // Three and a half salvos. The magazine takes three and a half heats and leaks a fifth of one a
  // second, so this is deliberately more than the minimum — a beat that *just* lights it is a
  // beat that misses on any future change to the spread.
  press(150, ' ', 'Space', 32);
  release(250, ' ', 'Space', 32);

  // ── and the shutter opens on the fuse ─────────────────────────────────────────────────
  //
  // She is already at rest ten or eleven tiles out, which is chosen twice over: **outside the
  // seven-and-a-half-tile blast** — standing off is what the magazine teaches, so the shot should
  // be of someone who has learned it — and the range at which the island sits in the upper third
  // of the frame, which is where an explosion wants to be. An earlier cut ran for four seconds
  // after lighting it and was forty tiles away pointing the other way when it went up.
  return cues;
}
