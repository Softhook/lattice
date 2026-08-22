/**
 * **Shot 1 — building the lamp road before the shutter opens.**
 *
 * The caption is "lamps coming on at dusk", and at rest the exhibit has no lamps: the road is
 * unlit because nobody has played it. Warming up to dusk and photographing that gives a pretty
 * hillside and no story. So the warmup plays the game — it presses the exhibit's own
 * "Light the next lamp" button whenever the offerings can pay for it — and by the time the day
 * ramp starts there are nine lamps on the road, each with a light pool, and pilgrims walking
 * between them carrying lanterns.
 *
 * This is not a cheat and it is worth being clear why: every click goes through the button the
 * player clicks, the coin is earned by pilgrims at the rate the exhibit charges, and the price
 * curve refuses a click it cannot afford. The capture reaches a state a player reaches in the
 * same forty seconds. Nothing here writes to the world directly.
 *
 * ## Why the clicks stop a second before the end
 *
 * `ROAD LIT 9 / 10` with a lamp's flare still fading is a picture with something *happening* in
 * it. A click on the last frame of the warmup puts a 0.7 s bloom in frame 0 of the shot and a
 * cut arrives on top of it. The last second of warmup is left quiet so the shot opens settled.
 */
export default function lampRoad({ warmupSteps }) {
  const cues = [];
  // The button is found by its text rather than by a class: the exhibit's own markup is not this
  // file's to depend on, and a class that gets renamed fails silently while a text match throws.
  const define =
    'window.__lamp=()=>{const b=[...document.querySelectorAll("button")]' +
    '.find(b=>/Light the next lamp/.test(b.textContent||""));' +
    'if(!b)throw new Error("lamp-road: no \\"Light the next lamp\\" button on the page");' +
    'if(!b.disabled)b.click();}';
  cues.push({ at: -warmupSteps, events: [{ eval: define }] });
  // Every half second from the top of the warmup to one second before the shutter.
  for (let step = 30; step < warmupSteps - 60; step += 30) {
    cues.push({ at: step - warmupSteps, events: [{ eval: '__lamp()' }] });
  }
  return cues;
}
