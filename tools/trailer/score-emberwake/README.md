# Emberwake — the score

Twenty-eight seconds of music for the Emberwake trailer, synthesized entirely by
`@latticekit/audio`. **There is no sample file, no loop, no downloaded instrument and no second
runtime dependency in this directory.** A kit whose first claim is *zero assets* cannot advertise
itself over a stock music download without contradicting itself in its own soundtrack, so this is
the point of the exercise rather than a constraint on it.

This is the *second* score in the repo. `tools/trailer/score/` is the first, it is still the
launch trailer's music, and nothing here touches it — the two are deliberately separate copies of
the same four-file harness so that neither can break the other.

## One command

```bash
node tools/trailer/score-emberwake/build.mjs
```

`tsc --build` → render → analyze → a gate that fails the run if the master is not 28.020 s,
48 kHz, stereo, peaking near −1 dBFS with nothing at full scale. `--skip-build` skips only the
`tsc` step, for the tuning loop.

## What it produces

| file | what it is |
|---|---|
| `score.wav` | the master. 28.020 s, 48 kHz, stereo, 24-bit, −1.00 dBFS peak, 0 samples at full scale |
| `stem-pulse.wav` | the sequencer alone — drums, bass, ostinato, hats |
| `stem-melody.wav` | everything with a tune in it: bells, tolls, plucks, chimes, and the fake reverb |
| `stem-floor.wav` | the engine, the subs, the two hits, the blast, the sea and the wash |
| `score.png` | the waveform over a log-frequency spectrogram, with every cut point ruled on and a half-second ruler |

The three stems sum to the master sample for sample — measured at −74.6 dB of residual, which is
24-bit quantization of three files and nothing else. **A stem may peak above the master** (the
floor stem does, at −0.66 dBFS): the master is quieter there because the stems partially cancel,
which is a fact about the mix and not a fault in the split.

## The files

| file | what it does |
|---|---|
| `score.mjs` | the score. Pure — no clock, no globals, no filesystem. Every timing in the locked cut is a named constant |
| `render.mjs` | serves `packages/{audio,core}/dist` to a headless Chrome and renders through `OfflineAudioContext`. Prints the determinism verdict |
| `page.html` | the browser half. The import map is the only build step, so what renders is the published module graph |
| `wav.mjs` | 24-bit WAV in and out, in eighty lines. Pure, so the render and the analysis cannot disagree about what a sample is |
| `analyze.mjs` | peak, per-section RMS, the arc a second at a time, four-band balance, transients against the grid, the one-frame sync check, and the picture |
| `build.mjs` | the one command, and the gate |

## Why a browser

`@latticekit/audio`'s whole rendering half is Web Audio. Rendering it in Node would mean
re-implementing `BiquadFilterNode` and `exponentialRampToValueAtTime`, and a score that sounded
right against my re-implementation and wrong against a browser is a worse outcome than no score.
An `OfflineAudioContext` is the same code path a player hears, run faster than real time.

## Determinism

`render.mjs` renders five passes in one page and prints two columns, because there are two
questions and they have different answers.

| | plans | samples |
|---|---|---|
| the same score, twice | **identical** | different |
| steady vs jittering pump, intensity held | same **set**, different order | different |

**What the package decides** — the stream of `VoicePlan`s, which is pure Tier A policy driven by
an injected clock — is bit-identical every time. **What the browser computes from those decisions**
is not: two renders of the same oscillator graph differ by about a float32 ULP, and a chain of
biquads amplifies that to roughly −100 dBFS. The kit's determinism claim holds at the layer it is
made about and cannot hold below it; no audio kit's can.

The jitter pass is the useful one. Pumped at irregular intervals — 13 ms to 1.2 s, all inside the
deck's 1.5 s horizon — the sequencer emits the **same notes at the same times and the same gains**
and only the order they are emitted in changes, which is the pump's order and not the music's.
That is the property that says a note is pinned to the audio clock rather than to whoever asked.

With the intensity *moving*, the two disagree by three voices out of 552, and that is correct
rather than broken: `MusicDeck.setIntensity` is sampled at schedule time, so which side of a layer
change a bar lands on depends on when the pump happened to ask.
