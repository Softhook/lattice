import { describe, it, expect } from 'vitest';
import { createPlayers } from '../src/players.js';
import {
  extractSaveState,
  recognizeVerdantSaveV1,
  VERDANT_MIGRATIONS,
} from '../src/storage.js';
import { memoryStorage, createStore } from '@latticekit/persist';
import { asEpochMillis } from '@latticekit/core';

describe('Verdant Storage', () => {
  it('extracts live player and building state into valid V1 save format', () => {
    const [p1, p2] = createPlayers();
    p1.inventory.wood = 55;
    p1.inventory.stone = 23;
    p1.hp = 80;

    p2.inventory.fiber = 19;
    p2.hp = 95;

    const save = extractSaveState(42, [p1, p2], []);
    expect(save.version).toBe(1);
    expect(save.seed).toBe(42);
    expect(save.p1.wood).toBe(55);
    expect(save.p1.stone).toBe(23);
    expect(save.p1.hp).toBe(80);
    expect(save.p2.fiber).toBe(19);
    expect(save.p2.hp).toBe(95);
  });

  it('recognizes valid V1 save and preserves all fields', () => {
    const [p1, p2] = createPlayers();
    const raw = extractSaveState(99, [p1, p2], []);
    const recognized = recognizeVerdantSaveV1(raw);
    expect(recognized.version).toBe(1);
    expect(recognized.seed).toBe(99);
    expect(recognized.p1.wood).toBe(12);
    expect(recognized.p2.wood).toBe(12);
  });

  it('tolerates missing or partial fields by providing sensible defaults', () => {
    const partial = {
      version: 1,
      seed: 123,
      p1: { wood: 10 },
      p2: {},
      buildings: [],
    };
    const recognized = recognizeVerdantSaveV1(partial);
    expect(recognized.version).toBe(1);
    expect(recognized.seed).toBe(123);
    expect(recognized.p1.wood).toBe(10);
    expect(recognized.p1.stone).toBe(0);
    expect(recognized.p1.hp).toBe(100);
    expect(recognized.p2.wood).toBe(0);
    expect(recognized.p2.hp).toBe(100);
  });

  it('round-trips through persist store with memory adapter', () => {
    const [p1, p2] = createPlayers();
    p1.inventory.wood = 99;
    const adapter = memoryStorage();
    const store = createStore({
      key: 'test:verdant',
      chain: VERDANT_MIGRATIONS,
      adapter,
      fresh: () => extractSaveState(1, [p1, p2], []),
      now: () => asEpochMillis(1000, 'test'),
    });

    const openResult = store.open();
    expect(openResult.source).toBe('fresh');

    const saveState = extractSaveState(1, [p1, p2], []);
    store.save(saveState);

    const reloaded = store.open();
    expect(reloaded.source).toBe('save');
    expect(reloaded.state.p1.wood).toBe(99);
  });
});
