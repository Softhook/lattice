/**
 * Procedural WebAudio sound effects and dynamic ambient sound bed for Verdant.
 *
 * Built entirely with @latticekit/audio — zero audio assets, zero wav/mp3 files.
 * Adheres strictly to the Lattice rules:
 * - No AudioContext created before user unlocks it.
 * - Dynamic sound bed on the 'music' bus that crossfades seamlessly between day and night.
 * - Laddered harmonic sound effects for responsive, musical harvesting feedback.
 * - Voice limiting prevents clipping when multiple entities interact simultaneously.
 */

import {
  createAudio,
  createBed,
  type Audio,
  type Bed,
  type BedLayer,
  type SoundDef,
} from '@latticekit/audio';

export type SoundName =
  | 'dig'
  | 'raise'
  | 'chop'
  | 'mine'
  | 'forage'
  | 'build'
  | 'repair'
  | 'deny'
  | 'attack'
  | 'hurt'
  | 'respawn'
  | 'roar'
  | 'stomp'
  | 'howl'
  | 'dusk_chime'
  | 'dawn_chime'
  | 'wake'
  | 'click';

export const VERDANT_SOUNDS = {
  dig: {
    bus: 'sfx',
    minGapMs: 90,
    layers: [
      { wave: 'triangle', hz: 160, toHz: 70, gain: 0.16, hold: 0.08, cutoff: 420 },
      { wave: 'sine', hz: 90, toHz: 45, gain: 0.12, hold: 0.06, cutoff: 220 },
    ],
  },
  raise: {
    bus: 'sfx',
    minGapMs: 90,
    layers: [
      { wave: 'sine', hz: 85, toHz: 210, gain: 0.16, hold: 0.09, cutoff: 550 },
      { wave: 'triangle', hz: 170, toHz: 290, gain: 0.09, hold: 0.06, cutoff: 800 },
    ],
  },
  chop: {
    bus: 'sfx',
    minGapMs: 80,
    ladder: { steps: 5, windowMs: 1400 },
    layers: [
      { wave: 'noise', hz: 0, gain: 0.09, hold: 0.04, cutoff: 1800, highpass: 500 },
      { wave: 'triangle', hz: 392, toHz: 196, gain: 0.18, hold: 0.06, cutoff: 1200 },
    ],
  },
  mine: {
    bus: 'sfx',
    minGapMs: 80,
    ladder: { steps: 5, windowMs: 1400 },
    layers: [
      { wave: 'triangle', hz: 659, toHz: 784, gain: 0.15, hold: 0.06, cutoff: 2200 },
      { wave: 'sine', hz: 330, toHz: 220, gain: 0.10, hold: 0.05, cutoff: 750 },
    ],
  },
  forage: {
    bus: 'sfx',
    minGapMs: 90,
    ladder: { steps: 4, windowMs: 1200 },
    layers: [
      { wave: 'noise', hz: 0, gain: 0.06, hold: 0.05, cutoff: 1200, highpass: 350 },
      { wave: 'triangle', hz: 523, toHz: 392, gain: 0.12, hold: 0.07, cutoff: 1000 },
    ],
  },
  build: {
    bus: 'sfx',
    minGapMs: 100,
    layers: [
      { wave: 'triangle', hz: 280, toHz: 160, gain: 0.20, hold: 0.08, cutoff: 800 },
      { wave: 'noise', hz: 0, gain: 0.08, hold: 0.04, cutoff: 1400, highpass: 250 },
    ],
  },
  repair: {
    bus: 'sfx',
    minGapMs: 90,
    layers: [
      { wave: 'triangle', hz: 550, toHz: 733, gain: 0.16, hold: 0.06, cutoff: 1500 },
      { wave: 'sine', hz: 367, toHz: 489, gain: 0.07, hold: 0.04, cutoff: 1000 },
    ],
  },
  deny: {
    bus: 'ui',
    minGapMs: 150,
    layers: [
      { wave: 'sine', hz: 150, toHz: 105, gain: 0.08, hold: 0.08, cutoff: 600 },
    ],
  },
  attack: {
    bus: 'sfx',
    minGapMs: 120,
    layers: [
      { wave: 'noise', hz: 0, gain: 0.07, hold: 0.05, cutoff: 1600, highpass: 450 },
      { wave: 'triangle', hz: 260, toHz: 120, gain: 0.11, hold: 0.04, cutoff: 750 },
    ],
  },
  hurt: {
    bus: 'sfx',
    minGapMs: 250,
    layers: [
      { wave: 'triangle', hz: 120, toHz: 55, gain: 0.20, hold: 0.07, cutoff: 450 },
      { wave: 'sine', hz: 70, toHz: 35, gain: 0.12, hold: 0.05, cutoff: 260 },
    ],
  },
  respawn: {
    bus: 'sfx',
    minGapMs: 400,
    layers: [
      { wave: 'sine', hz: 262, toHz: 524, gain: 0.14, hold: 0.40, attack: 0.04, cutoff: 1600 },
      { wave: 'sine', hz: 392, toHz: 784, gain: 0.10, hold: 0.45, attack: 0.06, delay: 0.05, cutoff: 2000 },
      { wave: 'triangle', hz: 659, gain: 0.07, hold: 0.50, attack: 0.08, delay: 0.10, cutoff: 2200 },
    ],
  },
  roar: {
    bus: 'sfx',
    minGapMs: 600,
    layers: [
      { wave: 'sawtooth', hz: 75, toHz: 32, gain: 0.20, hold: 0.22, cutoff: 320 },
      { wave: 'sine', hz: 50, toHz: 25, gain: 0.12, hold: 0.18, cutoff: 200 },
    ],
  },
  stomp: {
    bus: 'sfx',
    minGapMs: 300,
    layers: [
      { wave: 'sine', hz: 70, toHz: 30, gain: 0.18, hold: 0.12, cutoff: 280 },
      { wave: 'noise', hz: 0, gain: 0.08, hold: 0.06, cutoff: 450 },
    ],
  },
  howl: {
    bus: 'sfx',
    minGapMs: 800,
    layers: [
      { wave: 'sine', hz: 260, toHz: 420, gain: 0.15, hold: 0.50, attack: 0.08, cutoff: 1100 },
      { wave: 'triangle', hz: 390, toHz: 320, gain: 0.08, hold: 0.45, attack: 0.10, delay: 0.06, cutoff: 1400 },
    ],
  },
  dusk_chime: {
    bus: 'music',
    minGapMs: 3000,
    layers: [
      { wave: 'sine', hz: 220, gain: 0.12, hold: 2.2, attack: 0.15, cutoff: 1400 },
      { wave: 'sine', hz: 330, gain: 0.09, hold: 2.4, attack: 0.25, delay: 0.1, cutoff: 1800 },
      { wave: 'triangle', hz: 440, gain: 0.06, hold: 2.6, attack: 0.35, delay: 0.2, cutoff: 2000 },
    ],
  },
  dawn_chime: {
    bus: 'music',
    minGapMs: 3000,
    layers: [
      { wave: 'sine', hz: 440, gain: 0.12, hold: 2.0, attack: 0.08, cutoff: 2200 },
      { wave: 'sine', hz: 659, gain: 0.08, hold: 2.2, attack: 0.12, delay: 0.1, cutoff: 2800 },
      { wave: 'triangle', hz: 880, gain: 0.06, hold: 2.4, attack: 0.16, delay: 0.2, cutoff: 3000 },
    ],
  },
  wake: {
    bus: 'sfx',
    minGapMs: 1000,
    layers: [
      { wave: 'sine', hz: 165, toHz: 330, gain: 0.14, hold: 1.2, attack: 0.2, cutoff: 1100 },
      { wave: 'triangle', hz: 495, gain: 0.07, hold: 1.0, attack: 0.3, delay: 0.1, cutoff: 1800 },
      { wave: 'sine', hz: 660, gain: 0.05, hold: 0.8, attack: 0.4, delay: 0.2, cutoff: 2200 },
    ],
  },
  click: {
    bus: 'ui',
    minGapMs: 40,
    layers: [
      { wave: 'sine', hz: 1180, gain: 0.05, hold: 0.03, cutoff: 2200 },
    ],
  },
} as const satisfies Record<string, SoundDef>;

