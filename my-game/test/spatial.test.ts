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
});
