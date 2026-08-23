/**
 * Plugin SDK: a single registration entry point that formalizes the core
 * registries (tools, window presets, data sources) into a public, host-facing
 * API. A plugin is a plain object; `registerPlugin` fans its contributions out
 * to the underlying registries the UI already reads from, so a host extends the
 * viewer by registering a plugin rather than reaching into each registry.
 *
 * Framework-agnostic by design: this lives in `@orbidicom/core` and only knows
 * about core concepts (Cornerstone tools, presets, `DataSource`s). UI-layer
 * contributions (Vue panels, locales) are intentionally out of scope here.
 */
import {
  registerTool,
  registerWindowPreset,
  type ToolRegistration,
  type WlPreset,
} from "./registry";
import type { DataSource } from "./datasource";

/**
 * A named, instantiable backend. Hosts register a factory so a `DataSource` can
 * be created by id from config (e.g. a saved connection) without the app
 * importing every adapter directly.
 */
export interface DataSourceFactory<C = unknown> {
  /** Stable id used to look the factory up (e.g. "dicomweb", "local"). */
  id: string;
  /** Human-readable name for a backend picker. */
  label: string;
  /** Build a ready-to-use `DataSource` from backend-specific config. */
  create: (config: C) => DataSource;
}

const dataSources: DataSourceFactory[] = [];

/** Register a backend factory (idempotent by `id`; first registration wins). */
export function registerDataSource(factory: DataSourceFactory): void {
  if (!dataSources.some((d) => d.id === factory.id)) dataSources.push(factory);
}

export function listDataSources(): readonly DataSourceFactory[] {
  return dataSources;
}

/** Instantiate a registered backend by id. Throws if the id is unknown. */
export function createDataSource(id: string, config: unknown): DataSource {
  const factory = dataSources.find((d) => d.id === id);
  if (!factory) {
    const known = dataSources.map((d) => d.id).join(", ") || "none registered";
    throw new Error(`Unknown data source "${id}" (registered: ${known}).`);
  }
  return factory.create(config);
}

/** A bundle of viewer contributions registered together under one name. */
export interface OrbiPlugin {
  /** Unique plugin name; re-registering the same name is a no-op. */
  name: string;
  /** Left-button tools to add to the toolbar + tool group. */
  tools?: ToolRegistration[];
  /** Modality-aware window/level presets. */
  windowPresets?: WlPreset[];
  /** Backend factories to make available to `createDataSource`. */
  dataSources?: DataSourceFactory[];
}

const plugins: OrbiPlugin[] = [];

/**
 * Register a plugin, fanning its contributions out to the core registries.
 * Idempotent by plugin name, so re-registering (e.g. across HMR) is safe.
 */
export function registerPlugin(plugin: OrbiPlugin): void {
  if (plugins.some((p) => p.name === plugin.name)) return;
  plugins.push(plugin);
  plugin.tools?.forEach(registerTool);
  plugin.windowPresets?.forEach(registerWindowPreset);
  plugin.dataSources?.forEach(registerDataSource);
}

export function listPlugins(): readonly OrbiPlugin[] {
  return plugins;
}
