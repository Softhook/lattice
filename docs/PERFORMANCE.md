# Performance

Numbers, not convictions. Every claim in the kit's documentation about speed should be
traceable to a row in this file, and every row should be reproducible with `npm run bench`.

**Machine:** Apple Silicon, Node v24.18. Vitest `bench`, which reports throughput (`hz`) and a
latency distribution per operation. Inputs are cycled through a 1,024-entry table so nothing
is loop-invariant and V8 cannot hoist the work out of the loop.

**Budget:** 8 ms per frame for everything, from `.lattice/kit.json`.

---

## Method notes

Read these before the first table; every number below is measured under them.

- **p50 and p99, never a mean alone.** A mean hides precisely the frame that stutters, which
  is the one a player notices. The allocation section immediately below is the whole argument
  for this rule, and it is the reason the rule is stated before any number is quoted.
- **Fixed seeds.** Every benchmark drives its inputs from a seeded `Rng`, so the workload is
  identical between runs and a change in the number is a change in the code.
- **The machine is named**, because a number without one is not reproducible.
- **Regressions stay in the table.** A row that got worse is more useful than a row that
  quietly disappeared.

---

## The allocation question, and what the benchmark actually said

The kit's rule 7 — *the hot path allocates nothing* — costs something real: every vector
signature takes an output parameter, so every call site is two characters longer and the
caller has to own a scratch value. That is worth paying only if the alternative is worse.

The naive way to check is to compare mean throughput, and **by that measure the rule looks
wrong.** Allocating is not slower:

| operation | ops/sec | rme | max latency |
|---|---:|---:|---:|
| allocating add, result escapes | 50,709,067 | ±0.91% | **2.3168 ms** |
| out-parameter add, identical work | 40,714,999 | ±0.06% | **0.0274 ms** |
| `v2()` — the allocator alone | 38,616,663 | ±0.88% | 2.2308 ms |

The allocating form wins on throughput by about 25%, and that is not a measurement error —
V8's nursery is a bump allocator, and an object that dies in the same iteration is close to
free to create and free to collect.

**Look at the last column.** The allocating form's worst observed call is **85× slower** than
the out-parameter form's, and its variance is 15× higher. That is the garbage collector,
showing up exactly where a mean cannot see it. A 2.3 ms pause inside an 8 ms budget is not a
slow frame; it is a dropped one, and it arrives in a burst rather than spread evenly, so the
player sees a hitch rather than a lower frame rate.

So the rule stands, but **not for the reason it is usually given.** Out-parameters are not
faster on average. They convert a small, occasional, unpredictable cost into no cost at all,
and the thing a game is protecting is its frame-time tail, not its mean. Anyone tempted to
relax the rule because "allocation is cheap now" is right about the mean and wrong about the
only number that matters.

Corroborating: 3M out-parameter calls with a forced GC either side retain **~4.6 kB**, which
is measurement noise. There is nothing for a collector to do.

---

## `@latticekit/core`

### vec2 — the per-entity path

| operation | ops/sec | ns/op | notes |
|---|---:|---:|---|
| `v2Perp` | 42,620,759 | 23.5 | |
| `v2AddScaled` | 42,033,785 | 23.8 | |
| `v2Add` | 41,993,039 | 23.8 | |
| `v2Rotate` | 41,297,658 | 24.2 | **Tier B** — `sin`/`cos`, presentation only |
| `v2Lerp` | 40,694,002 | 24.6 | |
| `v2Normalize` | 40,381,007 | 24.8 | two divisions, not a reciprocal multiply — `3 * (1/5)` is `0.6000000000000001` and `3/5` is `0.6`, and both are Tier A |
| `v2Dot` | 37,518,681 | 26.6 | returns a scalar, so allocates nothing by construction |
| `v2Len` | 37,036,077 | 27.0 | |

The ns/op figures include the harness's per-iteration overhead and a table lookup, so they
are an upper bound on the operation itself; the *ratios* are the meaningful part.

