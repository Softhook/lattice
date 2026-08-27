/**
 * Zero-allocation 2D spatial grid for Verdant.
 *
 * Partitions the world into uniform square cells for fast $O(1)$ localized neighborhood
 * queries. Replaces $O(N^2)$ brute-force distance checks across creatures and flora with
 * fast fixed-radius cell lookups.
 *
 * Engineered with flat preallocated typed arrays so indexing and querying allocate ZERO heap objects.
 */

import { clamp } from '@latticekit/core';
import { W, H } from './world.js';

/** Cell dimension in tiles. 16x16 tiles gives a 40x40 cell grid for the 640x640 world. */
export const CELL_SIZE = 16;
export const GRID_COLS = Math.ceil(W / CELL_SIZE);
export const GRID_ROWS = Math.ceil(H / CELL_SIZE);
export const TOTAL_CELLS = GRID_COLS * GRID_ROWS;

/**
 * Maximum entities indexed in a single spatial grid instance. Sized to comfortably clear the
 * live flora population — `populateFlora` seeds ~14k plants across the 640x640 continent, and
 * anything above this ceiling silently falls out of the index (see `insert`), so every query
 * would miss it. 16,384 covers flora with headroom; the creature grid never approaches it.
 */
export const MAX_SPATIAL_ENTITIES = 16384;


export class SpatialGrid {
  /** Head of linked-list for each cell: head[cellIndex] -> entity index (or -1 if empty). */
  private readonly head: Int32Array = new Int32Array(TOTAL_CELLS);
  /** Next pointer for each entity: next[entityIndex] -> next entity index in same cell. */
  private readonly next: Int32Array = new Int32Array(MAX_SPATIAL_ENTITIES);
  /** X coordinate in tiles for each entity. */
  private readonly posX: Float64Array = new Float64Array(MAX_SPATIAL_ENTITIES);
  /** Y coordinate in tiles for each entity. */
  private readonly posY: Float64Array = new Float64Array(MAX_SPATIAL_ENTITIES);

  /** Preallocated query results buffer for zero-allocation neighborhood lookups. */
  public readonly queryBuffer: Int32Array = new Int32Array(MAX_SPATIAL_ENTITIES);
  public queryCount = 0;

  constructor() {
    this.clear();
  }

  /** Reset all cell buckets without allocating. */
  clear(): void {
    this.head.fill(-1);
    this.next.fill(-1);
    this.queryCount = 0;
  }

  /**
   * Insert entity `id` (0..MAX_SPATIAL_ENTITIES-1) at position (gx, gy).
   */
  insert(id: number, gx: number, gy: number): void {
    if (id < 0 || id >= MAX_SPATIAL_ENTITIES) return;
    const col = clamp(Math.floor(gx / CELL_SIZE), 0, GRID_COLS - 1);
    const row = clamp(Math.floor(gy / CELL_SIZE), 0, GRID_ROWS - 1);
    const cellIdx = row * GRID_COLS + col;

    this.posX[id] = gx;
    this.posY[id] = gy;
    this.next[id] = this.head[cellIdx] ?? -1;
    this.head[cellIdx] = id;
  }

  /**
   * Unlink entity `id` from the cell it was last `insert`ed into, in O(chain length) — the
   * cell is recomputed from the entity's stored position, so a caller removing an entity does
   * not have to remember where it was put. A no-op if `id` is out of range or not currently
   * linked (double removes are safe).
   *
   * This is the single-entity counterpart to `clear()` + full rebuild: on the hot path a
   * grazed or harvested plant is dropped with `remove(id)` plus a swap-pop in the owning array
   * (see `removeFloraAt` in `flora.ts`), which is O(1)-ish instead of re-inserting every entity.
   * A full `clear()` + rebuild is still the right tool for a bulk reload.
   */
  remove(id: number): void {
    if (id < 0 || id >= MAX_SPATIAL_ENTITIES) return;
    const col = clamp(Math.floor((this.posX[id] ?? 0) / CELL_SIZE), 0, GRID_COLS - 1);
    const row = clamp(Math.floor((this.posY[id] ?? 0) / CELL_SIZE), 0, GRID_ROWS - 1);
    const cellIdx = row * GRID_COLS + col;

    let curr = this.head[cellIdx] ?? -1;
    if (curr === id) {
      this.head[cellIdx] = this.next[id] ?? -1;
      this.next[id] = -1;
      return;
    }
    let iters = 0;
    while (curr !== -1 && iters++ < MAX_SPATIAL_ENTITIES) {
      const nxt = this.next[curr] ?? -1;
      if (nxt === id) {
        this.next[curr] = this.next[id] ?? -1;
        this.next[id] = -1;
        return;
      }
      curr = nxt;
    }
  }

