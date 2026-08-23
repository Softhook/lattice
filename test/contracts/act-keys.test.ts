/**
 * **A synthetic key press that produces no text steals the browser's foreground.** (#62)
 *
 * `tools/trailer/capture.mjs` turns a `{ keyboard }` cue into `Input.dispatchKeyEvent` and passes
 * every other field through untouched, so what an act writes is what Chrome gets. A `keyDown`
 * carrying virtual key codes and **no `text`** is a *raw* press: Blink offers it to the page, and
 * when the page does not consume it the event goes back to the browser to be matched against the
 * menu accelerators. On macOS a printable raw press matches one, and Chrome opens `chrome://help/`
 * in a new foreground tab. Three things follow, and only the last one is visible in a number:
 *
 * 1. the exhibit's tab is backgrounded — `document.visibilityState` becomes `hidden`;
 * 2. `@latticekit/input` releases every held key on `visibilitychange`, which is the stuck-key
 *    guard doing exactly its job, so the act's `W` stops being held and **the game never moves**;
 * 3. a hidden tab produces no BeginFrames, so Blink's rAF-aligned mouse-move queue never flushes
 *    and every later `Input.dispatchMouseEvent` blocks for its **5-second** fallback timeout.
 *
 * That third one is what got filed as a 200x performance collapse in Emberwake. It was not the
 * game: `showcase/emberwake/act/raid-bisect.mjs` dispatches 82 mouse moves, 82 x 5 s is 411 s, and
 * the whole capture took 413 s. The game's own frame cost throughout was 1–2 ms.
 *
 * Measured on macOS, Chrome 151, headless, against `/g/chime-path/`, `/x/demo/`, `/x/crowd/` and
 * Emberwake: `Space`, `KeyW`, `KeyA`, `KeyS`, `KeyD` and `KeyM` all steal the foreground; adding
 * `text` stops every one of them; `ArrowUp` never did, because it produces no character.
 *
 * So the rule this test pins is: **a `keyDown` cue for a character key carries that character in
 * `text`.** It is a contract with a browser rather than an implementation detail of any act, and
 * the failure it prevents is silent in every direction — the shot still renders, the frames still
 * differ, nothing is logged, and the only symptom is a game that ignores its keys.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Acts still carrying the defect, by repository-relative path.
 *
 * An exemption is a debt with a name on it, so the test below **also fails when an exemption
 * stops being needed** — fix the act, delete the line, and the suite tells you to. Empty is the
 * goal state and an empty list is legal.
 */
const KNOWN_RAW_KEY_ACTS: readonly string[] = [
  // Shot 7 of the trailer. Two `Space` presses, both raw, the first at capture frame 4 — so the
  // gust the shot exists to film is dispatched into a tab that has just been backgrounded, and
  // every mouse cue after it pays five seconds. Left alone here because this change does not own
  // `tools/trailer`; reported against #62.
];

/** Where acts live. A new directory of them is a new line here and nothing else. */
const ACT_DIRS = ['tools/trailer/acts', 'showcase/emberwake/act'];

/** The context `capture.mjs` builds for an act's default export. */
const CONTEXT = {
  frames: 120,
  fps: 60,
  width: 1280,
  height: 720,
  stepMs: 1000 / 60,
  warmupSteps: 120,
  warmupMs: 2000,
};

interface Cue {
  readonly at?: number;
  readonly events?: readonly Record<string, unknown>[];
}

function actFiles(): string[] {
  const found: string[] = [];
  for (const dir of ACT_DIRS) {
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs)) {
      if (name.endsWith('.mjs')) found.push(`${dir}/${name}`);
    }
  }
  return found.sort();
}

/**
 * Every `keyDown` in an act that names a character key and does not carry its text.
 *
 * A `key` of more than one character is a *named* key — `ArrowUp`, `Escape`, `F1` — which
 * produces no character and is never matched against a menu accelerator. `' '` is one character
 * and is therefore in scope, which is the case `chime-path` gets wrong.
 */
async function rawCharacterPresses(file: string): Promise<string[]> {
  const module: { default?: unknown } = (await import(pathToFileURL(join(ROOT, file)).href)) as {
    default?: unknown;
  };
  const plan = module.default;
  const cues = (typeof plan === 'function' ? await (plan as (c: typeof CONTEXT) => Cue[])(CONTEXT) : plan) as Cue[];
  const bad: string[] = [];
  for (const cue of cues) {
    for (const event of cue.events ?? []) {
      if (event['keyboard'] !== 'keyDown') continue;
      const key = event['key'];
      if (typeof key !== 'string' || key.length !== 1) continue;
      if (typeof event['text'] === 'string' && event['text'].length > 0) continue;
      bad.push(`at ${String(cue.at)}: ${String(event['code'] ?? key)}`);
    }
  }
  return bad;
}

const files = actFiles();

describe('an act never sends a raw character key', () => {
  it('finds acts to check at all — an empty sweep is a green test that proves nothing', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.filter((f) => !KNOWN_RAW_KEY_ACTS.includes(f)))(
    '%s gives every character keyDown its text',
    async (file) => {
      expect(await rawCharacterPresses(file)).toEqual([]);
    },
  );

  it.each(KNOWN_RAW_KEY_ACTS)(
    '%s is still on the exemption list for a reason — delete the line when it is not',
    async (file) => {
      expect(files, `${file} is exempted but no longer exists`).toContain(file);
      expect(
        await rawCharacterPresses(file),
        `${file} no longer sends a raw character key. Remove it from KNOWN_RAW_KEY_ACTS.`,
      ).not.toEqual([]);
    },
  );
});
