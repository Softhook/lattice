/**
 * **Shot 8 — three nights of growth, and the light going.**
 *
 * `Evenfall Orchard` is the hardest shot in the set and this file is mostly an explanation of why.
 *
 * ## What the game actually animates
 *
 * Almost nothing. `from-one-sentence/evenfall-orchard/src/main.ts:55` sways each tree by
 * `sin(pen.t · 1.1 + seed) · 0.035` of a tile — one or two pixels — and the rest of the picture is
 * a palette lerp against a sixty-second day. Measured over 90 frames of the opening state:
 * **0.01 mean channel change frame to frame**, which is a photograph. Filmed as it opens, this is
 * a dead second and a half in the middle of a twenty-second trailer.
 *
 * Two things are wrong with the opening state and both are fixable through the game's own UI.
 *
 * ## 1. The trees are bare, and they need not be
 *
 * `drawTree` hangs `min(4, floor(age / 2))` fruit on every owned tree. The orchard opens at
 * `day 1`, so `age = 1`, so **zero fruit** — a game about an apple orchard with no apples in it.
 * Every evening the game offers *Harvest tonight* or *Let it grow*, and *grow* adds one to `age`.
 * Three nights of `grow` reaches `day 4`, which is two apples on every one of eighteen trees, and
 * turns a green field into an orchard.
 *
 * The evening dialog opens on a **wall-clock day boundary** — `floor(Date.now() / 60_000)`
 * changing — which the virtual clock owns, so it fires at exactly 60 s, 120 s and 180 s of stepped
 * time whatever the machine is doing. The cue below fires every second and clicks *grow* only if
 * the dialog is open, which is cheap and cannot miss the boundary by a frame.
 *
 * ## 2. The light is flat at the wrong hour
 *
 * `sun = 0.5 + 0.5·cos((phase − 0.2)·2π)` is at its steepest at `phase = 0.45`, and phase is
 * `(Date.now() mod 60 000) / 60 000`, which the virtual clock also owns. So the shot is placed at
 * **day 4 + 27 s** — `--warmup 207000` — where the light is falling fastest. It is a 0.08 change
 * in `sun` across a second and a half; small, and the most this game has.
 *
 * ## What is left, stated plainly
 *
 * With both fixes the shot is: a laden orchard, evening coming on, two trees planted mid-shot as
 * the only discrete event. It is still the quietest 1.5 seconds in the trailer, and the edit
 * should treat it as a held frame rather than as motion. Saying so is more use than pretending.
 */
export default function orchardEvening({ frames, warmupSteps }) {
  const cues = [];
  // Every 60 steps, take the evening if it is on offer. A conditional cue rather than a scheduled
  // one, because "the day rolled over" is the game's own event and this file should not have to
  // re-derive when it happens.
  const grow =
    '(()=>{const d=document.querySelector(".evening.open");' +
    'if(d)document.getElementById("grow").click();})()';
  for (let step = 60; step < warmupSteps - 120; step += 60) {
    cues.push({ at: step - warmupSteps, events: [{ eval: grow }] });
  }
  // Two trees planted inside the shot, at 24 apples and 12 a tree. The APPLES pill rolls down and
  // two saplings in the near rows come up to full size — the only cut-on-able beat in the shot.
  const plant = '(()=>{const b=document.getElementById("plant");if(b&&!b.disabled)b.click();})()';
  cues.push({ at: Math.round(frames * 0.2), events: [{ eval: plant }] });
  cues.push({ at: Math.round(frames * 0.55), events: [{ eval: plant }] });
  return cues;
}