  /**
   * Query entity IDs within radius of (gx, gy). Results land in `this.queryBuffer`, count
   * returned and also in `this.queryCount`. Allocates ZERO heap objects.
   *
   * `maxResults` caps how many hits are collected — the query stops the moment it has that
   * many. Callers on the per-creature hot path (boid separation, threat/prey scans) pass a
   * small cap so cost stays bounded even inside a dense herd or warren, where an uncapped
   * radius query can otherwise return hundreds of entities every tick. The hits kept are
   * whichever the cell walk reaches first, not the nearest N — fine for an averaged flee
   * vector or "some nearby prey", not for an exact nearest-neighbor.
   */
  queryRadius(gx: number, gy: number, radius: number, maxResults = MAX_SPATIAL_ENTITIES): number {
    this.queryCount = 0;
    const rSq = radius * radius;
    const cap = maxResults < MAX_SPATIAL_ENTITIES ? maxResults : MAX_SPATIAL_ENTITIES;

    const minCol = clamp(Math.floor((gx - radius) / CELL_SIZE), 0, GRID_COLS - 1);
    const maxCol = clamp(Math.floor((gx + radius) / CELL_SIZE), 0, GRID_COLS - 1);
    const minRow = clamp(Math.floor((gy - radius) / CELL_SIZE), 0, GRID_ROWS - 1);
    const maxRow = clamp(Math.floor((gy + radius) / CELL_SIZE), 0, GRID_ROWS - 1);

    for (let r = minRow; r <= maxRow; r++) {
      const rowOffset = r * GRID_COLS;
      for (let c = minCol; c <= maxCol; c++) {
        let curr = this.head[rowOffset + c] ?? -1;
        let iters = 0;
        while (curr !== -1 && iters++ < MAX_SPATIAL_ENTITIES) {
          if (this.queryCount >= cap) return this.queryCount;
          const ex = this.posX[curr] ?? 0;
          const ey = this.posY[curr] ?? 0;
          const dx = ex - gx;
          const dy = ey - gy;
          if (dx * dx + dy * dy <= rSq) {
            this.queryBuffer[this.queryCount++] = curr;
          }
          curr = this.next[curr] ?? -1;
        }
      }
    }

    return this.queryCount;
  }

  /**
   * Query all entity IDs within an axis-aligned bounding box [minGx, minGy, maxGx, maxGy].
   * Results are stored in `this.queryBuffer`, count in `this.queryCount`.
   * Allocates ZERO heap objects and guarantees finite execution.
   */
  queryRect(minGx: number, minGy: number, maxGx: number, maxGy: number): number {
    this.queryCount = 0;

    const minCol = clamp(Math.floor(minGx / CELL_SIZE), 0, GRID_COLS - 1);
    const maxCol = clamp(Math.floor(maxGx / CELL_SIZE), 0, GRID_COLS - 1);
    const minRow = clamp(Math.floor(minGy / CELL_SIZE), 0, GRID_ROWS - 1);
    const maxRow = clamp(Math.floor(maxGy / CELL_SIZE), 0, GRID_ROWS - 1);

    for (let r = minRow; r <= maxRow; r++) {
      const rowOffset = r * GRID_COLS;
      for (let c = minCol; c <= maxCol; c++) {
        let curr = this.head[rowOffset + c] ?? -1;
        let iters = 0;
        while (curr !== -1 && iters++ < MAX_SPATIAL_ENTITIES) {
          if (this.queryCount >= MAX_SPATIAL_ENTITIES) return this.queryCount;
          const ex = this.posX[curr] ?? 0;
          const ey = this.posY[curr] ?? 0;
          if (ex >= minGx && ex <= maxGx && ey >= minGy && ey <= maxGy) {
            this.queryBuffer[this.queryCount++] = curr;
          }
          curr = this.next[curr] ?? -1;
        }
      }
    }

    return this.queryCount;
  }

}
