/**
 * Lightweight hanging protocols: pure functions that map a study's series onto
 * the viewer's grid. A protocol takes the series list and a cell budget and
 * returns how many cells to show plus which series index each cell displays.
 * Framework-agnostic: the Vue layer applies the result to its grid, this module
 * never touches the DOM or Cornerstone.
 */
import type { SeriesSummary } from "./datasource";

/** A cell→series mapping: cell `i` shows `assignments[i]` (-1 = leave empty). */
export interface HangingResult {
  /** Grid size to switch to (one of the viewer's valid layouts). */
  cellCount: number;
  /** Series index per cell; length === cellCount. */
  assignments: number[];
}

export interface HangingOptions {
  /** Largest grid the viewer supports (cells beyond a protocol's need stay empty). */
  maxCells: number;
}

export type HangingProtocol = (series: SeriesSummary[], opts: HangingOptions) => HangingResult;

// The grid layouts the viewer offers (cell counts). A protocol picks the
// smallest layout that holds the series it wants to show.
const VALID_LAYOUTS = [1, 2, 4, 6, 8, 10];

// Modalities that aren't stacked images (reports, key-object selections, etc.).
// A grid protocol skips these so it tiles only viewable image series.
const NON_IMAGE_MODALITIES = new Set(["SR", "DOC", "KO", "PR", "AU"]);

/** Whether a series is a report/non-image series (best-effort, by modality). */
export function isImageSeries(series: Pick<SeriesSummary, "modality">): boolean {
  return !NON_IMAGE_MODALITIES.has((series.modality ?? "").toUpperCase());
}

/** Smallest valid layout that holds `n` cells, capped at `maxCells`. */
function fitLayout(n: number, maxCells: number): number {
  const allowed = VALID_LAYOUTS.filter((c) => c <= maxCells);
  if (!allowed.length) return 1;
  // `allowed` is non-empty here, so the last element exists.
  return allowed.find((c) => c >= n) ?? allowed[allowed.length - 1]!;
}

/** Single view: the first series in one cell (the viewer's default). */
export const singleProtocol: HangingProtocol = (series) => ({
  cellCount: 1,
  assignments: [series.length ? 0 : -1],
});

/**
 * Tile every image series (reports excluded) across the grid in order, choosing
 * the smallest layout that fits. Falls back to single view if there are no image
 * series (e.g. a report-only study).
 */
export const gridProtocol: HangingProtocol = (series, opts) => {
  const imageIndices = series.map((s, i) => ({ s, i })).filter(({ s }) => isImageSeries(s));
  if (!imageIndices.length) return singleProtocol(series, opts);
  const cellCount = fitLayout(imageIndices.length, opts.maxCells);
  const assignments = Array.from({ length: cellCount }, (_, c) => imageIndices[c]?.i ?? -1);
  return { cellCount, assignments };
};

/** Built-in protocols, by name. */
export const HANGING_PROTOCOLS: Record<string, HangingProtocol> = {
  single: singleProtocol,
  grid: gridProtocol,
};

export type HangingProtocolName = keyof typeof HANGING_PROTOCOLS;

/**
 * Resolve a protocol from a name or a custom function, then run it. Unknown
 * names fall back to single view, so a bad value never throws or blanks the grid.
 */
export function applyHangingProtocol(
  series: SeriesSummary[],
  protocol: HangingProtocolName | HangingProtocol = "single",
  opts: HangingOptions,
): HangingResult {
  const fn =
    typeof protocol === "function" ? protocol : (HANGING_PROTOCOLS[protocol] ?? singleProtocol);
  return fn(series, opts);
}
