# The Lattice trailer — the score

Thirty seconds of music for the three-act trailer, synthesized entirely by `@latticekit/audio`.
**There is no sample file, no loop, no downloaded instrument and no second runtime dependency in
this directory.** A kit whose first claim is *zero assets* cannot advertise itself over a stock
music download without contradicting itself in its own soundtrack, so this is the point of the
exercise rather than a constraint on it.

This is the **third** score in the repo, and it deliberately quotes the second.
`tools/trailer/score/` is the launch montage and `tools/trailer/score-emberwake/` is the night-raid
piece whose D Phrygian material *is* this film's third act. Nothing here imports across: all three
are separate copies of the same five-file harness, so none of them can break the others.

## One command

```bash
node tools/trailer/score-v2/build.mjs
```

`problems()` → `tsc --build` → render → analyze → a gate that exits non-zero if any of the
assertions below fail. `--skip-build` skips only the `tsc` step, for the tuning loop.

## The one musical idea

Act three is a raid and its material already existed: **`D E♭ A F`** over a D pedal, whose middle
interval — `E♭` up to `A` — is a tritone. The job of acts one and two is to make that arrival feel
*implied* rather than bolted on, so the same four-note shape opens the film with its second degree
**natural**:

| | shape | middle interval | mode |
|---|---|---|---|
| 0:00.9, the wordmark | `D E A F` | E→A, a perfect fourth | D minor with no sixth degree at all |
| 0:16.0, the turn | `D E♭ A F` | E♭→A, **the only tritone in the file** | D Phrygian |

Same rhythm — two half notes and a longer fourth that lands on the next picture cut, at 0:02.5 and
at 0:17.4. Same register. Same contour. One note moves down a semitone.

Three quieter things move with it and none of them is nameable by a listener:

1. **The scale.** Acts one and two are `D E F G A C`, which is *literally tritone-free*: no two of
   those six degrees are six semitones apart. `problems()` proves it from the array rather than
   claiming it in a comment. Act three adds E♭ and B♭ and becomes D Phrygian.
2. **The instrument's own third.** A bell rings at roughly 1 : 1.2 : 2 : 3 above its hum and that
   1.2 is a *minor* third. Act one's `open` puts a **1.5** there instead, so it has no third at all
   and cannot be major or minor. At 0:16 `bell` arrives and the partial flattens too.
3. **The reflections.** There is no reverb in the package and cannot be one, so every exposed note
   is struck twice more, at 45 ms and 240 ms, quieter and thrown across the field. Acts one and two
   echo through `ghost`, which is open at 1.7 kHz; act three through `shade`, which is the same
   thing with 400 Hz taken off.

And one thing is withheld: *Before the Bell* at 0:14.5 plays `D E A` and stops, so the ear is
waiting for a fourth note when 0:16.0 answers with a flattened one. The shot is called Before the
Bell and the bell does not ring; the two withheld things are the same withheld thing.

## The stereo field, which is narrower than it looks

Two things were measured rather than assumed, and one of them changed the score.

Emberwake placed each reflection at `sourcePan × reflectionPan`, which mirrors the source and
pushes it 15% further out. That is geometrically reasonable and it does almost nothing: this film's
notes are panned between ±0.10 and ±0.34, so the reflections came back between ±0.12 and ±0.39 and
the **side channel measured 21 dB under the mid**. A reverb that is 21 dB down and in the middle is
not a room, it is a chorus. A reflection comes off a *wall*, and where the wall is does not depend
on where the player is standing, so the position is now a fixed offset with the source's pan
subtracted — near wall left at 45 ms, far wall right at 240. That is a listener standing left of
center in a hall, consistently, for thirty seconds. Side energy went to **17 dB under the mid** and
the near wall at −0.72 is why `maxPan` has to be raised off its default of 0.6.

The **mono fold-down** loses **0.09 dB** over the whole file and never more than 0.17 dB in any
section, and the summed mono peaks at −1.01 dBFS. Opposite-panned ghosts 45 ms apart are exactly
the arrangement that can comb-filter itself into a hole on a phone speaker, and this one does not.

It is still a narrow master, and the reason is the package: **`Track` has no pan and the deck writes
`pan = 0` for every note it schedules**, so the entire sequenced half of any Lattice soundtrack —
here 150 of 798 voices, and most of the sustained energy — is dead center by construction.

## The three sync points, and what they measured

