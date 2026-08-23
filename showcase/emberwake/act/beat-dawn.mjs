/**
 * **Beat 4 — first light.** Eighty seconds into the raid, holding station off a coast she burned
 * a minute ago, with the sky coming up behind it and the fleet closing.
 *
 * The other three beats are events. This one is the *arc*, and it is the only shot in the set
 * that cannot be faked by any amount of staging: the palette walks from `NIGHT` toward `DUSK`
 * across the whole hundred and five seconds of a run, so the colour of this frame is a direct
 * readout of how long the player has left. Cut beside the opening shot it says the entire design
 * in two images and no words.
 *
 * It is also the shot that argues hardest for the zero-asset rule. Nothing here is a gradient
 * somebody painted; it is `Palette.lerp` between two stop sets that live in `art/palette.ts`,
 * quantised to thirty-two levels so the sprite caches survive it.
 *
 * ## `?night=0.82`, and why this beat is the one that needs a hatch
 *
 * The other three acts *play* to their beat. This one cannot, and three cuts of it that tried are
 * in the git history: eighty seconds of unattended steering through an archipelago this dense
 * grounds four times and is sunk at forty-four seconds by patrols that are behaving correctly.
 * The parameter starts the run four fifths of the way through the night and changes nothing else
 * — same seed, same fleet, same clock rate, same escalation — which is honest about what it is
 * doing in a way that a scripted explosion would not be. It is the same class of hatch as
 * `?ablaze`, and it is documented beside it in `main.ts`.
 *
 * ```bash
 * node tools/trailer/capture.mjs 'http://localhost:5190/?seed=emberwake&night=0.82' \
 *   --size 1280x720 --frames 200 --warmup 1600 \
 *   --act showcase/emberwake/act/beat-dawn.mjs --out /tmp/ember/dawn
 * ```
 */
export default function dawn({ frames, width, height }) {
  const cues = [];
  const key = (type, k, code, keyCode) => ({
    keyboard: type, key: k, code,
    windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode,
    ...(type === 'keyDown' ? { text: k, unmodifiedText: k } : {}),
  });
  const press = (g, k, code, vk) => { cues.push({ at: g, events: [key('keyDown', k, code, vk)] }); };
  const release = (g, k, code, vk) => { cues.push({ at: g, events: [key('keyUp', k, code, vk)] }); };
  const move = (g, x, y) => {
    cues.push({
      at: g,
      events: [{ mouse: 'mouseMoved', x: Math.round(x), y: Math.round(y), button: 'none', buttons: 0 }],
    });
  };

  // The opening every act in this directory shares — out of the anchorage, one turn to port, and
  // burn the first island's waterfront — except that here the night is already four fifths gone
  // when it starts, because the URL said so.
  press(-70, 'w', 'KeyW', 87);
  press(-60, 'a', 'KeyA', 65);
  release(-44, 'a', 'KeyA', 65);
  press(-24, ' ', 'Space', 32);
  release(90, ' ', 'Space', 32);
  press(150, ' ', 'Space', 32);
  release(200, ' ', 'Space', 32);

  for (let g = -70; g <= frames; g += 3) {
    const k = Math.max(0, Math.min(1, (g + 70) / 260));
    move(g, width * (0.71 - 0.22 * k), height * (0.3 - 0.09 * k));
  }
  return cues;
}
