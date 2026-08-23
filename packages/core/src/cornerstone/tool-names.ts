/**
 * The Cornerstone tool names the viewer treats as *user drawings*, split by what
 * they mean. Framework-agnostic and dependency-free: this is the one place the
 * sets are declared, so measurement export, undo/redo and the delete overlay can
 * never drift apart (they each used to keep a private copy).
 *
 * Adding a drawing tool means adding it here: to `MEASUREMENT_TOOLS` if it
 * yields a number worth exporting, to `SHAPE_TOOLS` if it is purely visual.
 */

/**
 * Tools that produce a measured value (length, angle, area, intensity). These are
 * the ones measurement export (JSON / CSV / DICOM-SR) reads.
 */
export const MEASUREMENT_TOOLS = [
  "Length",
  "Angle",
  "RectangleROI",
  "EllipticalROI",
  "Probe",
] as const;

/**
 * Purely visual annotations: the user draws a shape to point at something, and no
 * numbers are computed or displayed. `CircleROI` is registered with
 * `calculateStats: false` (see `cornerstone/init.ts`), which skips both the stats
 * pass and the measurement text box, leaving a plain circle like a drawing tool's.
 *
 * Deliberately NOT part of measurement export: there is no value to export.
 */
export const SHAPE_TOOLS = ["CircleROI"] as const;

/**
 * Everything the user can draw. Undo/redo and the per-annotation delete control
 * act on all of it: a plain circle is just as deletable as a length.
 */
export const ANNOTATION_TOOLS: readonly string[] = [...MEASUREMENT_TOOLS, ...SHAPE_TOOLS];
