/**
 * **`@browser-only`** — the whole soundtrack, as a table of oscillators. Zero files.
 *
 * Nine one-shots and a four-layer bed. Everything a player hears in a run is somewhere in this
 * file, which is the argument the zero-asset rule is making: the sound of a magazine going up is
 * three lines of numbers, it is diffable in review, and it recolours with a constant rather than
 * with a re-render.
 *
 * ## The two rules a game has to keep, which the package cannot keep for it
 *
 * 1. **No context before a gesture.** `createAudio` builds nothing; the first `unlock()` does.
 *    `main.ts` calls it from the first pointer or key event and never before, so a page that
 *    loads and is not touched makes no `AudioContext` at all and logs no autoplay warning.
 * 2. **Distance is gain, not pan.** An off-screen explosion made *quieter* is legible; one made
 *    *left* is disorienting. {@link voice} attenuates by distance from the camera and pans only
 *    gently, and it takes the pan from `Camera.normalizedX`, which exists on `iso` for exactly
 *    this and which `audio` may not depend on itself.
 */

import { clamp01 } from '@latticekit/core';
import type { Camera } from '@latticekit/iso';
import { createAudio, createBed, type Audio, type Bed, type SoundDef } from '@latticekit/audio';
import { HALF_H, HALF_W } from '@latticekit/iso';
import type { SoundEvent } from './game.js';

/**
 * The table. Layer gains inside one sound must sum below full scale — `validateSounds` says so
 * and WebAudio hard-clips if they do not — so every entry here is written with its own total in
 * mind rather than tuned by ear against the master.
 */
const SOUNDS: Readonly<Record<SoundEvent, SoundDef>> = {
  /** The player's guns and the raiders'. A crack over a body, which is what a gun is. */
  cannon: {
    bus: 'sfx', minGapMs: 55,
    layers: [
      { wave: 'noise', hz: 0, gain: 0.3, hold: 0.1, cutoff: 2600, highpass: 300 },
      { wave: 'square', hz: 105, toHz: 38, gain: 0.24, hold: 0.24, cutoff: 900 },
      { wave: 'triangle', hz: 240, toHz: 70, gain: 0.14, hold: 0.13, cutoff: 1800 },
    ],
  },
  /** Shot into a hillside. All body, no crack. */
  thud: {
    bus: 'sfx', minGapMs: 45,
    layers: [
      { wave: 'noise', hz: 0, gain: 0.22, hold: 0.16, cutoff: 620 },
      { wave: 'sine', hz: 82, toHz: 44, gain: 0.24, hold: 0.26 },
    ],
  },
  /** Shot into the sea. The one bright sound in the game, because water is the only bright thing
   *  in a night raid. */
  splash: {
    bus: 'sfx', minGapMs: 40,
    layers: [
      { wave: 'noise', hz: 0, gain: 0.16, hold: 0.34, cutoff: 6000, highpass: 800 },
      { wave: 'sine', hz: 300, toHz: 120, gain: 0.08, hold: 0.12 },
    ],
  },
  /** Something catching. A long soft intake with almost no attack, so it arrives *under* the
   *  explosion that caused it rather than competing with it. */
  catch: {
    bus: 'sfx', minGapMs: 130,
    layers: [
      { wave: 'noise', hz: 0, gain: 0.13, hold: 0.5, attack: 0.14, cutoff: 1400, highpass: 200 },
    ],
  },
  /** A hit on something solid: a raider's hull, a gun emplacement. */
  blast: {
    bus: 'sfx', minGapMs: 60,
    layers: [
      { wave: 'noise', hz: 0, gain: 0.26, hold: 0.26, cutoff: 2000 },
      { wave: 'sawtooth', hz: 150, toHz: 46, gain: 0.22, hold: 0.32, cutoff: 700 },
    ],
  },
  /** The magazine. Nearly a second long, and the only sound in the table allowed to be. */
  magazine: {
    bus: 'sfx', minGapMs: 400,
    layers: [
      { wave: 'noise', hz: 0, gain: 0.34, hold: 0.95, cutoff: 1000 },
      { wave: 'sine', hz: 74, toHz: 24, gain: 0.34, hold: 1.25 },
      { wave: 'noise', hz: 0, gain: 0.16, hold: 0.6, delay: 0.07, highpass: 2200 },
    ],
  },
  /** Taking a hit. Deliberately unpleasant, and on its own bus-free frequency band so it cuts
   *  through whatever else is sounding. */
  hull: {
    bus: 'sfx', minGapMs: 160,
    layers: [
      { wave: 'sine', hz: 135, toHz: 48, gain: 0.32, hold: 0.34 },
      { wave: 'noise', hz: 0, gain: 0.2, hold: 0.22, cutoff: 520 },
    ],
  },
  /** A hull going down. */
  sink: {
    bus: 'sfx', minGapMs: 200,
    layers: [
      { wave: 'noise', hz: 0, gain: 0.2, hold: 0.85, cutoff: 700 },
      { wave: 'sine', hz: 210, toHz: 58, gain: 0.16, hold: 0.9 },
    ],
  },
  /** Running aground. */
  shore: {
    bus: 'sfx', minGapMs: 250,
    layers: [
      { wave: 'noise', hz: 0, gain: 0.28, hold: 0.42, cutoff: 460 },
      { wave: 'triangle', hz: 90, toHz: 55, gain: 0.14, hold: 0.3 },
    ],
  },
};

