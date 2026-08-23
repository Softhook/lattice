# Emberwake

**A ninety-second night raid, built only from `@latticekit/*`.** No asset files of any kind: every
line of the archipelago is drawn from a seed and every sound is three oscillators and a filter.

You have one boat, two guns and until first light. Four powder magazines stand on four islands.
Burn all four before the sun comes up, or the sun finds you in open water.

## What it is for

It exists to answer the one question the rest of this repository deliberately refuses: not "can
the kit express this idea in under two hundred lines", but **"what is the most this framework can
do"**. It is the only thing here allowed to be maximal, which is why it lives in `showcase/`
rather than in `examples/` — see the reasoning in issue #61.

## The loop

| | |
|---|---|
| **the objective** | four magazines, one per big island, each the tallest thing on its skyline and the only red light on the map |
| **the weapon** | shells set wooden things alight, and fire spreads downwind along a neighbour table built at generation. Light the windward end of a village and the whole waterfront goes |
| **the pressure** | five raiders on station from the first frame, shore batteries on every island worth defending, and a fresh wave of three every time a magazine goes up. The fleet gets loudest exactly as you are winning |
| **the clock** | one hundred and five seconds of night. The palette walks from `NIGHT` toward `DUSK` across it, so the colour of the sea *is* the timer — there is no number to watch |
| **losing** | hull to zero, or dawn with magazines still standing. Both end on a card with two ways back in: the same archipelago, or the next one |

Every number in it is Tier A. There is no `sin`, `cos`, `pow` or `exp` anywhere in `world.ts` or
`game.ts`, including the camera shake, so the same seed and the same inputs produce the same run
on any engine.

## Running it

```bash
npm run build     # at the repository root, first: the showcase resolves @latticekit/* through
                  # the workspace symlinks into each package's dist
npm run dev       # http://localhost:5190
```

It resolves `@latticekit/*` through the workspace, not the registry, so it exercises the source in
this tree rather than the last publish. That is deliberate: a showcase that silently tested a
three-week-old tarball would be the same class of mistake as a figure nobody can name a command for.

### The URL

| | |
|---|---|
| `?seed=NAME` | the archipelago. Same seed, same coast, same huts, same wind, forever |
| `?night=F` | open with `F` of the night already gone, 0–1. A capture hatch, not a cheat: it sets an **opening state** and changes no rule |
| `?ablaze=N` | open with the first `N` burnables already alight. The same kind of hatch, for the same reason |
| `?zoom=Z` | the camera's resting zoom. Default 0.9 |
| `?dpr=N` | pin the device pixel ratio. The only honest way to measure the retina case, because the light field is priced by buffer *area* |

## Cost

Measured **inside the page** with `tools/looking/look.mjs --eval`, at worst load — the whole first
island alight at 74 simultaneous fires, the 320-mote pool full, 124 drawables sorted and the light
field at 26 pools:

| | |
|---|---|
| game frame cost | **1.9 ms** at device ratio 1, **2.6 ms** at ratio 2 |
| budget for a 30 Hz floor | 33 ms |
| bundle | 52.5 kB gzipped, all nine packages plus the whole game |

Two caveats on those numbers, both of which make them pessimistic. The headless harness runs with
`--disable-gpu`, so everything above is the **software raster** case; on a real GPU the same scene
measures 9.4 ms worst gap and 7.2 ms cadence end to end. And `frameMs` is the game's own work,
which is the number a game can act on — the gap between it and the cadence is the browser.

## Tools

```bash
node showcase/emberwake/tools/soak.mjs [seed]          # play it headless, print the shape of a run
node showcase/emberwake/tools/rehearse.mjs <act> ...   # run a capture act with no browser
```

`soak.mjs` is the balance instrument: a crude autopilot, a whole run in about a second, and a line
per magazine. Across ten seeds it currently wins five in thirty-six to fifty-five seconds and is caught by dawn
in the other five, which is roughly the spread a game wants from a pilot that never retreats,
never dodges and never gives up on an objective it cannot reach.

`rehearse.mjs` is the *filming* instrument, and it exists because there was nothing between
"write an act" and "launch a browser, warm a world, take two hundred screenshots and look at a
contact sheet" — a twenty-second loop for a file whose entire content is timings. It runs the same
cue list against the same simulation in forty milliseconds and prints the boat's track, and it
warns about the one mistake that is otherwise silent: **a cue earlier than the warmup is never
dispatched**, by this and by `capture.mjs` alike.

## Filming it

Four acts, in `act/`, each driving one beat deterministically. Every one of them was rehearsed
before it was filmed, and the header of each records what went wrong with the versions that were
not.

| act | the beat | |
|---|---|---|
| `beat-broadside.mjs` | a tracking pass down a shoreline at six knots, both guns going, the village catching behind her | `--frames 180 --warmup 1600` |
| `beat-magazine.mjs` | a coast fully alight, then the magazine: shockwave, white flash, six ticks of hit-stop, debris | `--frames 110 --warmup 11400` |
| `beat-gauntlet.mjs` | full ahead through the skerries under fire, shells going into the water either side | `--frames 130 --warmup 7000` |
| `beat-dawn.mjs` | first light over a burning archipelago, with the night gauge almost empty | `--frames 160 --warmup 1600`, on `?night=0.82` |
| `raid.mjs`, `raid-bisect.mjs` | the original two, kept: `raid-bisect` is the reference for the `text`-on-`keyDown` contract | |

```bash
node tools/trailer/capture.mjs 'http://localhost:5190/?seed=emberwake' \
  --size 1280x720 --frames 180 --warmup 1600 \
  --act showcase/emberwake/act/beat-broadside.mjs --out /tmp/ember/broadside
```

**Two traps, both silent, both of which cost a capture round each.**

1. **Every character `keyDown` carries `text` and `unmodifiedText`.** Without them Chrome treats
   the press as raw, matches it against the macOS menu accelerators, opens `chrome://help/` in a
   foreground tab and backgrounds the page — and `@latticekit/input` correctly releases every held
   key on `visibilitychange`, so the film shows a game ignoring its own input.
   `test/contracts/act-keys.test.ts` fails the build on it.
2. **Fire on the space bar, never on a held mouse button.** `fire` is bound to both `tap` and
   `key:Space`; a pointer that *moves* while down stops being a tap, `held('fire')` goes false on
   the first move, and the act fires exactly one salvo. The film that comes back is a boat sailing
   past an island with one puff of smoke and nothing alight, which reads as a broken game.