### rng and hash — the per-tile path

| operation | ops/sec | notes |
|---|---:|---|
| `mix32` | 37,875,442 | fmix32 avalanche |
| `hashStep` | 35,711,376 | the fold `hash2` and `hash3` are built from |
| `hash2` | 33,364,528 | one per visible tile per frame |
| `hashString` (short key) | 31,219,018 | |
| `hash3` | 30,825,261 | one per track per step in the audio deck |
| `noise2` | 14,763,965 | gradients from a fixed direction table, no `sin` |
| `fbm2`, 4 octaves | 3,729,100 | 3.96× `noise2`, which is the expected cost of four lookups |

**Stateless hashing costs almost nothing against a stream.** That matters more than the raw
number: `hash2` depends only on its coordinates, so a renderer may visit tiles in any order
and get the same field, while an `Rng` stream depends on how many draws came before it. If
the hash had been meaningfully slower, that correctness property would have needed arguing.
It is within 12% of `mix32`, so it does not.

### Frames

| workload | per frame | share of the 8 ms budget |
|---|---:|---:|
| 400 sprites × 3 vector ops (1,200 ops) | 12.8 µs | **0.16%** |
| 2,400 terrain tiles, one `hash2` each | 22.9 µs | **0.29%** |

Both are the realistic per-frame load for their subsystem, and together they are under half a
percent of the budget. The interesting consequence is that **vector maths and terrain hashing
are not where an isometric game's frame time goes** — the draw calls are. Optimising either
of these further would be optimising the wrong thing, and this table exists partly so nobody
does.

---

## `@latticekit/sim`

The economy's whole design rests on closed form rather than iteration, so these numbers are
the argument for it rather than a report on it.

| operation | time | notes |
|---|---:|---|
| `costOfNext` | ~52 ns | |
| `maxBuyable` | ~210 ns | **O(1)**, and 12× a 400-step buy loop — the loop is legitimate only as a test oracle |
| `buildFlow` | ~90 ns | |
| `integrate` — fourteen hours in one step | ~485 ns | the step size does not appear in the cost, which is the point |
| `project` | ~510 ns | |
| `solveCrossing` — degree 1 | ~330 ns | |
| `solveCrossing` — degree 4 | ~920 ns | derivative isolation plus bisection |
| `advanceOver` — a 20-hour absence, 1,646 phases | 0.93 ms | |
| `advanceOver` — a **six-month** absence | 1.12 ms | |

The last two rows are the whole thesis in two lines. Six months costs 20% more than twenty
hours, and only because the longer absence credits the full 24-hour horizon — the *duration*
is not in the complexity at all. A tick-based economy would have needed 15.7 million steps
for that row.

---

## `@latticekit/loop`

| path | rate | per call |
|---|---:|---:|
| idle pump, no subscribers | 26.9 M/s | ~37 ns |
| pump: 1 step, 1 update, 1 render | 10.6 M/s | ~94 ns |
| pump: 32 update + 32 render subscribers | 2.87 M/s | ~348 ns |
| full catch-up pump (14 steps, then the clamp) | 2.47 M/s | ~405 ns |
| `timeline.advance`, 64 timers all due | 1.11 M/s | ~904 ns |
| `tweens.step`, 200 live tweens | 826 k/s | ~1.21 µs (~6 ns/tween) |
| `replay`, 10,000 ticks | — | **~11.2 M ticks/s** |

The loop's own share of an 8 ms budget is about **0.005%**. The replay figure matters for a
different reason: verifying an hour of recorded play takes under a third of a second, so a
divergence check is something CI can run on every commit rather than a thing anyone schedules.

### A green `worstFrameMs` is not proof of no hitch

**`frameMs` and `worstFrameMs` are the pump's own wall time.** The loop reads its injected clock
on the way into a pump and on the way out; the difference is the work it did. A garbage
collection, a style recalculation, or anything else the browser chooses to do **between** two
pumps is in neither reading and cannot appear in either number, ever. That is not a bug in the
measurement — it is the boundary of what the measurement is — and it matters because
`docs/GALLERY.md` § Scale's cost row made the worst frame in ten seconds the figure every exhibit
is gated on.

