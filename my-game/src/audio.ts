/**
 * Procedural WebAudio sound effects for Verdant.
 *
 * Built entirely with @latticekit/audio — zero audio assets, zero wav/mp3 files.
 * Adheres strictly to the Lattice rules:
 * - No AudioContext created before user unlocks it.
 * - Voice limiting prevents clipping when multiple entities interact simultaneously.
 * - Only plays clean, intentional gameplay action feedback.
 */

import {
  createAudio,
  type Audio,
} from '@latticekit/audio';

export interface GameAudio {
  readonly engine: Audio;
  play(name: SoundName): void;
  unlock(): void;
  dispose(): void;
}

export type SoundName =
  | 'dig'
  | 'raise'
  | 'chop'
  | 'mine'
  | 'forage'
  | 'build'
  | 'repair'
  | 'hurt'
  | 'respawn'
  | 'roar'
  | 'click';

/** Create the procedural sound system. */
export function createGameAudio(): GameAudio {
  const engine = createAudio({
    sounds: {
      dig: {
        bus: 'sfx',
        minGapMs: 100,
        layers: [
          { wave: 'triangle', hz: 240, toHz: 110, gain: 0.18, hold: 0.06, decay: 0.08, cutoff: 600 },
          { wave: 'sine', hz: 120, toHz: 60, gain: 0.12, hold: 0.04, decay: 0.06, cutoff: 300 },
        ],
      },
      raise: {
        bus: 'sfx',
        minGapMs: 100,
        layers: [
          { wave: 'sine', hz: 130, toHz: 280, gain: 0.16, hold: 0.07, decay: 0.08, cutoff: 800 },
        ],
      },
      chop: {
        bus: 'sfx',
        minGapMs: 90,
        layers: [
          { wave: 'triangle', hz: 480, toHz: 180, gain: 0.22, hold: 0.04, decay: 0.05, cutoff: 1200 },
          { wave: 'sine', hz: 220, toHz: 90, gain: 0.14, hold: 0.05, decay: 0.06, cutoff: 500 },
        ],
      },
      mine: {
        bus: 'sfx',
        minGapMs: 90,
        layers: [
          { wave: 'triangle', hz: 880, toHz: 1100, gain: 0.18, hold: 0.05, decay: 0.07, cutoff: 2400 },
          { wave: 'sine', hz: 330, toHz: 180, gain: 0.12, hold: 0.04, decay: 0.06, cutoff: 800 },
        ],
      },
      forage: {
        bus: 'sfx',
        minGapMs: 120,
        layers: [
          { wave: 'triangle', hz: 520, toHz: 380, gain: 0.14, hold: 0.06, decay: 0.07, cutoff: 1000 },
          { wave: 'sine', hz: 740, toHz: 620, gain: 0.10, hold: 0.04, decay: 0.05, cutoff: 1500 },
        ],
      },
      build: {
        bus: 'sfx',
        minGapMs: 110,
        layers: [
          { wave: 'triangle', hz: 320, toHz: 220, gain: 0.24, hold: 0.06, decay: 0.08, cutoff: 900 },
          { wave: 'sine', hz: 540, toHz: 440, gain: 0.16, hold: 0.04, decay: 0.06, cutoff: 1200 },
        ],
      },
      repair: {
        bus: 'sfx',
        minGapMs: 100,
        layers: [
          { wave: 'triangle', hz: 660, toHz: 880, gain: 0.18, hold: 0.05, decay: 0.08, cutoff: 1800 },
        ],
      },
      hurt: {
        bus: 'sfx',
        minGapMs: 400,
        layers: [
          { wave: 'triangle', hz: 150, toHz: 70, gain: 0.22, hold: 0.05, decay: 0.08, cutoff: 500 },
          { wave: 'sine', hz: 90, toHz: 45, gain: 0.16, hold: 0.04, decay: 0.06, cutoff: 300 },
        ],
      },
      respawn: {
        bus: 'sfx',
        minGapMs: 300,
        ladder: { steps: 3, windowMs: 600 },
        layers: [
          { wave: 'sine', hz: 330, toHz: 660, gain: 0.25, hold: 0.14, decay: 0.16, cutoff: 2000 },
        ],
      },
      roar: {
        bus: 'sfx',
        minGapMs: 400,
        layers: [
          { wave: 'sawtooth', hz: 95, toHz: 42, gain: 0.32, hold: 0.18, decay: 0.25, cutoff: 450 },
        ],
      },
      click: {
        bus: 'ui',
        minGapMs: 40,
        layers: [
          { wave: 'sine', hz: 1180, gain: 0.06, hold: 0.03, decay: 0.03, cutoff: 2400 },
        ],
      },
    },
  });

  function play(name: SoundName): void {
    engine.play(name);
  }

  function unlock(): void {
    engine.unlock();
  }

  function dispose(): void {
    engine.dispose();
  }

  return {
    engine,
    play,
    unlock,
    dispose,
  };
}
