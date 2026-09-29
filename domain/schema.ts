import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import paletteSchema from './schemas/palette.schema.json' with { type: 'json' };
import projectSchema from './schemas/project.schema.json' with { type: 'json' };
import commandSchema from './schemas/cell-patch.schema.json' with { type: 'json' };
import legacySchema from './schemas/legacy-pindo.schema.json' with { type: 'json' };
import type { PaletteSnapshot, ProjectDocument, CellPatchCommand } from './types.js';
import type { LegacyPindoPattern } from './legacy-pindo.js';
import { DomainError } from './errors.js';

// Never coerce numbers, remove unknown fields, or fill missing fields at import.
// The v1 asset schema defines properties outside an allOf/then required branch.
// Disable only that schema-authoring warning; required still validates at runtime.
const ajv = new Ajv2020({ strict: true, strictRequired: false, ownProperties: true, allErrors: false });
addFormats(ajv);
ajv.addSchema(paletteSchema);
const palette = ajv.getSchema(paletteSchema.$id)!;
const project = ajv.compile(projectSchema);
const command = ajv.compile(commandSchema);
const legacy = ajv.compile(legacySchema);

function check(validate: ValidateFunction, input: unknown): void {
  if (validate(input)) return;
  const error = validate.errors?.[0];
  // Do not include input values, filenames, prompts or user data in errors.
  throw new DomainError('E_SCHEMA', error?.instancePath || '/',
    `Invalid document structure (${error?.keyword ?? 'validation'}).`);
}

export function validatePaletteStructure(input: unknown): asserts input is PaletteSnapshot { check(palette, input); }
export function validateProjectStructure(input: unknown): asserts input is ProjectDocument { check(project, input); }
export function validateCommandStructure(input: unknown): asserts input is CellPatchCommand { check(command, input); }
export function validateLegacyStructure(input: unknown): asserts input is LegacyPindoPattern { check(legacy, input); }