It failed in both available directions before it was fixed. `crowd`, hunting a tail caused by
3.7 MB/s of canvas allocation inside `draw`, measured **23.1 ms worst on one machine and 13.1 ms
on another for the same build** — whether the pause lands inside a pump is machine-dependent and
the readout was not. `terraces` shipped a HUD reading **0.0 ms** against a separately measured
9.2 ms gap. Four exhibits ended up hand-rolling their own meter, and three of them reported a
different wrong answer.

So `@latticekit/loop` now publishes **both instruments**, and the pump pair was not redefined:

| field | measures | sees a pause between pumps? | contains the display period? |
|---|---|---|---|
| `frameMs`, `worstFrameMs`, `overBudget` | the pump's own work | **no** | no |
| `worstGapMs`, `cadenceMs` | paint-to-paint wall time, over a rolling `windowMs` | **yes** | **yes** |

Measured on the live `terraces` exhibit (Apple Silicon, Chrome, `?seed=contour`), one 24-frame
sample, both figures read off the same loop at the same instant:

| | reading | what it would have said |
|---|---:|---|
| `worstFrameMs` — the old gate | **4.6 ms** | 58% of an 8 ms budget. Comfortably passing |
| `worstGapMs` — the new one | **69.2 ms** | one picture held for eighteen display periods |
| `cadenceMs` | 3.7 ms | the period the frames were actually being delivered at |

The exhibit's own hand-rolled meter independently computed 69.2 ms on the same frames, which is
the cross-check: the two instruments agree about the world and disagree about nothing except
which question they answer.

**Read `worstGapMs` against `cadenceMs`, never against `budgetMs`.** A gap contains a whole
display period that is not work — 16.7 ms is a perfect frame at 60 Hz and 8.3 ms is a perfect one
at 120 — so the verdict is the ratio, not the number, and `budgetMs` remains a work budget
belonging to `overBudget`. Two exclusions keep it honest rather than flattering: a gap of
`absenceMs` or more is a hidden tab and is counted in `stats.absences` instead of being reported
as a 96-second frame, and the opening `warmupFrames` gaps are the page's load rather than the
scene's steady cost and are discarded while `stats.warmingUp` says so.

One measurement note that cost an hour and generalizes: **an exhibit in a background tab paints
nothing at all**, so every frame-time figure it reports is either zero or stale. `terraces` read
`0.0 ms` in a hidden tab and 69.2 ms in a visible one, from the same build, seconds apart. Check
`document.visibilityState` before believing a frame number measured through tooling.

---

## `@latticekit/audio`

Measured with no device, which is the honest way to measure the policy layer — it is the half
that runs on every call whether or not a speaker exists.

| operation | rate | per call |
|---|---:|---:|
| `play`, dropped by the throttle | 39.1 M/s | ~26 ns |
| `bed.set`, unchanged figures | 13.2 M/s | ~76 ns |
| `deck.pump`, per step | 10.0 M/s | ~100 ns |
| `bed.set`, new figures | 8.6 M/s | ~117 ns |
| `play`, accepted | 7.1 M/s | ~141 ns |

A rejected `play` is 5× cheaper than an accepted one, which is the right shape: the throttle
exists precisely for the case where a game fires the same sound forty times in a frame.

---

## `@latticekit/persist`

| operation | rate |
|---|---:|
| `autosave.tick` on a non-writing frame | 36.4 M/s |
| `Recorder.mark` on a non-checkpoint tick | 54.4 M/s |
| `ReplayVerifier.mark` on a non-checkpoint tick | 56.9 M/s |
| `encode` — 20 buildings / 400 buildings | 344 k/s / 7.7 k/s |
| `decode` — 20 buildings / 400 buildings | 294 k/s / 18.8 k/s |