/**
 * The bed: the sea, and the fire on top of it.
 *
 * Two banded pairs. `tone` is driven by how much of the world is burning, so at `tone = 0` the
 * player hears swell and wind and at `tone = 1` a roar has arrived underneath it — the layers
 * *trade places* rather than one filter opening, which is the difference the package's own
 * documentation makes and it is audible immediately.
 */
const BED = [
  { wave: 'noise', hz: 0, gain: 0.15, cutoff: 420, cutoffAtFull: 2.2, band: [0, 0.6] },
  { wave: 'sine', hz: 46, gain: 0.1, cutoff: 200, beat: 0.3, band: [0, 0.7] },
  { wave: 'noise', hz: 0, gain: 0.2, cutoff: 240, cutoffAtFull: 5, band: [0.35, 1] },
  { wave: 'sawtooth', hz: 33, gain: 0.09, cutoff: 320, beat: 0.7, band: [0.5, 1] },
] as const;

/** Everything the game needs to make a noise, and nothing it does not. */
export interface Sound {
  readonly audio: Audio<SoundEvent>;
  readonly bed: Bed;
  /** Called from the first gesture. Idempotent. */
  unlock(): void;
  /** Play a world event, attenuated and panned from where it happened. */
  at(name: SoundEvent, gx: number, gy: number, force: number, camera: Camera): void;
  /** Drive the bed. Safe every frame; it ramps rather than restarts. */
  drive(level: number, tone: number): void;
  /** Master mute, and the value a button renders from. */
  muted: boolean;
  toggleMute(): boolean;
  dispose(): void;
}

/** How far away, in tiles, a sound has faded to nothing. Beyond the diagonal of a 1280×720
 *  frame at zoom 1, so nothing audible is ever completely off screen. */
const EARSHOT = 34;

/** Build the engine, the bed and the two helpers the game actually calls. */
export function createSound(): Sound {
  const audio = createAudio<SoundEvent>({ sounds: SOUNDS });
  const bed = createBed(audio, BED);
  let muted = false;
  let unlocked = false;

  const api: Sound = {
    audio,
    bed,
    get muted() {
      return muted;
    },
    unlock(): void {
      if (unlocked) return;
      unlocked = true;
      audio.unlock();
    },
    at(name, gx, gy, force, camera): void {
      if (!audio.available) return;
      // Distance in **world pixels**, not tiles, because that is the space the camera is in and
      // converting the camera instead would be the same arithmetic done once per sound.
      const wx = (gx - gy) * HALF_W;
      const wy = (gx + gy) * HALF_H;
      const dx = (wx - camera.x) / HALF_W;
      const dy = (wy - camera.y) / HALF_H;
      const d = Math.sqrt(dx * dx + dy * dy);
      const near = clamp01(1 - d / EARSHOT);
      if (near <= 0.02) return;
      audio.play(name, { gain: force * near * near, pan: clamp01(camera.normalizedX(wx) * 0.5 + 0.5) * 2 - 1 });
    },
    drive(level, tone): void {
      bed.set(level, tone);
    },
    toggleMute(): boolean {
      muted = !muted;
      audio.mixer.setMuted('master', muted);
      return muted;
    },
    dispose(): void {
      bed.stop(0.2);
      audio.dispose();
    },
  };
  return api;
}
