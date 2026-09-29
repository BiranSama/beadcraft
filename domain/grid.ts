import { requireValue } from './errors.js';

export const EMPTY = 0;
export const MAX_SIDE = 4096;
export const MAX_CELLS = 1_048_576;
export const MAX_COLORS = 4096;

export function validateDimensions(width: number, height: number): number {
  requireValue(Number.isInteger(width) && width >= 1 && width <= MAX_SIDE,
    'E_GRID_INVALID', '/width', 'Width must be an integer within the grid budget.');
  requireValue(Number.isInteger(height) && height >= 1 && height <= MAX_SIDE,
    'E_GRID_INVALID', '/height', 'Height must be an integer within the grid budget.');
  const count = width * height;
  requireValue(count <= MAX_CELLS, 'E_GRID_INVALID', '/cells', 'Grid cell budget exceeded.');
  return count;
}

export function validateGridValues(width: number, height: number, cells: readonly number[], paletteSize: number): void {
  const count = validateDimensions(width, height);
  requireValue(Number.isInteger(paletteSize) && paletteSize >= 1 && paletteSize <= MAX_COLORS,
    'E_PALETTE_INVALID', '/palette/colors', 'Invalid palette size.');
  requireValue(Array.isArray(cells) && cells.length === count,
    'E_GRID_INVALID', '/cells', 'Cell array length must equal width times height.');
  for (let i = 0; i < count; i++) {
    requireValue(Number.isInteger(cells[i]) && cells[i] >= EMPTY && cells[i] <= paletteSize,
      'E_GRID_INVALID', `/cells/${i}`, 'Cell references an invalid palette index.');
  }
}

/** One private canonical buffer. Exported arrays are copies, not write access. */
export class CanonicalGrid {
  readonly width: number;
  readonly height: number;
  readonly paletteSize: number;
  #cells: Uint16Array;

  constructor(width: number, height: number, cells: readonly number[], paletteSize: number) {
    // Validate raw numbers BEFORE Uint16 coercion can wrap negative/large values.
    validateGridValues(width, height, cells, paletteSize);
    this.width = width;
    this.height = height;
    this.paletteSize = paletteSize;
    this.#cells = Uint16Array.from(cells);
    Object.freeze(this);
  }

  at(x: number, y: number): number {
    requireValue(Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < this.width && y < this.height,
      'E_GRID_INVALID', '/coordinate', 'Coordinate is outside the grid.');
    return this.#cells[y * this.width + x];
  }

  toArray(): number[] { return Array.from(this.#cells); }
  toUint16Array(): Uint16Array { return this.#cells.slice(); }

  count(): { occupied: number; byIndex: ReadonlyMap<number, number> } {
    const byIndex = new Map<number, number>();
    let occupied = 0;
    for (const index of this.#cells) {
      if (index === EMPTY) continue;
      occupied++;
      byIndex.set(index, (byIndex.get(index) ?? 0) + 1);
    }
    return { occupied, byIndex };
  }
}