The first three are the ones that run every frame, and all three are effectively free. The
encode/decode figures are per *save*, which happens every few seconds at most.

---

## `@latticekit/input`

Every row here is on a per-frame path. Nothing else in the package runs more than once per scene.

| path | rate | per call |
|---|---:|---:|
| `submit` — one `pointermove` into the open bucket | 37.7 M/s | ~27 ns |
| `hoverTile` — the query a placement ghost makes every frame | 21.1 M/s | ~47 ns |
| `frame` — integrating a glide | 18.6 M/s | ~54 ns |
| `tick` — an empty bucket, which is most ticks | 14.5 M/s | ~69 ns |
| `tick` — a realistic frame: 8 coalesced moves delivered as drags | 1.41 M/s | ~708 ns |
| `tick` — the stall case: 1,000 moves in one bucket | 10.2 k/s | ~98 µs |

The fifth row is the one to read: **a realistic input frame is 0.009% of the 8 ms budget.** A
120 Hz pointer mid-drag delivers two to eight coalesced positions per displayed frame, each of
which is submitted, buffered, recognized, resolved to a tile through the frozen camera, and
dispatched to a handler — all of it for about seven hundred nanoseconds.

The last row is deliberately pathological: a tick that arrives after the browser has queued a
second of input. At 98 µs it is 1.2% of the budget, which is the answer to "what does a stall
cost" — it costs a slow frame, not a dropped gesture, because the collapse rule spends precision
and never events.

### The allocation claim, measured

**Three million `move` samples through three thousand ticks retain zero bytes**, with a forced
GC either side (`node --expose-gc`, three runs, all within noise of zero — the heap is fractionally
*smaller* afterwards than before, because the forced collection also clears the warm-up).

Three things are doing that work, and all three are load-bearing rather than clever:

- **The buffer owns its slots for the life of the system.** A bucket has a `count` and an array
  whose `length` is capacity; emptying is `count = 0`, never `length = 0`, so the slot objects
  survive to the next tick. `submit` copies a caller's sample into a slot, which is also why the
  DOM adapter can reuse one object per event kind for ever.
