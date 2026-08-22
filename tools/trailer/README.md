# tools/trailer — the capture half of the launch trailer

**Frames, not a film.** Nine shots, 1280×720, exactly 60 fps, byte-for-byte reproducible. The cut
is somebody else's job; everything here is the material for it.

```bash
node tools/trailer/serve.mjs site/dist 8471     # in one terminal
node tools/trailer/shoot.mjs --print            # the exact command for each shot
node tools/trailer/shoot.mjs                    # capture all nine into shots/<name>/
node tools/trailer/shoot.mjs --encode           # ffmpeg each, then delete its PNGs
```

## Why this is not a screen recording

A screen recorder samples whatever the machine managed to draw, and the frames it drops are the
frames a viewer notices. It is also unfalsifiable in the other direction: a recording that happens
to look smooth on a fast laptop proves nothing about anybody else's.

This kit does not have to be filmed that way, because `AGENTS.md` rule 1 bans `Date.now()` and
`performance.now()` inside every package. Nothing in a Lattice world reads a clock it was not
handed — so the clock can be taken away. `clock.mjs` replaces `performance.now`, `Date`,
`requestAnimationFrame` and the Web Animations timeline before the page's first line runs;
`capture.mjs` then alternates `__step(1000/60)` with `Page.captureScreenshot`. **A frame that took
four hundred milliseconds to render is still 16.667 ms of world.** Sixty frames a second is a
construction here, not a measurement, and that is the honest way to say it.

It works, and it has been checked rather than assumed: two full runs of the same command produce
**byte-identical PNGs**, every frame. See § Proving it.

## The files

| | |
|---|---|
| `capture.mjs` | the harness. One shot, one command |
| `clock.mjs` | the injected virtual clock and rAF queue. The interesting file |
| `cdp.mjs` | a dependency-free CDP client, lifted from `tools/looking/look.mjs` |
| `serve.mjs` | a static server for `site/dist`, so a shot is reproducible from a fixed artifact |
| `shoot.mjs` | the nine-shot manifest and runner. Every per-shot decision lives here |
| `acts/*.mjs` | synthetic input timelines, one per shot that needs one |
| `verify.mjs` | capture twice, diff the PNGs byte for byte |
| `motion.mjs` | is anything actually happening? Changed-pixel fractions |

No npm dependencies anywhere, matching the house rule `look.mjs` already keeps.

## Proving it

```
$ node tools/trailer/verify.mjs http://127.0.0.1:8471/x/crowd/ --frames 40 --warmup 4000
IDENTICAL: 40/40 frames byte-for-byte equal across two runs
  every frame differs from the one before it — the shot is moving
```

Run it before trusting a change to this directory. If it ever says `DIFFER`, either the kit has
started reading a clock it should not, or this harness has started leaking one, and both of those
are worth more attention than a trailer.

## The one thing the frozen clock costs

`loop.stats.frameMs` is `readClock()` after the frame minus `readClock()` before it. Under a clock
that does not move inside a step, that is **0.00 ms on every frame of every shot**. That is not a
fast game, it is a stopped clock, and no shot may put it on screen.

Every exhibit URL therefore carries `?cost=0`, which is `examples/_shared/src/cost.ts` — a switch
the gallery already ships for embedders, and this is precisely the case it was written for. The
counts stay, because they are true and they are the argument: `PEOPLE 900`, `POOLS 692`,
`DRAWN 283`, `1,083 TILES UNDER WATER`.

`--clock hybrid` exists to let the frame cost be real inside a step, and was measured rather than
argued about: it produces honest cost readouts and **0 of 40 frames byte-identical across two
runs**. It is kept only so that the next person does not have to re-derive why the default is
`frozen`.

## What the harness cannot do

- **`setTimeout` and `setInterval` keep the real clock.** Deliberate: virtualising them means
  owning the ordering between timers and frames, and every world here steps from rAF. Nothing in
  the nine shots is driven from a timer. A toast whose *dismissal* is on a timer will outstay its
  welcome by a whole capture, which is a thing to notice rather than a thing that breaks.
- **`?zoom=` on an exhibit URL is silently discarded** by any exhibit that fits its own camera
  after boot — Clay and Canyon both do. Zoom with a wheel event in an act file instead; that is a
  gesture and nothing downstream can throw it away.
- **Audio is muted and uncapturable.** These are frames.
- **A page that never calls `requestAnimationFrame` cannot be captured**, and the harness says so
  rather than producing a clean shot of a blank canvas.

## What is committed here, and what is not

The nine shots and the score are **not** in git. `shots/` and the rendered audio are gitignored,
because `node shoot.mjs --print` emits the exact command behind every clip and `node
score/render.mjs` re-renders the wav from `score.mjs`. Thirty-eight megabytes of output held in a
repository whose whole argument is that it ships no asset files would be a poor joke.

The captures are frame-deterministic — two runs of the same command produce byte-identical PNGs,
verified on a 40-frame shot and on a 120-frame shot carrying a full synthetic mouse drag — so
regenerating is not an approximation of the artifact, it is the artifact.

The rendered audio is the one exception to that guarantee, and it is Chrome's rather than ours:
`OfflineAudioContext` sums a shared input in an allocation-dependent order, so two renders differ
by about one float32 ULP per voice. What `@latticekit/audio` *decides* — the `VoicePlan` stream —
hashes identically across separate browser processes.