export const BED_LAYERS: readonly BedLayer[] = [
  /** Organic sub-bass ground presence with gentle low-frequency beat. */
  { wave: 'sine', hz: 48, gain: 0.022, cutoff: 120, cutoffAtFull: 1.2, beat: 0.18 },
  /** Whispering forest canopy breeze (deeply low-pass filtered, zero hiss). */
  { wave: 'noise', hz: 0, gain: 0.016, cutoff: 140, cutoffAtFull: 1.4 },
  /** Soft open-air daylight ambience. */
  { wave: 'noise', hz: 0, gain: 0.012, cutoff: 200, cutoffAtFull: 1.3, band: [0.35, 1.0] },
  /** Soft nocturnal depth drone. */
  { wave: 'sine', hz: 72, gain: 0.018, cutoff: 180, cutoffAtFull: 1.2, band: [0.0, 0.55], beat: 0.25 },
];

export interface GameAudio {
  readonly engine: Audio<SoundName>;
  readonly bed: Bed;
  play(name: SoundName): void;
  setBedTone(daylight: number, darkness: number): void;
  unlock(): void;
  dispose(): void;
}

/** Create the procedural sound system with continuous sound bed and sound effects. */
export function createGameAudio(): GameAudio {
  const engine = createAudio<SoundName>({
    sounds: VERDANT_SOUNDS,
  });

  const bed = createBed(engine, BED_LAYERS, {
    bus: 'music',
    sagTo: 0.65,
    glideSec: 1.5,
  });

  // Start bed level at full active presence
  bed.set(1.0, 1.0);

  function play(name: SoundName): void {
    engine.play(name);
  }

  function setBedTone(daylight: number, _darkness: number): void {
    bed.set(1.0, daylight);
  }

  function unlock(): void {
    engine.unlock();
  }

  function dispose(): void {
    bed.stop(0.05);
    engine.dispose();
  }

  return {
    engine,
    bed,
    play,
    setBedTone,
    unlock,
    dispose,
  };
}