| | required | measured |
|---|---|---|
| **21.73, the white flash** | the file's peak, one frame, ≥22.5 dB of step, a real hole behind it | peak −1.00 dBFS at **21.7389 s**; **+26.0 dB** across one frame; the hole at **−33.1 dBFS** rms, **−38.3** across its last 100 ms |
| **8.60–9.10, the cut to black** | half a second of nothing | **−67.9 dBFS** rms across the window, **−71.3** across its last 300 ms — 41 dB under the shot before it |
| **16.00, the turn** | the E♭ arrives, and it is a door rather than a slam | 20–100 Hz **+3.1 dB**, 2–14 kHz **−2.2 dB** against the shot before it; top-to-bottom tilt goes from −12.9 dB to −18.2 |

## What it produces

| file | what it is |
|---|---|
| `score.wav` | the master. 29.920 s, 48 kHz, stereo, 24-bit, −1.00 dBFS peak, 0 samples at full scale |
| `stem-pulse.wav` | the sequencer alone — all four songs |
| `stem-melody.wav` | everything with a tune in it: bells, chimes, plucks, the typewriter, and the fake reverb |
| `stem-floor.wav` | the subs, the hits, the blast, the air and the washes |
| `score.png` | the waveform over a log-frequency spectrogram, every cut point ruled on, half-second ruler |

The three stems sum to the master sample for sample — measured at **−80.2 dB** of residual, which
is 24-bit quantization of three files and nothing else.

## The files

| file | what it does |
|---|---|
| `score.mjs` | the score. Pure — no clock, no globals, no filesystem. Every timing in the locked cut is a named constant, and `problems()` is where the musical argument is checked rather than asserted |
| `render.mjs` | serves `packages/{audio,core}/dist` to a headless Chrome and renders through `OfflineAudioContext`. Prints the determinism verdict |
| `page.html` | the browser half. The import map is the only build step, so what renders is the published module graph |
| `wav.mjs` | 24-bit WAV in and out, in eighty lines. Pure, so the render and the analysis cannot disagree about what a sample is |
| `analyze.mjs` | peak, per-section RMS, the arc a second at a time, four-band balance, transients against the grid, the three sync checks, and the picture |
| `build.mjs` | the one command, and the gate |

## The gate

Thirteen checks — the score's own validators, plus twelve measured off the rendered samples — and
any one of them exits non-zero:

1. `problems()` returns nothing — both package validators, plus every event inside the render,
   plus nothing above −60 dBFS on the last sample, plus **nothing struck inside the cut to black**,
   plus **acts one and two inside the tritone-free scale**, plus **act three inside D Phrygian**,
   plus **the flat second appearing after 0:16 and never before**.
2. the master is 29.920 s, 48 kHz, stereo.
3. no sample at or above full scale, and the peak is inside a window around −1.00 dBFS.
4. **the file's loudest sample is inside the one white frame at 21.73.**
5. **the step across that frame is at least 22.5 dB** — Emberwake's result, used as a floor.
6. **the hole behind it is no louder than −31.7 dBFS** rms — likewise.
7. **the cut to black is under −55 dBFS**, and its last 300 ms under −68.
8. the turn is not within 2 dB of the flash.
9. the stems sum to the master to within −70 dB.

`problems()` runs **first and in Node**, before `tsc` and before a browser, because
`@latticekit/audio` is safe to import with no DOM by design and because `render.mjs` can only
*print* what the validators say. Before this existed, a score with a clipping chord rendered green.

## Determinism

`render.mjs` renders five passes in one page and prints two columns, because there are two
questions with different answers.

| | plans | samples |
|---|---|---|
| the same score, twice | **identical** | different |
| steady vs jittering pump, intensity held | same **set**, different order | different |

**What the package decides** — the stream of `VoicePlan`s, which is pure Tier A policy driven by an
injected clock — is bit-identical every time. **What the browser computes from those decisions** is
not: two renders of the same oscillator graph differ by about a float32 ULP and a chain of biquads
amplifies that to roughly −100 dBFS. The kit's determinism claim holds at the layer it is made
about and cannot hold below it; no audio kit's can.

The jitter pass is the useful one. Pumped at irregular intervals — 13 ms to 1.2 s, all inside the
deck's 1.5 s horizon — the sequencer emits **887 notes at the same times and the same gains** under
both cadences and only the order they are emitted in changes, which is the pump's order and not the
music's.

With the intensity *moving* the two disagree by ten voices out of 798, and that is correct rather
than broken: `MusicDeck.setIntensity` is sampled at schedule time, so which side of a layer change
a bar lands on depends on when the pump happened to ask.

## Why a browser

`@latticekit/audio`'s whole rendering half is Web Audio. Rendering it in Node would mean
re-implementing `BiquadFilterNode` and `exponentialRampToValueAtTime`, and a score that sounded
right against my re-implementation and wrong against a browser is a worse outcome than no score. An
`OfflineAudioContext` is the same code path a player hears, run faster than real time.
