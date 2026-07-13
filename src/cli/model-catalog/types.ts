export type ModelCatalogSource = 'remote' | 'lkg' | 'manual';

export interface ModelOption {
  id: string;
  catalogId?: string;
  label: string;
  provider: string;
  efforts: readonly string[];
  source: ModelCatalogSource;
}

export interface NormalizedModelsDevCatalog {
  models: readonly ModelOption[];
}

export type ModelsDevCatalogResult =
  | { ok: true; catalog: NormalizedModelsDevCatalog }
  | { ok: false; issues: readonly string[] };
