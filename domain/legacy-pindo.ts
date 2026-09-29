import type { ConversionRecipe, ProjectDocument, ProjectSnapshot } from './types.js';
import { requireValue } from './errors.js';
import { validateDimensions } from './grid.js';
import { parsePaletteSnapshot } from './palette-snapshot.js';
import { parseProject } from './project.js';
import { validateLegacyStructure } from './schema.js';

export interface LegacyPindoPattern {
  version: 1;
  metadata: {
    brand: 'perler' | 'hama' | 'artkal-s' | 'artkal-r' | 'artkal-c' | 'artkal-a' | 'mard' | 'coco' | 'manman' | 'panpan' | 'mixiaowo';
    width: number; height: number;
    dithering: 'none' | 'floyd-steinberg' | 'ordered';
    background: 'white' | 'black' | 'transparent';
    createdAt: string; sourceHash?: string;
  };
  cells: { colorId: string; isEmpty?: boolean }[][];
}

export interface LegacyImportOptions {
  /** The caller chooses a NEW local identity and stores the result separately. */
  projectId: string;
  name: string;
  importedAt: string;
  palette: unknown;
  /** Explicit caller-supplied settings: never guess lost conversion/material data. */
  recipe: ConversionRecipe;
  board: ProjectDocument['board'];
  /** Exact material identities, not HEX matching. Many-to-one mappings are refused. */
  colorIdMap?: Readonly<Record<string, string>>;
}

export interface LegacyImportResult {
  readonly document: ProjectSnapshot;
  readonly warnings: readonly string[];
}

/** Pure import: no file writes, no hidden clock/randomness, no edits to either input. */
export function migrateLegacyPindo(input: unknown, options: LegacyImportOptions): LegacyImportResult {
  validateLegacyStructure(input);
  requireValue(options !== null && typeof options === 'object', 'E_SCHEMA', '/options', 'Import options are required.');
  const palette = parsePaletteSnapshot(options.palette);
  const { width, height } = input.metadata;
  const count = validateDimensions(width, height);
  requireValue(input.cells.length === height && input.cells.every(row => row.length === width),
    'E_GRID_INVALID', '/cells', 'Legacy matrix dimensions do not match its metadata.');
  const identities = new Map(palette.colors.map(color => [color.id, color.index]));
  const mapping = options.colorIdMap;
  if (mapping !== undefined) {
    requireValue(mapping !== null && typeof mapping === 'object' && !Array.isArray(mapping)
      && [Object.prototype, null].includes(Object.getPrototypeOf(mapping)),
    'E_PALETTE_INVALID', '/colorIdMap', 'Color map must be a plain identity mapping.');
    for (const target of Object.values(mapping)) {
      requireValue(typeof target === 'string' && identities.has(target),
        'E_UNKNOWN_COLOR', '/colorIdMap', 'Color map references an unknown material.');
    }
  }
  const resolvedOrigins = new Map<string, string>();
  const cells: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = input.cells[y][x];
      if (cell.isEmpty === true) { cells.push(0); continue; }
      const target = mapping && Object.hasOwn(mapping, cell.colorId) ? mapping[cell.colorId] : cell.colorId;
      const index = identities.get(target);
      requireValue(index !== undefined, 'E_UNKNOWN_COLOR', `/cells/${y}/${x}/colorId`,
        'An occupied legacy cell has no material in the supplied snapshot.');
      requireValue(!resolvedOrigins.has(target) || resolvedOrigins.get(target) === cell.colorId,
        'E_PALETTE_INVALID', '/colorIdMap', 'Different legacy identities cannot be silently merged.');
      resolvedOrigins.set(target, cell.colorId);
      cells.push(index);
    }
  }
  const document = parseProject({
    schemaVersion: 1, projectId: options.projectId, name: options.name, revision: 0,
    createdAt: input.metadata.createdAt, updatedAt: options.importedAt,
    width, height, palette, cells, progress: Array(count).fill(0), locks: Array(count).fill(0),
    mode: 'single', recipe: options.recipe, board: options.board,
    // Preserve original metadata even when the caller supplies a new conversion recipe.
    notes: `Imported Pindo v1 metadata: ${JSON.stringify(input.metadata)}`,
  });
  const warnings = [
    'Legacy progress and locks are absent; both initialize to zero.',
    'Imported single mode is a draft; topology and material compatibility remain unverified.',
    'Only isEmpty=true becomes EMPTY. Background settings and white/clear colors never imply empty cells.',
    'Original image bytes are not present; importing a grid does not restore its source image.',
  ];
  return Object.freeze({ document, warnings: Object.freeze(warnings) });
}
