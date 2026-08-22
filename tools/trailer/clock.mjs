/**
 * **The page's clock, taken away from the page.** The source injected at document start, before
 * a single line of the exhibit runs.
 *
 * A screen recorder samples whatever the machine managed to draw. This does the opposite: the
 * world advances only when we say so, so a frame that took 400 ms to render is still exactly
 * 16.667 ms of world, and the resulting sixty frames per second are sixty frames per second on a
 * laptop under load, in CI, or on a machine four times slower.
 *
 * ## The four clocks a page can read, and what each becomes
 *
 * | read | becomes |
 * |---|---|
 * | `performance.now()` | the virtual millisecond count, exactly |
 * | `Date.now()`, `new Date()` | a fixed epoch plus the same count |
 * | the `requestAnimationFrame` timestamp argument | the same count again |
 * | `document.getAnimations()` — CSS animations and transitions | `currentTime` set from the same count |
 *
 * All four have to agree. An exhibit that eases a HUD off `performance.now()` and steps its world
 * off the rAF argument will tear if the two disagree by even a frame, and which of the two an
 * exhibit uses is not something you can know without reading it.
 *
 * ## The one that is easy to get wrong
 *
 * `__step` **captures the pending queue, clears it, and only then invokes**. A rAF callback that
 * re-registers — which is every game loop ever written, and `browserFrames` re-arms *before* it
 * pumps — lands in the fresh queue and is served by the *next* step. Invoke straight out of the
 * live queue instead and you get one of two failures, both of which look like the harness working:
 * a `for (const cb of queue)` that never terminates because the queue refills as it drains, or, if
 * you snapshot the values but not the map, a second callback registered mid-frame running twice in
 * one step and the world advancing at double speed for no reason anybody can find.
 *
 * ## What is deliberately left alone
 *
 * `setTimeout` and `setInterval` keep the real clock. Replacing them means owning the ordering
 * between timers and frames, and every exhibit here drives its world from rAF. The cost is real
 * and is stated rather than hidden: `browserFrames` runs a one-second `setInterval` that pumps the
 * loop when the tab is hidden, and that pump *will* fire during a capture — but it reads the same
 * frozen clock, so its `dt` is zero and it changes nothing. An exhibit that animated something off
 * a timer would stutter, and the way to find out is to look at the frames.
 *
 * ## Two clock modes, because a frozen clock tells one lie
 *
 * `frozen` is the default and the honest one for a *world*: `performance.now()` does not move
 * inside a step, so the sim is a pure function of the step count.
 *
 * It has a consequence worth naming. `loop.stats.frameMs` is `readClock()` after the frame minus
 * `readClock()` before it, so under a frozen clock **every frame costs 0.00 ms** and any HUD row
 * quoting it reads zero. That is not a fast game, it is a stopped clock, and a trailer that put
 * `FRAME 0.00 ms` on screen would be selling a number that is not true. `hybrid` exists to test
 * the alternative — real elapsed time *within* a step, snapping back to the exact virtual
 * boundary between them — and whether it survives a two-run byte diff is a question for the diff,
 * not for an opinion. Where it does not, the row gets hidden instead of faked.
 */

/**
 * A fixed wall-clock origin. Any constant will do; this one is chosen and written down so that a
 * capture taken next year is the same capture, and so that a game keying off the hour of day gets
 * the same hour every run.
 *
 * 2026-01-01T12:00:00Z. Midday UTC, because a game that greets the player by time of day should
 * be greeting them in the middle of the day rather than at a boundary.
 */
export const EPOCH = Date.UTC(2026, 0, 1, 12, 0, 0);

/**
 * @param {{ mode?: 'frozen' | 'hybrid', epoch?: number }} options
 * @returns {string} an IIFE for `Page.addScriptToEvaluateOnNewDocument`
 */
