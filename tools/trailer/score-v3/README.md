# The Lattice trailer — the score, third pass

Thirty seconds of music for the three-act trailer, synthesized entirely by `@latticekit/audio`.
**There is no sample file, no loop, no downloaded instrument and no second runtime dependency in
this directory.** A kit whose first claim is *zero assets* cannot advertise itself over a stock
music download without contradicting itself in its own soundtrack, so this is the point of the
exercise rather than a constraint on it.

This is the **fourth** score in the repo and the second attempt at this picture.
`tools/trailer/score/` is the launch montage, `score-emberwake/` is the night raid, and
`score-v2/` is the first pass at this cut. Nothing here imports across: all four are separate
copies of the same six-file harness, so none of them can break the others.

## One command

```bash
node tools/trailer/score-v3/build.mjs
```

`problems()` → `tsc --build` → render → analyze → a gate that exits non-zero if any assertion
fails. `--skip-build` skips only the `tsc` step, for the tuning loop.

## Why this one exists

`score-v2` was rejected in seventeen words: *"i like the audio of v1 better than v2, its upbeat and
fits nicely, game audio doesnt destroy the music."* Both halves of that are diagnoses.

### 1. There is no sound design in this file

Not quieter sound design — none. `score-v2` carried `hull`, `strike`, `pass`, `ring`, `detonate`,
`air`, `wash` and a typewriter `tick`: engine thumps, sea, shell passes, hits, and band-passed
noise beds. Its sound-design stem measured −14 dB against a −13 dB melody during the gauntlet, so
the tune was competing with an engine.

Here **every event is a named pitch on a musical instrument**, and it is not a promise — it is
three of the eleven checks `problems()` runs before a browser is opened:

| the claim | how it is refused |
|---|---|
| every event is a pitch | an event with no `note` in the key's letter set fails the build |
| no noise beds | every `noise` layer in the file, recipe or track, must hold under **50 ms** |
| no falling-pitch impacts | `sweepTo` outside a track whose id begins `kick` fails the build |

Where the picture needs weight it gets a struck chord and a low note that belong to the harmony.
The white flash at 21.73 is a **fifteen-note G major with a low G1 under it**, not a detonation.
The typed sentences at 9.10 and 12.30 are a C major scale and an A minor arpeggio on a celesta.

The only unpitched sound anywhere is the drum kit inside the sequencer — a kick with a `fixedHz`,
a beater and two hi-hats — which is exactly what `tools/trailer/score/` does and is a large part of
why that score reads as upbeat rather than as ambient.

### 2. It is major, and it goes up

`score-v2` was D Phrygian with a tritone as its central interval and no major chord in
twenty-eight seconds. This is **C major** for acts one and two and **D major** for act three.

## What makes it upbeat

Seven things, and five of them are assertions rather than adjectives.

| | | checked |
|---|---|---|
| **1** | **Major, and provably so.** Every pitch in acts one and two is in C major; every pitch after 16.00 is in D major. Both tonic **major thirds** must actually sound — "in a major scale" is not the same as "major" | `problems()` |
| **2** | **The turn is a lift.** C major to D major, up a whole tone, at 16.00. Up, not down; a new key, not a flattened degree | `problems()` |
| **3** | **The motif is transformed by lifting.** Act one's `G4 C5 E5 F5` becomes act three's `A5 D6 F♯6 G6`: a tone up, an octave up, and from half notes to sixteenths — a 4.2× diminution. Act three's melodic ceiling must be above act one's | `problems()` |
| **4** | **The harmony moves.** Four songs, no pedals: `C–F–G`, `F–Am–C`, `D–Bm`, `A–D`. Every progression must have at least two distinct roots | `problems()` |
| **5** | **It ends on the major third.** The last struck melody note is F♯6 over a D major chord — the resolution of a fourth that has hung since 0:02.5 | `problems()` |
| **6** | **Act three escalates by getting brighter.** Energy above 2 kHz must not fall at the turn and must not fall in act three. `score-v2` lost 2.2 dB there | the gate |
| **7** | **The ending arrives.** The end card's first second must be at least as loud as act two | the gate |

And two that cannot be asserted, only described. **Everything is struck or plucked** — bells,
celesta, drums — so the file is almost entirely transient, which is what a screensaver pad is not.
And **the pulse is continuous under acts one and two** rather than arriving for the climax: there
is a 120 bpm grid from 2.50 to 16.00 with one gap, so the montage has something to cut against
from its first frame.

## The one musical idea

**Scale degrees 5 – 1 – 3 – 4.** In C: `G4 C5 E5 F5`. It rises through the *major third*, so the
shape says major before it says anything else, and then hangs on the fourth degree — the one note
of the seven that cannot sit still over the tonic. Every statement in acts one and two leaves it
hanging, and *Before the Bell* at 14.50 withholds it entirely: `G5 C6 E6`, and no fourth note. The
shot is called Before the Bell and the bell does not ring.

