import type { SeriesSummary } from "./datasource";

/**
 * Order a flat series list so the newest study comes first, each study's series
 * stay contiguous, and the order *within* a study is untouched.
 *
 * Callers sort within a study themselves (both DICOM data sources already sort by
 * SeriesNumber); this only reorders whole study blocks. That split exists because
 * `SeriesSummary` carries no series number, so the viewer — which re-orders after
 * appending a study whose block is already sorted — has nothing to sort by.
 *
 * DICOM DA strings ("YYYYMMDD") compare correctly as plain strings, so an undated
 * study yields "" and lands last under a descending compare. First-appearance
 * order breaks ties between same-dated studies, keeping the result stable and
 * deterministic.
 */
export function orderStudyGroups(series: SeriesSummary[]): SeriesSummary[] {
  // Insertion-ordered Map: group order == first-appearance order.
  const groups = new Map<string, SeriesSummary[]>();
  for (const s of series) {
    const key = s.studyInstanceUID ?? "";
    const g = groups.get(key);
    if (g) g.push(s);
    else groups.set(key, [s]);
  }
  if (groups.size < 2) return series;
  return [...groups.values()]
    .map((list, order) => ({ list, order, date: list[0]?.study?.studyDate ?? "" }))
    .sort((a, b) => (a.date !== b.date ? b.date.localeCompare(a.date) : a.order - b.order))
    .flatMap((g) => g.list);
}
