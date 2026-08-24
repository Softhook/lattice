import { describe, it, expect } from 'vitest';
import { validateSounds } from '@latticekit/audio';
import { createGameAudio, VERDANT_SOUNDS, BED_LAYERS, type SoundName } from '../src/audio.js';

describe('Verdant Procedural Audio System', () => {
  it('passes validateSounds with zero table problems or clipping risks', () => {
    const problems = validateSounds(VERDANT_SOUNDS);
    expect(problems).toEqual([]);
  });

  it('declares all expected sound effects', () => {
    const expectedSounds: SoundName[] = [
      'dig',
      'raise',
      'chop',
      'mine',
      'forage',
      'build',
      'repair',
      'deny',
      'attack',
      'hurt',
      'respawn',
      'roar',
      'stomp',
      'howl',
      'dusk_chime',
      'dawn_chime',
      'wake',
      'click',
      'bow_shoot',
      'hit_meat',
      'craft',
    ];

    for (const name of expectedSounds) {
      expect(VERDANT_SOUNDS[name]).toBeDefined();
      expect(VERDANT_SOUNDS[name].layers.length).toBeGreaterThan(0);
      expect(VERDANT_SOUNDS[name].minGapMs).toBeGreaterThan(0);
    }
  });

  it('configures continuous 4-layer day/night sound bed correctly', () => {
    expect(BED_LAYERS.length).toBe(4);
    expect(BED_LAYERS[0]?.wave).toBe('sine');
    expect(BED_LAYERS[1]?.wave).toBe('noise');
    expect(BED_LAYERS[2]?.band).toEqual([0.35, 1.0]);
    expect(BED_LAYERS[3]?.band).toEqual([0.0, 0.55]);
  });

  it('creates audio instance and drives bed without throwing in headless mode', () => {
    const audio = createGameAudio();
    expect(audio.engine).toBeDefined();
    expect(audio.bed).toBeDefined();

    // Safe to play sounds before unlock in headless mode
    expect(() => audio.play('chop')).not.toThrow();
    expect(() => audio.play('dusk_chime')).not.toThrow();
    expect(() => audio.play('wake')).not.toThrow();

    // Safe to drive bed tone
    expect(() => audio.setBedTone(1.0, 0.0)).not.toThrow();
    expect(audio.bed.level).toBe(1.0);
    expect(audio.bed.tone).toBe(1.0);

    expect(() => audio.setBedTone(0.2, 0.8)).not.toThrow();
    expect(audio.bed.tone).toBe(0.2);

    // Safe to unlock and dispose
    expect(() => audio.unlock()).not.toThrow();
    expect(() => audio.dispose()).not.toThrow();
  });
});
