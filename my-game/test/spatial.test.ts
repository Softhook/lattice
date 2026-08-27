import { describe, it, expect } from 'vitest';
import { SpatialGrid, CELL_SIZE, GRID_COLS, GRID_ROWS } from '../src/spatial.js';

describe('SpatialGrid', () => {
  it('correctly partitions coordinates into cells and queries radius', () => {
    const grid = new SpatialGrid();

    grid.insert(0, 10, 10);
    grid.insert(1, 12, 11);
    grid.insert(2, 50, 50);

    const countNear = grid.queryRadius(10, 10, 5);
    expect(countNear).toBe(2);

    const results = [];
    for (let i = 0; i < grid.queryCount; i++) {
      results.push(grid.queryBuffer[i]);
    }
    expect(results).toContain(0);
    expect(results).toContain(1);
    expect(results).not.toContain(2);

    const countFar = grid.queryRadius(50, 50, 5);
    expect(countFar).toBe(1);
    expect(grid.queryBuffer[0]).toBe(2);
  });

  it('caps queryRadius results at maxResults so a dense cell cannot blow the budget', () => {
    const grid = new SpatialGrid();
    // 50 entities packed into one small area.
    for (let i = 0; i < 50; i++) grid.insert(i, 20 + (i % 5) * 0.1, 20 + Math.floor(i / 5) * 0.1);

    expect(grid.queryRadius(20, 20, 8)).toBe(50);          // uncapped: all of them
    expect(grid.queryRadius(20, 20, 8, 10)).toBe(10);      // capped
    expect(grid.queryCount).toBe(10);
    // The cap only limits how many are collected — the ones returned are still real hits.
    for (let i = 0; i < 10; i++) {
      const id = grid.queryBuffer[i];
      expect(id).toBeGreaterThanOrEqual(0);
      expect(id).toBeLessThan(50);
    }
  });

  it('queries rectangular bounding boxes accurately', () => {
    const grid = new SpatialGrid();

    grid.insert(10, 15, 15);
    grid.insert(20, 25, 25);
    grid.insert(30, 80, 80);

    const count = grid.queryRect(10, 10, 30, 30);
    expect(count).toBe(2);

    const ids = [grid.queryBuffer[0], grid.queryBuffer[1]];
    expect(ids).toContain(10);
    expect(ids).toContain(20);
    expect(ids).not.toContain(30);
  });

  it('handles clearing and re-insertion without memory leak', () => {
    const grid = new SpatialGrid();
    grid.insert(5, 20, 20);
    expect(grid.queryRadius(20, 20, 2)).toBe(1);

    grid.clear();
    expect(grid.queryRadius(20, 20, 2)).toBe(0);

    grid.insert(8, 30, 30);
    expect(grid.queryRadius(30, 30, 2)).toBe(1);
    expect(grid.queryBuffer[0]).toBe(8);
  });

  it('removes a single entity from anywhere in its cell chain without disturbing the rest', () => {
    const grid = new SpatialGrid();
    // Three entities sharing one cell (all within CELL_SIZE of each other), one in another.
    grid.insert(1, 4, 4);
    grid.insert(2, 6, 5);
    grid.insert(3, 5, 6);
    grid.insert(9, 100, 100);

    expect(grid.queryRadius(5, 5, 4)).toBe(3);

    // Remove the middle-of-chain entity (head is the last inserted, id 3).
    grid.remove(2);
    const after = grid.queryRadius(5, 5, 4);
    expect(after).toBe(2);
    const ids = [grid.queryBuffer[0], grid.queryBuffer[1]];
    expect(ids).toContain(1);
    expect(ids).toContain(3);
    expect(ids).not.toContain(2);

    // Removing the head, and an absent id, are both fine.
    grid.remove(3);
    grid.remove(2); // already gone — no-op
    expect(grid.queryRadius(5, 5, 4)).toBe(1);
    expect(grid.queryBuffer[0]).toBe(1);

    // The unrelated cell is untouched.
    expect(grid.queryRadius(100, 100, 2)).toBe(1);
  });

  it('re-keys an entity by removing its old id and inserting its new one (swap-pop pattern)', () => {
    const grid = new SpatialGrid();
    grid.insert(0, 10, 10);
    grid.insert(1, 200, 200);

    // Simulate array swap-pop: item at index 1 moves into slot 0.
    grid.remove(0);
    grid.remove(1);
    grid.insert(0, 200, 200);

    expect(grid.queryRadius(10, 10, 3)).toBe(0);
    expect(grid.queryRadius(200, 200, 3)).toBe(1);
    expect(grid.queryBuffer[0]).toBe(0);
  });
});