- **The gesture handed to a handler is the same object every time** — one per kind, for the life
  of the system. A fresh event object per pointer move, sixty times a second, is a garbage
  collector pause with a nice API. (Copy what you keep; retaining one keeps a reference to next
  tick's gesture.)
- **Recording is the one path that allocates**, one small object per sample, and only while a
  recorder is running. A game that never calls `record` pays none of it.

The rule this confirms is the one in the allocation section at the top of this file: the number
that matters is not the mean, it is the frame-time tail, and the way to protect the tail is to
give the collector nothing to do.

---

## `@latticekit/draw`

**The draw calls are where an isometric game's frame time actually goes.** `core`'s tables above
put vector maths and terrain hashing together at under half a percent of the budget and said so
explicitly; this section is the other side of that sentence.

### What is being measured, and what is not

Everything this package does per frame is **geometry and command submission**: project corners
into `pen.xy`, derive three face colors from one, and hand `(buffer, count, color)` to a
backend. The benchmark backend (`test/null-surface.ts`) consumes those calls and folds every
coordinate into a checksum — so V8 cannot delete the frame — and rasterises nothing.

Rasterisation happens inside the browser's compositor, is not reachable from Node, and is **not
what a sprite cache would save**: a cached sprite is blitted at the same size it would have been
drawn. What a cache replaces is exactly the column below.

The device pixel ratio is set to 3 — a phone — and appears in the numbers not at all, which is
the point: `Surface` coordinates are CSS pixels and the ratio is the backend's business.

### The frame

A building of 42 draw calls: a plinth, a body, a setback that branches on upgrade level, ten
windows, a gabled roof, a tank, a mast, six lit windows, a contact shadow and one animated glow.
The camera is pulled back far enough that **nothing is culled**, so these are worst-case frames.

| workload | mean | p99 | share of the 8 ms budget |
|---|---:|---:|---:|
| 200 sprites × 42 ops, dpr 3 | 1.06 ms | 1.15 ms | **13%** |
| **400 sprites × 42 ops, dpr 3** | **2.14 ms** | 2.24 ms | **27%** |
| 1,000 sprites × 42 ops, dpr 3 | 5.40 ms | 5.57 ms | 68% |
| 400 sprites, dpr 1 | 2.17 ms | 2.30 ms | 27% |
| 400 buildings + 120 lamps, night mask composited once | 2.22 ms | 2.33 ms | 28% |
| 2,400 terrain diamonds | 0.44 ms | 0.49 ms | 5.5% |

The last three rows each answer a question someone would otherwise have to guess at. **The device
ratio is not in the geometry** — 400 sprites cost the same at dpr 1 and dpr 3, to within the
noise, which is invariant 3 measured rather than asserted. **A full night is nearly free**: 120
emitters and a composite add 0.03 ms to a 400-sprite frame, because pools accumulate into one
buffer and the darkness is cut once rather than per lamp. And terrain, the thing that *looks*
like the big loop, is a twentieth of the budget.

### The cache verdict

The RFC wrote `cache` as provisional and named deleting it as a clean outcome. **It is deleted,
and this is the number.**

| | 400 sprites |
|---|---:|
| direct path, every sprite drawn from its massing | 2.14 ms |
| **a perfect cache: key, lookup and blit, 100% hits, no misses** | **0.04 ms** |
| the most a cache could ever save | 2.10 ms, of an 8 ms budget |

A cache does not make a frame free; on a hit it still builds the key — sprite id, level, seed,
flags, quantised progress, palette revision, zoom bucket — looks it up, and submits a blit. So
the honest comparison is not "2.14 ms versus nothing" but "2.14 ms versus 0.04 ms plus four new
ways to render something stale": zoom buckets, palette revisions, blit snapping, and a
don't-fill-while-moving rule that exists because filling during a pinch is *strictly worse* than
no cache at all. Add 8 MiB of resident bitmaps on a phone.

At the demo's real load — two to four hundred sprites — the direct path is 13% to 27% of the
budget. That is the "fits with headroom" the RFC set as the test, so the module is not built.

**The condition under which this reopens is in the table above**: a thousand buildings of this
complexity is 5.40 ms and 68% of the budget, and that is where a cache would start to earn what
it costs. It is a row rather than a footnote so that whoever hits it can point at the number.

Nothing else in the package depended on the decision. `SpriteDef`, `Variant` and the
`massing`/`animate` split all exist for reasons that outlive it — the split is what makes a
sprite's static art declarative and its motion explicit, and it enforces *something moves on
every building* structurally rather than by memory.

### Per primitive

A thousand calls each, so a regression can be attributed rather than merely noticed.

| primitive | per 1,000 | per call | ops submitted |
|---|---:|---:|---:|
| `isoRoof` | 0.48 ms | 0.48 µs | 4 |
| `isoBox` | 0.45 ms | 0.45 µs | 4 |
| `isoCylinder` | 0.45 ms | 0.45 µs | 4 |
| `isoTile` | 0.18 ms | 0.18 µs | 1 |
| `isoPost` | 0.15 ms | 0.15 µs | 1 |
| `wallText` | 0.10 ms | 0.10 µs | 1 |
| `glowDot` | 0.09 ms | 0.09 µs | 2 |
| `contactShadow` | 0.07 ms | 0.07 µs | 1 |

The ordering is the op count, almost exactly, which is the shape you want: the cost of a solid is
what it submits, not what it computes. `isoBox` projects **four** x values for its eight corners
— the top four sit directly above the bottom four and elevation moves screen y alone — which is
`iso`'s separable `toScreenX`/`toScreenY` paying for itself on the innermost line of the package.

### Two things that are not on the frame path, measured anyway

| operation | time | notes |
|---|---:|---|
| `spriteHeightPx`, 400 sprites | 0.18 ms | a measuring replay of the whole massing. Cache the result per instance; it changes only with the variant |
| `palette.lerp` across a six-second dusk, 361 calls | 0.05 ms | and it bumps `rev` **32** times, not 361 — the quantisation that stops a transition invalidating everything downstream on every frame of it |

### Allocation

`test/invariants.test.ts` reads the source of every function a frame calls and rejects object
literals, array literals, closures and `new` in any of them — the same instrument `iso` settled
on, for the same reason it settled on it: **a heap delta cannot see this failure.** The objects a
leaking primitive creates are dead the instant they are made, so a scavenge collects them and
`heapUsed` ends where it started; a garbage-collection *count* survives that argument but not the
environment, because the module loader and the runner are collecting too.

One `Pen` per frame is this package's entire per-frame allocation. That includes the seeded `Rng`
each sprite hook receives: streams are held by seed and rewound in place, because `core` is
explicit that one `Rng` per sprite per frame is precisely the small, short-lived, invisible-in-a-
mean allocation the rule at the top of this file exists to prevent.

## `@latticekit/ui`

| operation | per call |
|---|---:|
| `setText`, unchanged value | 22 ns |
| cadence dispatch, 32 subscribers | 51 ns |
| roll paint step | 250 ns |
| `floats.spawn` | 339 ns |
| `applyPalette`, unchanged (10 keys) | 991 ns |

A busy HUD costs about **4.5 µs** of an 8 ms frame. The `setText` figure is the interesting
one: it is a guard, not a write, and it exists because assigning `textContent` invalidates
layout whether or not the string changed. Twenty readouts updating every frame with the same
numbers is a layout pass per frame for nothing.

---

## `showcase/emberwake`

**Machine:** Apple M5, 10 cores, macOS 26.5.1, Google Chrome 151.0.7922.173 headless
(`--headless=new`), Node v24.18.0, viewport 1280×720, device scale factor 1. Idle machine.

**Budget: 33 ms.** Emberwake is held to 30 fps rather than the kit's 8 ms, on the owner's call —
it is the maximal showcase and its whole purpose is to spend what the kit can afford. The 8 ms in
`.lattice/kit.json` still binds every package and every exhibit, and the numbers below happen to
be inside it anyway.

**What is measured:** `loop.stats.frameMs`, sampled inside the page from a `requestAnimationFrame`
of its own, so no CDP round trip is in it. That is the pump's own work — update plus render, the
whole of what the game is responsible for. `cadenceMs` is beside it because the pump's work is not
the whole frame: rasterisation happens after the pump returns and is in the cadence and nowhere
else. Reading only `frameMs` is how a fill-rate problem hides, and one of the rows below is one.

`?ablaze=60` opens with sixty things already alight, which drives the fire to its ceiling — 74
props burning, the 320-mote pool full, and the light field at its `MAX_POOLS` cap of 30. It is a
worse scene than the game produces on its own.

| operation | n | p50 | p99 | budget | verdict |
|---|---:|---:|---:|---:|---|
| frame, at rest | 2,103 | 1.04 ms | 1.18 ms | 33 ms | **pass** — 3.6% |
| frame, 74 fires / 320 motes / 30 pools, idle | 1,866 | 1.42 ms | 1.99 ms | 33 ms | **pass** — 6.0% |
| frame, same scene, under way and firing | 3,099 | 0.98 ms | 1.89 ms | 33 ms | **pass** — 5.7% |
| frame, same scene, `?dpr=2`, **software raster** | 507 | 2.25 ms | 3.57 ms | 33 ms | **pass** — 11% |
| frame, same scene, `?dpr=2`, GPU raster | 2,401 | 1.17 ms | 1.40 ms | 33 ms | **pass** — 4.2% |
| **painted cadence**, `?dpr=2`, **software raster** | 507 | — | — | 33 ms | **33.5 ms — at the line** |
| painted cadence, `?dpr=2`, GPU raster | 2,401 | — | — | 33 ms | **pass** — 7.3 ms |
| painted cadence, dpr 1, either raster | 1,866 | — | — | 33 ms | **pass** — 8.2–8.6 ms |

### The one row that is not free, and why it is machine-dependent

At `dpr=2` under **software** rasterisation the pump still costs 2.25 ms, and the painted cadence
is **33.5 ms** — a 4× collapse that `frameMs` cannot see, because none of it happens inside the
pump. Turn GPU raster on and the same scene at the same ratio paints in **7.3 ms**. The work is
fill rate on a 2560×1440 surface and nothing else: the light field is priced by buffer *area*
(hence `scale: 0.42` in `main.ts`), and area is what doubling the ratio quadruples.

So the owner's instinct that this is "a computer + browser thing" is right, and it is worth being
precise about *which* half is: **the pump is machine-independent** — 1–2 ms of geometry and
command submission everywhere measured — **and the paint is not.** A retina laptop with GPU raster
pays nothing for its ratio. A machine falling back to software raster pays four times, and that is
the only configuration in this table that reaches its budget.

Every capture in `tools/trailer` runs `--disable-gpu`, so a trailer shot at `--dpr 2` is measuring
the worst row in this table rather than the one a player gets.

### The 200x collapse in #62 was the harness, not the game

Filed as a reproducible 200× collapse under movement plus firing: 434.6 s for eight frames. It was
not the game. `showcase/emberwake/act/raid-bisect.mjs` sent `keyDown` cues with virtual key codes
and **no `text`**, which Chrome treats as a *raw* press and re-offers to the macOS menu
accelerators; Chrome opened `chrome://help/` in a new foreground tab, the exhibit went to the
background, and a background tab produces no BeginFrames — so Blink's rAF-aligned mouse-move queue
never flushed and every `Input.dispatchMouseEvent` fell back to its 5-second timeout.

| operation | n | before | after | verdict |
|---|---:|---:|---:|---|
| `Input.dispatchMouseEvent`, act cue | 82 | 5,015 ms | 1–11 ms | **fixed** — the whole of the collapse |
| `capture.mjs --warmup 1400`, warmup phase | 84 steps | 372.8 s | 0.9 s | **fixed** |
| `capture.mjs --warmup 1400`, 8-frame shot | 8 | 40.4 s | 0.3 s | **fixed** |
| the same capture, end to end | — | 413.2 s | **2.4 s** | **172× faster** |
| `Page.captureScreenshot`, 1280×720 PNG | 8 | 42 ms | 40 ms | unchanged — the real floor of a capture |
| the game's own frame during all of it | — | ~1 ms | ~1 ms | never moved |

82 mouse cues × 5.01 s is 411 s of a 413 s run. The game's frame cost was 1 ms throughout, which
is why the frames looked identical: **nothing expensive was happening, and nothing was happening
at all.** The second-order damage is worse than the timing. `@latticekit/input` releases every held
key on `visibilitychange` — correctly; that is the stuck-key guard — so the act's `W` was dropped
the instant the tab went to the background and the boat never got under way. The row in #62 headed
"movement + firing" contained no movement. With the fix the same act ends its shot at throttle 1
and 9.06 tiles per second.

`test/contracts/act-keys.test.ts` pins it: every character `keyDown` in every act carries its
`text`. Verified by deleting the fix and watching it go red.

### Things measured that turned out to be fine — do not re-optimise these

- **The light field.** 30 pools at the cap, composited once, at the top of the fire. It is inside
  the 1.4 ms p50 above, and `?ablaze=60` versus at rest is a difference of 0.4 ms.
- **The depth sorter and the two forward walks over it.** 58 drawables at the peak. Not visible.
- **`Page.captureScreenshot` at 40 ms.** It is 94% of a capture's wall clock now and it is the
  harness's floor, not the game's — the PNG encode of a 1280×720 surface.
- **`sound.unlock()` on the first key**, 97 ms one-off to construct the `AudioContext`. It is
  real, it is once, and it is on a gesture rather than in a frame.
