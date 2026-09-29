export type DomainErrorCode =
  | 'E_SCHEMA' | 'E_GRID_INVALID' | 'E_PALETTE_INVALID' | 'E_PROJECT_INVALID'
  | 'E_UNKNOWN_COLOR' | 'E_COMMAND_INVALID' | 'E_STALE_REVISION' | 'E_LOCKED';

/** Messages contain field paths, never serialized user documents or secret values. */
export class DomainError extends Error {
  constructor(readonly code: DomainErrorCode, readonly path: string, message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

export function requireValue(condition: unknown, code: DomainErrorCode, path: string, message: string): asserts condition {
  if (!condition) throw new DomainError(code, path, message);
}
