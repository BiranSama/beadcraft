import type { DeepReadonly } from './types.js';

function freeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

/** Call only after validating JSON-shaped input; never freeze the caller's object. */
export function snapshot<T>(value: T): DeepReadonly<T> {
  return freeze(structuredClone(value));
}
