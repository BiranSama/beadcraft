export { DomainError } from './errors.js';
export type { DomainErrorCode } from './errors.js';
export { EMPTY, MAX_CELLS, MAX_COLORS, MAX_SIDE, CanonicalGrid } from './grid.js';
export { parsePaletteSnapshot } from './palette-snapshot.js';
export { parseProject, parseProjectJson, serializeProject, gridFromProject } from './project.js';
export { migrateLegacyPindo } from './legacy-pindo.js';
export type { LegacyImportOptions, LegacyImportResult, LegacyPindoPattern } from './legacy-pindo.js';
export { parseCellPatchCommand } from './command.js';
export type * from './types.js';
