/** Persistence contract v1. JSON Schemas and semantic validation remain authoritative. */
export interface BeadMaterial {
  nominalDiameterMm?: number;
  fuseFamily: string;
  compatibility: 'unknown' | 'user-verified' | 'manufacturer-declared';
}
export interface BeadColor {
  index: number; id: string; code: string; name: string; displayHex: string;
  brand: string; series: string; finish: 'opaque' | 'clear' | 'translucent' | 'special';
  enabled: boolean; conceptOnly: boolean; material: BeadMaterial;
}
export interface PaletteSnapshot {
  schemaVersion: 1; id: string; version: string; name: string;
  provenance: { kind: 'manufacturer' | 'community' | 'user-measured' | 'user' | 'demo'; description: string; sourceUrl?: string; capturedOn: string; licenseNote: string };
  colors: BeadColor[];
}
export interface ConversionRecipe {
  algorithmVersion: string; sourceAssetId?: string; sourceMaskAssetId?: string; fit: 'crop' | 'contain';
  crop?: { x: number; y: number; width: number; height: number };
  backgroundMode: 'auto' | 'alpha' | 'manual' | 'none'; coverageThreshold: number;
  maxColors: number; seed: number; style: 'faithful' | 'stylized';
  dither: 'none' | 'floyd-steinberg' | 'ordered'; sampling: 'area' | 'nearest';
}
export interface AssetDescriptor {
  id: string; kind: 'source' | 'normalized-source' | 'mask' | 'ai-generated';
  availability: 'embedded' | 'omitted'; path?: string; mime: 'image/png' | 'image/jpeg' | 'image/webp';
  bytes?: number; sha256?: string;
}
export interface GenerationRecord {
  id: string; createdAt: string; providerConfigId: string; modelId: string; skillVersion: string;
  prompt: string; parameters: { count: number; aspectRatio: string; transparent: boolean; seed?: number };
  referenceAssetIds: string[]; outputAssetIds: string[]; remoteJobId?: string; billingStatus: 'unknown' | 'reported';
}
export interface ProjectDocument {
  schemaVersion: 1; projectId: string; name: string; revision: number; createdAt: string; updatedAt: string;
  width: number; height: number; palette: PaletteSnapshot; cells: number[]; progress: number[]; locks: number[];
  mode: 'single' | 'multi'; pieces?: { id: string; name: string; indices: number[] }[];
  recipe: ConversionRecipe; board: { columns: number; rows: number; pitchMm?: number; beadDiameterMm?: number; source: string };
  notes?: string; assets?: AssetDescriptor[]; generationRecords?: GenerationRecord[];
}
export interface CellPatchCommand {
  commandId: string; projectId: string; baseRevision: number;
  edits: { index: number; before: number; after: number }[];
}

/** Detached, immutable JSON snapshots. Mutable runtime buffers are exported only as copies. */
export type DeepReadonly<T> = T extends readonly (infer U)[] ? readonly DeepReadonly<U>[] : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
export type FrozenPaletteSnapshot = DeepReadonly<PaletteSnapshot>;
export type ProjectSnapshot = DeepReadonly<ProjectDocument>;
