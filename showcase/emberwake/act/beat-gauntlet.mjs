/**
 * **Beat 3 — the gauntlet.** Full ahead through the skerries with the fleet on her and shells
 * going into the water either side, past a shoreline she has already set alight.
 *
 * This is the shot that has to say *speed and pressure* with no caption, and it is the only one
 * of the four that is filmed **mid-run rather than mid-event**: the warmup lights the first
 * island and wakes the patrols, the shutter opens two magazines later, and what it catches is
 * ordinary play at the point in the arc where the game is loudest. Nothing in it is arranged.
 *
 * ```bash
 * node tools/trailer/capture.mjs 'http://localhost:5190/?seed=emberwake' \
 *   --size 1280x720 --frames 240 --warmup 12000 \
 *   --act showcase/emberwake/act/beat-gauntlet.mjs --out /tmp/ember/gauntlet
 * ```
 *
 * Rehearse before filming — twelve seconds of warmup is a lot of run to get wrong:
 *
 * ```bash
 * node showcase/emberwake/tools/rehearse.mjs act/beat-gauntlet.mjs --frames 240 --warmup 12000
 * ```
 */
export default function gauntlet({ frames, width, height }) {
  const cues = [];
  const key = (type, k, code, keyCode) => ({
    keyboard: type, key: k, code,
    windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode,
    ...(type === 'keyDown' ? { text: k, unmodifiedText: k } : {}),
  });

  /** Frames from the first key press to the shutter. See `beat-magazine.mjs` for why the whole
   *  act is written in its own time and shifted once. */
  const LEAD = 340;
  const at = (g) => g - LEAD;
  const press = (g, k, code, vk) => { cues.push({ at: at(g), events: [key('keyDown', k, code, vk)] }); };
  const release = (g, k, code, vk) => { cues.push({ at: at(g), events: [key('keyUp', k, code, vk)] }); };
  const move = (g, x, y) => {
    cues.push({
      at: at(g),
      events: [{ mouse: 'mouseMoved', x: Math.round(x), y: Math.round(y), button: 'none', buttons: 0 }],
    });
  };

  // ── the first island, in the warmup ───────────────────────────────────────────────────
  press(-70, 'w', 'KeyW', 87);
  press(-60, 'a', 'KeyA', 65);
  release(-44, 'a', 'KeyA', 65);
  press(-20, ' ', 'Space', 32);
  release(160, ' ', 'Space', 32);

  // ── and then she keeps going, which is the shot ───────────────────────────────────────
  //
  // Two long turns rather than a straight line: the whole point of the beat is that she is
  // *steering*, and a boat holding one heading at full ahead is indistinguishable from a camera
  // panning across a still world. The wake curves, the deck heels, and the skerries go past.
  press(110, 'd', 'KeyD', 68);
  release(164, 'd', 'KeyD', 68);
  press(250, 'a', 'KeyA', 65);
  release(268, 'a', 'KeyA', 65);
  press(378, 'a', 'KeyA', 65);
  release(410, 'a', 'KeyA', 65);
  press(470, 'a', 'KeyA', 65);
  release(496, 'a', 'KeyA', 65);

  // Firing in bursts at whatever is off the starboard bow. Bursts and not a held trigger, because
  // the muzzle flash is the brightest thing in the frame and a continuous one flattens it.
  for (const g of [230, 290, 350, 410, 470, 530]) {
    press(g, ' ', 'Space', 32);
    release(g + 34, ' ', 'Space', 32);
  }

  // The aim sweeps slowly across the bow the whole way, so the gun is always turning and the
  // reticle is always somewhere the eye can find it.
  for (let g = -70; g <= LEAD + frames; g += 4) {
    const k = ((g + 70) % 320) / 320;
    move(g, width * (0.34 + 0.42 * k), height * (0.24 + 0.22 * (k < 0.5 ? k * 2 : 2 - k * 2)));
  }
  return cues;
}