In D, an octave up and four times as fast, it is `A5 D6 F♯6 G6`. Its hanging fourth is **G**, and
the chord on the white flash is **G major** — so the note that has been unresolved for twenty-one
seconds becomes the root of the loudest thing in the film. It resolves at 26.00, where the G6 falls
to F♯6 inside a D major triad, which is the last melodic event in the file.

Act three states it four times in 1.9 s as a **rising sequence** — `A D F♯ G`, `B E G A`,
`D F♯ A B`, `E G B D` — climbing an octave and a half across the gauntlet. Escalation by register
and density, which is the brief's instruction and the opposite of what a flattened second does.

## The arithmetic that decided act three

**A bar is four beats regardless of `steps`**, so a bar lasts `240 / bpm` and nothing else about a
song can change that. Act three's cuts are 1.9 s apart — 17.40, 19.30, 21.20 — and at 120 bpm a bar
is 2.0 s, so the harmony is 100 ms out by the second cut and 200 ms out by the third. `score-v2`
accepted that and paid for it with a static D pedal through the whole raid, because nothing else
fits.

Solving `240 / bpm = 1.9` gives **126.3158 bpm**, and then every cut in act three is a downbeat:
17.40, 19.30, 21.20, and — restarting the deck at 22.20 — 24.10 and 26.00. Five picture cuts, five
chord changes. `I – vi – IV – V – I` in D major, one chord per shot, with the IV on the flash.

It is 5% faster than acts one and two, and the change is masked by the 1.4 s riser at the turn,
where there is no pulse to compare it against.

Acts one and two stay at 120 bpm, where a sixteenth is 0.125 s and exact in binary. Anchored at
2.50, that grid lands within **25 ms** of every act-one cut but one, and exactly on 6.00.

## The three sync points, and what they measured

| | required | measured |
|---|---|---|
| **21.73, the white flash** | the file's peak, ≥20 dB of step, a genuine drop behind it | peak **−1.01 dBFS at 21.7521**, 22.1 ms into the chord; **+38.6 dB** across one frame; the 530 ms in front of it at **−38.9 dBFS** rms, its last 100 ms at −41.1 |
| **8.60–9.10, the cut to black** | half a second of nothing | **−63.0 dBFS** rms across the window, **−68.7** across its last 300 ms — 35 dB under the shot before it |
| **16.00, the turn** | brighter, faster, more of everything | above 2 kHz **−33.1 dBFS** against −35.8 for the shot before it; 2–14 kHz **+0.3 dB**; peak −6.3 dBFS against −12.3 |

### Why the peak is 22 ms in and not in the white frame

`score-v2`'s gate required the loudest sample inside the single white frame, and it got it, because
its climax was a **noise blast** and a noise blast peaks on its first sample. A **chord** does not.
Fifteen pitches spelling G major are near-harmonics of the G1 under them — 2, 3, 4, 5, 6, 8, 10,
12, 16, 20, 24, 32, 36, 40, 48 — so the sum is quasi-periodic at 49 Hz and crests every 20 ms, and
equal temperament makes those crests beat against each other by a decibel or two. Which crest is
loudest is effectively arbitrary.

With an ordinary 2.6 s bell the decay across the first sixty milliseconds is 1.4 dB, less than the
beating, and the file's loudest sample landed **63 ms** after the picture. `blaze` — the flash's own
instrument — has a 1.5 ms attack and a 1.2 s ring, which decays 3.6 dB over the same sixty
milliseconds, so the *earliest* crest wins. That moved the peak to 22.1 ms, which is inside the
chord's attack and first ring. The gate now allows 40 ms and prints the offset, and the sync claim
proper is the one-frame step, which is 38.6 dB.

This is a real property of scoring a pitched climax rather than an explosion, and it is the one
problem in this brief that `score-v2` never had to solve.

## What it produces

| file | what it is |
|---|---|
| `score.wav` | the master. 29.920 s, 48 kHz, stereo, 24-bit, −1.01 dBFS peak, 0 samples at full scale |
| `stem-pulse.wav` | the sequencer, entire — drums, bass, ostinato, hats. The rhythmic engine |
| `stem-melody.wav` | the single line: the motif, the runs, the risers, and their reflections |
| `stem-harmony.wav` | everything sustained or chordal — the low roots, the swells, the struck chords at 8.50, 16.00, 17.40, 19.30, 21.73, 24.10 and 26.00, and their reflections |
| `score.png` | the waveform over a log-frequency spectrogram, every cut ruled on, half-second ruler |

The three stems sum to the master sample for sample — measured at **−90.7 dB** of residual, which
is 24-bit quantization of three files and nothing else.

