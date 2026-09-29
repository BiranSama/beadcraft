import type { ProjectDocument, ProjectSnapshot } from './types.js';
import { DomainError, requireValue } from './errors.js';
import { validateGridValues, CanonicalGrid } from './grid.js';
import { validatePaletteSemantics } from './palette-snapshot.js';
import { snapshot } from './snapshot.js';
import { validateProjectStructure } from './schema.js';

/** Cross-field constraints complement, rather than replace, JSON Schema. */
export function validateProjectSemantics(project: ProjectDocument | ProjectSnapshot): void {
  validatePaletteSemantics(project.palette);
  validateGridValues(project.width, project.height, project.cells, project.palette.colors.length);
  const count = project.cells.length;
  requireValue(project.progress.length === count && project.locks.length === count,
    'E_PROJECT_INVALID', '/progress', 'Progress and locks must match the grid size.');
  project.cells.forEach((index, i) => {
    requireValue(index !== 0 || project.progress[i] === 0, 'E_PROJECT_INVALID', `/progress/${i}`,
      'An empty cell cannot be marked complete.');
    requireValue(index === 0 || project.palette.colors[index - 1].enabled,
      'E_PALETTE_INVALID', `/cells/${i}`, 'An occupied cell references a disabled material.');
  });
  const crop = project.recipe.crop;
  requireValue(!crop || (crop.x + crop.width <= 1 + 1e-9 && crop.y + crop.height <= 1 + 1e-9),
    'E_PROJECT_INVALID', '/recipe/crop', 'Crop exceeds the normalized image bounds.');
  requireValue(Date.parse(project.updatedAt) >= Date.parse(project.createdAt),
    'E_PROJECT_INVALID', '/updatedAt', 'Updated time cannot precede creation time.');

  if (project.mode === 'single') {
    requireValue(!project.pieces?.length, 'E_PROJECT_INVALID', '/pieces', 'Single mode cannot contain piece assignments.');
  } else {
    requireValue(project.pieces?.length, 'E_PROJECT_INVALID', '/pieces', 'Multi mode requires piece assignments.');
    const pieceIds = new Set<string>();
    const assigned = new Set<number>();
    for (const [p, piece] of project.pieces.entries()) {
      requireValue(!pieceIds.has(piece.id), 'E_PROJECT_INVALID', `/pieces/${p}/id`, 'Duplicate piece identity.');
      pieceIds.add(piece.id);
      for (const i of piece.indices) {
        requireValue(i < count && project.cells[i] > 0 && !assigned.has(i),
          'E_PROJECT_INVALID', `/pieces/${p}/indices`, 'Piece assignments must be occupied, in bounds and disjoint.');
        assigned.add(i);
      }
    }
    requireValue(assigned.size === project.cells.filter(index => index > 0).length,
      'E_PROJECT_INVALID', '/pieces', 'Every occupied cell must belong to exactly one piece.');
  }
  // Partition validity does not assert physical connectivity or material compatibility.
  const assets = new Map<string, NonNullable<ProjectSnapshot['assets']>[number]>();
  const paths = new Set<string>();
  for (const [i, asset] of (project.assets ?? []).entries()) {
    requireValue(!assets.has(asset.id), 'E_PROJECT_INVALID', `/assets/${i}/id`, 'Duplicate asset identity.');
    assets.set(asset.id, asset);
    if (asset.availability === 'embedded') {
      const extension = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }[asset.mime];
      requireValue(typeof asset.path === 'string' && asset.path.endsWith(extension) && !paths.has(asset.path),
        'E_PROJECT_INVALID', `/assets/${i}/path`, 'Embedded asset path must be unique and match its MIME type.');
      paths.add(asset.path);
    } else {
      requireValue(asset.path === undefined && asset.bytes === undefined && asset.sha256 === undefined,
        'E_PROJECT_INVALID', `/assets/${i}`, 'Omitted assets cannot claim an embedded payload.');
    }
  }
  for (const key of ['sourceAssetId', 'sourceMaskAssetId'] as const) {
    const id = project.recipe[key];
    requireValue(id === undefined || assets.has(id), 'E_PROJECT_INVALID', `/recipe/${key}`, 'Missing asset descriptor.');
    if (id !== undefined) {
      const kind = assets.get(id)!.kind;
      requireValue(key === 'sourceMaskAssetId' ? kind === 'mask' : kind !== 'mask',
        'E_PROJECT_INVALID', `/recipe/${key}`, 'Asset kind does not match its recipe role.');
    }
  }
  const generationIds = new Set<string>();
  for (const [i, record] of (project.generationRecords ?? []).entries()) {
    requireValue(!generationIds.has(record.id), 'E_PROJECT_INVALID', `/generationRecords/${i}/id`, 'Duplicate generation identity.');
    generationIds.add(record.id);
    for (const id of [...record.referenceAssetIds, ...record.outputAssetIds]) {
      requireValue(assets.has(id), 'E_PROJECT_INVALID', `/generationRecords/${i}`, 'Generation record references a missing asset.');
    }
  }
}

export function parseProject(input: unknown): ProjectSnapshot {
  validateProjectStructure(input);
  validateProjectSemantics(input);
  return snapshot(input);
}

export function parseProjectJson(text: string): ProjectSnapshot {
  requireValue(typeof text === 'string' && text.length <= 50 * 1024 * 1024,
    'E_SCHEMA', '/', 'Project JSON exceeds the input character budget.');
  let input: unknown;
  try { input = JSON.parse(text); } catch { throw new DomainError('E_SCHEMA', '/', 'Invalid JSON.'); }
  return parseProject(input);
}

/** Validate again at this boundary; callers cannot smuggle an asserted TS type. */
export function gridFromProject(input: unknown): CanonicalGrid {
  const project = parseProject(input);
  return new CanonicalGrid(project.width, project.height, project.cells, project.palette.colors.length);
}

export function serializeProject(input: unknown): string {
  return JSON.stringify(parseProject(input));
}
