import type { PaletteSnapshot, FrozenPaletteSnapshot } from './types.js';
import { requireValue } from './errors.js';
import { snapshot } from './snapshot.js';
import { validatePaletteStructure } from './schema.js';

export function validatePaletteSemantics(palette: PaletteSnapshot | FrozenPaletteSnapshot): void {
  const ids = new Set<string>();
  palette.colors.forEach((color, position) => {
    requireValue(color.index === position + 1, 'E_PALETTE_INVALID', `/colors/${position}/index`,
      'Palette indices must be ordered and contiguous from one.');
    requireValue(!ids.has(color.id), 'E_PALETTE_INVALID', `/colors/${position}/id`,
      'Material identities must be unique within the snapshot.');
    ids.add(color.id);
  });
}

export function parsePaletteSnapshot(input: unknown): FrozenPaletteSnapshot {
  validatePaletteStructure(input);
  validatePaletteSemantics(input);
  return snapshot(input);
}