**The split is by musical function and not by loudness**, which is a change from the other three
scores. They shipped `pulse / melody / floor`, where `floor` meant "the subs and the sound design" —
useless for the one job a stem has, because the thing the mix needed to turn down was spread across
two of the three. Here the two questions an edit actually asks — *"less drums under the voiceover"*
and *"more weight on the flash"* — are each one fader.

## The gate

Sixteen checks — the score's own validators, plus fifteen measured off the rendered samples — and
any one of them exits non-zero:

1. `problems()` returns nothing: both package validators, plus **every event is a pitch**, plus
   **no noise layer holds over 50 ms**, plus **no pitch sweep outside a kick**, plus **acts one and
   two inside C major and act three inside D major**, plus **both tonic major thirds sound**, plus
   **every progression has two roots**, plus **act three's motif is higher and faster than act
   one's**, plus **the last melody note is the major third**, plus **nothing struck inside the cut
   to black**, plus **nothing above −60 dBFS on the final sample**, plus every event inside the
   render.
2. the master is 29.920 s, 48 kHz, stereo, and no sample is at or above full scale.
3. the peak is inside a window around −1.00 dBFS.
4. the file's loudest sample is inside the flash chord's first 40 ms.
5. the step across the white frame is at least 26 dB — `score-v2`'s result, used as a floor.
6. the drop in front of it is no louder than −26 dBFS rms.
7. the cut to black is under −55 dBFS, and its last 300 ms under −68.
8. the turn does not come within 2 dB of the flash.
9. **the turn loses no energy above 2 kHz against the shot before it.**
10. **act three loses no energy above 2 kHz against act two.**
11. **the end card's first second is no quieter than act two.**
12. the stems sum to the master to within −70 dB.

`problems()` runs **first and in Node**, before `tsc` and before a browser, because
`@latticekit/audio` is safe to import with no DOM by design and because `render.mjs` can only
*print* what the validators say.

### The check that changed the music

Check 7 failed at −64.2 dB, and the cause was one note: act one's landing on the clay shot at 7.10
was a bell, a bell in this package holds for 2.6 s, and its tail was still at −62 dBFS at 8.95 —
inside the hinge of the film. Struck as a **pluck** instead it is gone by 7.53 and the tail measures
−68.7. Act one therefore stops ringing a second before the picture cuts, which is also better
music: the button at 8.50 is 75 ms long and the black behind it is real.

## Determinism

`render.mjs` renders five passes in one page and prints two columns, because there are two
questions with different answers.

| | plans | samples |
|---|---|---|
| the same score, twice | **IDENTICAL** | different |
| steady vs jittering pump, intensity held | same **set**, different order | different |

**What the package decides** — the stream of `VoicePlan`s, pure Tier A policy driven by an injected
clock — is bit-identical every time. **What the browser computes from those decisions** is not: two
renders of the same oscillator graph differ by about a float32 ULP and a chain of biquads amplifies
that to roughly −100 dBFS. The kit's determinism claim holds at the layer it is made about and
cannot hold below it; no audio kit's can.

The jitter pass is the useful one. Pumped at irregular intervals — 13 ms to 1.2 s, all inside the
deck's 1.5 s horizon — the sequencer emits **1498 notes at the same times and the same gains** under
both cadences, and only the order they are emitted in changes, which is the pump's order and not the
music's.

With the intensity *moving* the two disagree by one voice out of 1417, and that is correct rather
than broken: `MusicDeck.setIntensity` is sampled at schedule time, so which side of a layer change
a bar lands on depends on when the pump happened to ask.

## The files

| file | what it does |
|---|---|
| `score.mjs` | the score. Pure — no clock, no globals, no filesystem. Every timing in the locked cut is a named constant, and `problems()` is where the musical argument is *checked* rather than asserted |
| `render.mjs` | serves `packages/{audio,core}/dist` to a headless Chrome and renders through `OfflineAudioContext`. Prints the determinism verdict |
| `page.html` | the browser half. The import map is the only build step, so what renders is the published module graph |
| `wav.mjs` | 24-bit WAV in and out, in eighty lines. Pure, so the render and the analysis cannot disagree about what a sample is |
| `analyze.mjs` | peak, per-section RMS, the arc a second at a time, four-band balance, transients against the grid, the three sync checks, and the picture |
| `build.mjs` | the one command, and the gate |

## Why a browser

`@latticekit/audio`'s whole rendering half is Web Audio. Rendering it in Node would mean
re-implementing `BiquadFilterNode` and `exponentialRampToValueAtTime`, and a score that sounded
right against my re-implementation and wrong against a browser is a worse outcome than no score. An
`OfflineAudioContext` is the same code path a player hears, run faster than real time.