export function virtualClock({ mode = 'frozen', epoch = EPOCH } = {}) {
  return `(() => {
  const EPOCH = ${epoch};
  const HYBRID = ${mode === 'hybrid'};
  const RealPerfNow = globalThis.performance.now.bind(globalThis.performance);

  /** Milliseconds of world time since the page was born. Moved only by __step. */
  let virtual = 0;
  /** Real reading at the moment the current step's callbacks began, or null between steps. */
  let stepRealBase = null;

  const nowMs = () => {
    if (HYBRID && stepRealBase !== null) return virtual + (RealPerfNow() - stepRealBase);
    return virtual;
  };

  // ── Date ───────────────────────────────────────────────────────────────────────────────────
  const RealDate = Date;
  const epochNow = () => EPOCH + nowMs();
  function VirtualDate(...args) {
    if (new.target === undefined) return new RealDate(epochNow()).toString();
    return args.length === 0 ? new RealDate(epochNow()) : new RealDate(...args);
  }
  VirtualDate.prototype = RealDate.prototype;
  Object.setPrototypeOf(VirtualDate, RealDate);
  VirtualDate.now = epochNow;
  globalThis.Date = VirtualDate;

  // ── performance ────────────────────────────────────────────────────────────────────────────
  // Defined as an own property on the instance, which shadows Performance.prototype.now for
  // every caller including \`performance.now.bind(performance)\` captured after this runs.
  try {
    Object.defineProperty(globalThis.performance, 'now', {
      value: nowMs,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis.performance, 'timeOrigin', {
      value: EPOCH,
      configurable: true,
    });
  } catch (err) {
    console.error('capture: could not override performance.now —', err);
  }

  // ── requestAnimationFrame, as a queue that never fires by itself ───────────────────────────
  let nextHandle = 1;
  let queue = new Map();
  globalThis.requestAnimationFrame = (callback) => {
    if (typeof callback !== 'function') throw new TypeError('requestAnimationFrame: expected a function');
    const handle = nextHandle++;
    queue.set(handle, callback);
    return handle;
  };
  globalThis.cancelAnimationFrame = (handle) => { queue.delete(handle); };

  // ── CSS animations and Web Animations, dragged onto the same clock ─────────────────────────
  // These run on the compositor's own clock, which no amount of overriding \`performance.now\`
  // touches. Left alone, a HUD with a two-second pulse on it smears across a shot that took four
  // minutes of wall clock to capture. Each animation is paused the first time it is seen and its
  // \`currentTime\` is written from the virtual clock thereafter, so it advances exactly one frame
  // per step like everything else.
  const born = new WeakMap();
  const driveAnimations = () => {
    if (typeof document === 'undefined' || typeof document.getAnimations !== 'function') return;
    let animations;
    try { animations = document.getAnimations(); } catch { return; }
    for (const animation of animations) {
      let birth = born.get(animation);
      if (birth === undefined) {
        birth = virtual;
        born.set(animation, birth);
        try { animation.pause(); } catch { /* a finished animation refuses; it has nothing left to show */ }
      }
      try { animation.currentTime = Math.max(0, virtual - birth); } catch { /* likewise */ }
    }
  };

  // ── the step ───────────────────────────────────────────────────────────────────────────────
  const errors = [];
  globalThis.__stepErrors = errors;
  globalThis.__vnow = () => virtual;
  globalThis.__vframes = () => queue.size;

  globalThis.__step = (ms) => {
    virtual += ms;
    stepRealBase = HYBRID ? RealPerfNow() : null;
    // Capture, clear, then invoke. See this file's header for what the other orderings do.
    const generation = [...queue.values()];
    queue = new Map();
    for (const callback of generation) {
      try {
        callback(virtual);
      } catch (err) {
        errors.push(String((err && err.stack) || err));
      }
    }
    stepRealBase = null;
    driveAnimations();
    return virtual;
  };

  /** Many steps in one round trip. The warmup is thousands of frames and each one is a socket
   *  message otherwise; forty seconds of settling would take longer than the shot. */
  globalThis.__stepMany = (count, ms) => {
    for (let i = 0; i < count; i++) globalThis.__step(ms);
    return virtual;
  };
})()`;
}
