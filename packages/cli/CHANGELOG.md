# orbidicom

## 0.11.1

## 0.11.0

## 0.10.0

### Minor Changes

- [#9](https://github.com/docorbitapp/orbidicom/pull/9) [`4270f92`](https://github.com/docorbitapp/orbidicom/commit/4270f9297b2dd4bbd46b6d1f0c48de303b24d529) Thanks [@gasci](https://github.com/gasci)! - Add the **AI & Results** right-dock panel (`AiResultsPanel`) to the Vue viewer, gated by the `features.aiResults` deployment toggle. It imports an `AIResultSet` (JSON), lists results grouped by kind (segmentations / measurements / findings) with accept / reject / visibility toggles, applies the accepted + visible results to the active cell (measurements as Cornerstone annotations, segmentations as labelmap overlays), and exports the accepted set as JSON / CSV / ai-json. A toolbar button opens the panel when the feature is enabled; the demo passes `features` through from its runtime config. Core's `readImageMetadata` / `ImageMetadata` now also expose `sopInstanceUID`, used to align imported SEG labelmaps to the active stack's slices. The panel is responsive (stacks full-width below the viewport on phones, with larger touch targets) and honours custom themes via the standard CSS variables.

## 0.9.1

## 0.9.0

### Minor Changes

- [#6](https://github.com/docorbitapp/orbidicom/pull/6) [`942c0bb`](https://github.com/docorbitapp/orbidicom/commit/942c0bbb144cedc76f9418ea26c8acf49d694d69) Thanks [@gasci](https://github.com/gasci)! - Add a per-annotation **×** overlay to delete a single measurement directly in the viewport, and make annotation **delete** and **move/resize edits** undoable/redoable via the existing undo/redo (Ctrl/Cmd+Z, toolbar). Core gains `deleteAnnotation`, `getAnnotationDeleteTargets`, and `StackHandle.getViewport()`; the history controller records `edit` steps coalesced to one per drag gesture.

## 0.8.1

### Patch Changes

- docs: align CLI README feature table with shipped reality — mark DICOM-SR export (Part-10 + STOW-RS upload) as shipped and correct the DICOM-SEG row to "read-only labelmap rendering (2D stack)".

## 0.8.0

## 0.7.2

### Patch Changes

- docs: refresh the README screenshots.

## 0.7.1

### Patch Changes

- docs: add desktop and mobile screenshots to the README and the published package READMEs.

## 0.7.0

## 0.6.1

### Patch Changes

- Simplify the on-image metadata overlay to two states — **show info** ⇄ **blur
  patient data** — dropping the third "hidden" mode (the overlay is now always
  shown, the button just toggles the privacy blur). Fix iOS Safari zooming the page
  when the language-search field is focused (input text is bumped to 16px on touch
  devices). Expand the README docs with verified, copy-pasteable examples (auth
  strategies, local/NIfTI/DICOM-JSON sources, worklist search, measurement/SR
  export, MPR, theming, keymaps), cross-link the `orbidicom` CLI from the core and
  vue package docs, refresh the roadmap for v0.6.0, and add a trademark/contact
  notice (info@docorbit.com).

## 0.6.0

### Minor Changes

- [#4](https://github.com/docorbitapp/orbidicom/pull/4) [`19276b4`](https://github.com/docorbitapp/orbidicom/commit/19276b470338f4e0292700a1b93c9702270ba56a) Thanks [@gasci](https://github.com/gasci)! - DICOM-SR measurement export, a worklist UI, and more segmentation groundwork.

  **Core (`@orbidicom/core`)**

  - **DICOM-SR generation** — `buildMeasurementSr` (`sr/to-json.ts`) turns collected
    `Measurement`s into a Comprehensive SR (TID-1500-flavored, DICOM-JSON) with a Measurement
    Group per annotation and a coded NUM item per statistic (SCT/DCM concepts, UCUM units). It
    round-trips through the existing `srTreeFromJson` reader; encoding to Part-10 (dcmjs) for
    STOW-RS upload is the remaining host-side step.
  - **SEG labelmap assembly** — `buildSegLabelmaps` merges the decoded per-frame SEG masks into one
    segment-number raster per source image (the render-ready data the WebGL labelmap will consume).

  **Vue (`@orbidicom/vue`)**

  - **`<StudyList>` worklist component** — a patient / ID / accession / modality filter form →
    results table that emits `open(studyInstanceUID)`, driven by a `DataSource`'s `searchStudies`
    (capability-gated, RTL-aware). Adds nine worklist UI strings across all 20 locales.
  - Exposes the `isRtl` / `dir` i18n helpers from the package entry point.

## 0.5.0

### Minor Changes

- [#3](https://github.com/docorbitapp/orbidicom/pull/3) [`ef66109`](https://github.com/docorbitapp/orbidicom/commit/ef6610994640a205e72925bd3c2bed702b18c032) Thanks [@gasci](https://github.com/gasci)! - Tier 2 data-source + segmentation groundwork, plus five more UI languages with RTL support.

  **Core (`@orbidicom/core`)**

  - **QIDO-RS worklist** — `DataSource.searchStudies(query?)` returning `StudySummary[]`, with a
    `StudyQuery` filter (patient, accession, date, modality, paging). Implemented for DICOMweb
    (`capabilities.studySearch`). PatientName is reduced to its Alphabetic component.
  - **STOW-RS upload** — `DataSource.storeInstances(files, { studyUid? })` returning a `StoreResult`
    (`stored` / `failed`). DICOMweb POSTs a single `multipart/related; type="application/dicom"`
    body and parses the Store-Instances response (`capabilities.store`).
  - **DICOM-JSON data source** — a new in-memory `DicomJsonDataSource` (registered as the
    `dicomjson` factory) that serves series + frame-expanded WADO-RS image ids + per-image
    metadata from a DICOM-JSON document, no QIDO/WADO round-trip.
  - **DICOM-SEG (read-only parsing)** — `core/src/seg/parse.ts`: SOP-class detection, segment
    definitions (labels, property codes, Recommended-Display-CIELab → sRGB color), per-frame →
    segment/source-image mapping, and BINARY-bitstream decode. DICOMweb routes SEG instances out
    of the image stack and exposes them via `listSegmentations` (`capabilities.segmentations`).
    The WebGL labelmap render remains a real-browser-QA follow-up.

  **Vue (`@orbidicom/vue`)**

  - **Five more UI languages** — Arabic (`ar`), Persian (`fa`), Bengali (`bn`), Vietnamese (`vi`),
    Ukrainian (`uk`) — taking the built-in set to 20.
  - **Right-to-left support** — `isRtl` / `dir` helpers; `<Viewer>` mirrors its layout via a `dir`
    attribute that follows the active language (Arabic, Persian).
  - **Language picker** now opens toward whichever side has more room, so it is no longer clipped
    at the top of the viewport on mobile.

## 0.4.0

### Minor Changes

- [#1](https://github.com/docorbitapp/orbidicom/pull/1) [`c3b0f9f`](https://github.com/docorbitapp/orbidicom/commit/c3b0f9f84faad92f6b5f645299c73bbffaacd04f) Thanks [@gasci](https://github.com/gasci)! - Measurement export and an MPR / volume viewport — the rest of Tier 1.

  - **Measurement export** — `@orbidicom/core` gains `collectMeasurements` /
    `measurementsToJson` / `measurementsToCsv` (Length, Angle, ROIs, Probe → normalized
    stats with units and world points). The toolbar exposes JSON and CSV export buttons
    (shown only when measurements exist); files download as `<series>_measurements_<ts>.<ext>`.
    DICOM-SR generation is intentionally deferred (needs a Part-10 writer + STOW-RS upload);
    the exported shape is SR-friendly for a future builder.
  - **MPR / volume viewport + crosshairs** — `createMprView` builds a 3D volume and shows it
    in three linked orthographic panes (axial / coronal / sagittal) with a `CrosshairsTool`.
    The layout selector gains an **MPR** entry for volume-capable series (multi-slice CT / MR /
    PT / NM); the stack grid stays mounted (hidden) so switching back is instant. `isVolumeCapable`
    gates the option. Rendering and crosshair sync require a real WebGL browser; unit tests
    cover the wiring and gating only.
  - Internal: shared viewport-capture helpers moved to `cornerstone/capture.ts`.

- [#1](https://github.com/docorbitapp/orbidicom/pull/1) [`c3b0f9f`](https://github.com/docorbitapp/orbidicom/commit/c3b0f9f84faad92f6b5f645299c73bbffaacd04f) Thanks [@gasci](https://github.com/gasci)! - Five more UI languages and a searchable language switcher.

  - **15 built-in languages** — adds Korean (`ko`), Hindi (`hi`), Indonesian (`id`), Dutch
    (`nl`), and Polish (`pl`) to the existing ten, all with the full key set (the runtime
    key-parity test guards against gaps).
  - **Searchable `LangSwitcher`** — the native `<select>` is replaced by an accessible combobox:
    a trigger showing the active language opens a popover with a type-to-filter search
    (diacritic-insensitive, matches the localized name, the endonym, and the locale code),
    keyboard navigation, and click-outside / Escape to dismiss.
  - **Localized language names** — each language is labeled in the active UI language via
    `Intl.DisplayNames` (a new `localeName` helper), so with Turkish active "Korean" shows as
    "Korece"; each row keeps the language's own endonym ("한국어") as a secondary hint so a
    misclick into an unfamiliar UI language is still recoverable.
  - Right-to-left scripts (Arabic, Hebrew) are intentionally a follow-up — they need UI
    mirroring beyond a string table.

- [#1](https://github.com/docorbitapp/orbidicom/pull/1) [`c3b0f9f`](https://github.com/docorbitapp/orbidicom/commit/c3b0f9f84faad92f6b5f645299c73bbffaacd04f) Thanks [@gasci](https://github.com/gasci)! - Download the active slice as a JPEG (image + measurements).

  - `@orbidicom/core`: new `StackHandle.captureSliceJpeg(quality?)` composites the rendered
    viewport canvas with its annotation SVG overlay into an opaque JPEG `Blob`. The patient
    metadata overlay is a separate DOM layer and is never burned in. Returns `null` for
    report/SR/PDF cells (nothing to capture).
  - `@orbidicom/vue`: a toolbar **Download image as JPEG** button (shown only when the active
    cell holds an image stack) saves `<series>_<slice>.jpg` — image plus any length/angle/ROI
    measurements, no patient text. Localized in all 10 languages.

- [#1](https://github.com/docorbitapp/orbidicom/pull/1) [`c3b0f9f`](https://github.com/docorbitapp/orbidicom/commit/c3b0f9f84faad92f6b5f645299c73bbffaacd04f) Thanks [@gasci](https://github.com/gasci)! - 3D volume rendering (VR) in the MPR view — an OHIF-style hanging protocol.

  - **`@orbidicom/core`** — `createMprView` now builds a four-up reconstruction: the three
    orthographic planes (axial / coronal / sagittal, crosshairs) plus a **3D volume-rendering
    pane** on a `VOLUME_3D` viewport with `TrackballRotate`. New exports `VR_PRESETS` (a curated
    set of Cornerstone transfer-function presets — CT-Bone, CT-Soft-Tissue, CT-Lung, CT-Muscle,
    CT-Cardiac, CT-MIP, MR-Default, MR-Angio, MR-MIP) and `defaultVrPreset(modality)`. The handle
    gains `setPreset(name)`; `setVolume` takes an optional `{ modality }` to light the 3D pane with
    a sensible default. The 3D pane and the orthographic planes use separate per-instance tool
    groups, both torn down (and the shared volume evicted) on `destroy`.
  - **`@orbidicom/vue`** — the MPR layout renders as a 2×2 grid with the 3D pane and a floating
    rendering-preset picker; the layout option reads "MPR / 3D". The option is now always listed
    in the layout dropdown but **disabled with an explanatory tooltip** when the active series
    isn't volume-capable (instead of being hidden), so the capability is discoverable.
  - **NIfTI is now MPR / 3D-eligible** — `SeriesSummary` gains an optional `volumetric` flag, set
    by `NiftiDataSource`, and `isVolumeCapable` honors it. NIfTI volumes carry no DICOM modality,
    so they were previously excluded from reconstruction; they now build through the same
    streaming-volume path (the default VR preset falls back to CT-Bone).
  - Rendering, crosshair reslice, and VR correctness require a real WebGL browser and a true
    volumetric series — unit tests cover wiring, preset/tool plumbing, and the `isVolumeCapable`
    gate only. A real-browser QA pass is still needed before release.

- [#1](https://github.com/docorbitapp/orbidicom/pull/1) [`c3b0f9f`](https://github.com/docorbitapp/orbidicom/commit/c3b0f9f84faad92f6b5f645299c73bbffaacd04f) Thanks [@gasci](https://github.com/gasci)! - Keyboard shortcuts, a modality-aware window-level preset engine, and six more UI languages.

  - **Keyboard shortcuts** — a framework-agnostic keymap (`DEFAULT_KEYMAP`, `resolveHotkey`) in
    `@orbidicom/core`, wired into `<Viewer>`: letter keys select tools, `i`/`r`/`f`/`0` run view
    transforms, space toggles cine, arrows page slices, and digits `1`–`9` apply window presets.
    Bindings are shown in the toolbar tooltips and can be overridden via the new `keymap` prop.
  - **W/L preset engine** — `windowPresetsFor` is no longer CT-only. CT still ships its five
    standard windows, but a host can register protocol windows for **any** modality via
    `registerWindowPreset` (matched case-insensitively) and they surface in the toolbar.
  - **More languages** — the UI now ships **10 locales** (added Français, Italiano, Português,
    Русский, 中文, 日本語 alongside English, Türkçe, Deutsch, Español), with the live switcher
    and English fallback for any missing key.

- [#2](https://github.com/docorbitapp/orbidicom/pull/2) [`eaee06d`](https://github.com/docorbitapp/orbidicom/commit/eaee06d3566c48204b78dd52488a43b8ab3ccb1d) Thanks [@gasci](https://github.com/gasci)! - Tier 2: a Plugin SDK and lightweight hanging protocols.

  - **Plugin SDK (`@orbidicom/core`)** — `registerPlugin({ name, tools, windowPresets, dataSources })`
    fans a plugin's contributions out to the core registries the UI already reads from;
    `listPlugins()` enumerates what's registered (idempotent by name). Adds a **data-source factory
    registry**: `registerDataSource`, `listDataSources`, and `createDataSource(id, config)` to build
    a backend by id — with the built-in adapters (`dicomweb`, `local`, `nifti`) pre-registered.
  - **Hanging protocols (`@orbidicom/core` + `@orbidicom/vue`)** — `applyHangingProtocol(series,
protocol, { maxCells })` maps a study's series onto the grid; built-ins `single` (default) and
    `grid` (tile image series, reports excluded, into the smallest fitting layout), plus custom
    functions. `<Viewer>` gains a `hanging-protocol` prop applied once the study loads; the default
    preserves the existing single-cell behavior.

## 0.3.1

### Patch Changes

- Add a README for the `orbidicom` CLI package so the npm page documents the project and
  `npx orbidicom` usage (quick start, PACS + auth flags, deploy pointers).

## 0.3.0

### Minor Changes

- PACS authentication is now configurable per deployment. `npx orbidicom` gains
  `--auth <none|basic|bearer|cookie>` with `--token` (bearer) and `--username`/
  `--password` (basic); the Docker image reads `ORBIDICOM_AUTH_KIND` / `_TOKEN` /
  `_USERNAME` / `_PASSWORD`; the Helm chart adds a `pacs.auth` block. The viewer
  applies the chosen strategy (already supported by `@orbidicom/core`'s `AuthStrategy`)
  to its DICOMweb requests; auth is read from the base config only, never URL query
  params. SECURITY: basic/bearer credentials are embedded in the client-readable
  config.js — prefer `cookie`/same-origin, or inject credentials from a Kubernetes
  Secret via `extraEnv` and keep them out of plain values.
