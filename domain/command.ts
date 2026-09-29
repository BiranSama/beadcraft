import type { CellPatchCommand, DeepReadonly } from './types.js';
import { requireValue } from './errors.js';
import { parseProject } from './project.js';
import { validateCommandStructure } from './schema.js';
import { snapshot } from './snapshot.js';

/** Validate a revision-bound intent; applying, undo and storage belong to the application. */
export function parseCellPatchCommand(input: unknown, projectInput: unknown): DeepReadonly<CellPatchCommand> {
  validateCommandStructure(input);
  const project = parseProject(projectInput);
  requireValue(input.projectId === project.projectId && input.baseRevision === project.revision,
    'E_STALE_REVISION', '/baseRevision', 'Command does not target the current project revision.');
  requireValue(project.revision < 2_147_483_647, 'E_COMMAND_INVALID', '/baseRevision', 'Revision budget exhausted.');
  const seen = new Set<number>();
  for (const [i, edit] of input.edits.entries()) {
    const path = `/edits/${i}`;
    requireValue(edit.index < project.cells.length && !seen.has(edit.index),
      'E_COMMAND_INVALID', path, 'Command positions must be in bounds and unique.');
    seen.add(edit.index);
    requireValue(project.locks[edit.index] === 0, 'E_LOCKED', path, 'Command targets a locked cell.');
    requireValue(edit.before === project.cells[edit.index], 'E_STALE_REVISION', path, 'Command precondition does not match the grid.');
    requireValue(edit.after <= project.palette.colors.length && (edit.after === 0 || project.palette.colors[edit.after - 1].enabled),
      'E_COMMAND_INVALID', path, 'Command references an unavailable material.');
  }
  return snapshot(input);
}
