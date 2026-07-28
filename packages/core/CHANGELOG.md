# @orbidicom/core

## 0.12.2

## 0.12.1

## 0.12.0

### Minor Changes

- [`7ce3c01`](https://github.com/docorbitapp/orbidicom/commit/7ce3c015fd7f274bccc825145e7ac1c8ddb0e5c9) Thanks [@gasci](https://github.com/gasci)! - Group the series rail by study when more than one study is open.

  - `SeriesSummary` carries optional study-level facts (`study.studyDate`,
    `studyDescription`, `patientName`, `patientId`), filled by the DICOMweb,
    DICOM-JSON and local-file sources from data they already parse.
  - `LocalDataSource` now groups dropped files by `StudyInstanceUID` instead of
    merging everything into one synthetic study, and advertises
    `multiStudy: true` — so a folder or archive holding a current exam and its
    prior opens as two study groups offline, with no PACS. Files carrying no
    `StudyInstanceUID` still fall back to the synthetic `"local"` study, and a
    single-study drop is unchanged.
  - Series are returned newest-study-first with each study's series contiguous,
    instead of interleaving series numbers across studies.
  - The rail renders collapsible per-study sections with per-study ordinals; a
    single study is unchanged. Patient name is shown whenever open studies span
    more than one patient.
  - Studies can be added and closed mid-session. Adding preserves annotations, key
    images and layout; closing purges that study's work behind a confirmation.
  - `Viewer` honors `studyUids` reactively and emits `update:studyUids`.
  - **Breaking for custom data-source integrations:** `ThumbnailProvider` gains a
    required `release(seriesUids)` method. Built-in providers are updated; any
    external implementation of the interface must add it.

## 0.11.8

### Patch Changes

- docs: point READMEs at the now-public source repository and drop the stale "repository is private" note

## 0.11.7

### Patch Changes

- [#16](https://github.com/docorbitapp/orbidicom/pull/16) [`933e64f`](https://github.com/docorbitapp/orbidicom/commit/933e64f8f9aa3b918a21d7234e80ec852a0c7329) Thanks [@gasci](https://github.com/gasci)! - Re-center the background frame prefetch on the slice you are actually viewing.

  Series warm-up previously used Cornerstone's `stackPrefetch`, which queues the whole series into the shared request pool up front and never clears it when re-centering. Scrolling mid-warm-up therefore left the queue grinding through the frames next to the _opening_ slice: jump to slice 300 of 400 and the prefetcher kept fetching 40, 41, 42, so scrolling ahead of the warm region stayed slow indefinitely.

  Stack viewports now use their own prefetcher, which keeps a short queue in the pool and re-orders it around the current slice, nearest-first. The whole series still gets warmed and the "caching X/Y" progress bar is unchanged. Unlike `stackPrefetch` — whose re-center clears the _entire global_ prefetch pool — it only ever touches its own requests, so scrolling one cell of a grid no longer stalls the warm-up of the others.

## 0.11.6

### Patch Changes

- [`b19a512`](https://github.com/docorbitapp/orbidicom/commit/b19a51200990a3cfd3dc2e795ed276e7e3db55c6) Thanks [@gasci](https://github.com/gasci)! - Fix the first grid cell going black (and staying black) when loading series into
  other cells of a 2×2+ layout. Each cell created its own Cornerstone
  `RenderingEngine`, and Cornerstone 5's default engine
  (`ContextPoolRenderingEngine`) eagerly allocates a pool of `webGlContextCount`
  (7 by default) WebGL contexts **per engine** — so a 2×2 grid demanded ~28
  contexts and blew past the browser's ~16-context ceiling (lower on Safari/iOS).
  The browser then discards the oldest context, blacking out the first-loaded
  cell, which could not recover because there is no context-restore path and
  reselecting a series reuses the same dead engine.

  All stack viewports (grid cells and the offscreen thumbnailer) now share one
  `RenderingEngine`, keeping every viewport inside a single bounded context pool —
  the same single-engine/multi-viewport pattern the MPR view already uses. Each
  cell is removed with `disableElement` on teardown, and the shared engine is
  destroyed only once its last viewport is released.

## 0.11.5

## 0.11.4

## 0.11.3

### Patch Changes

- [#14](https://github.com/docorbitapp/orbidicom/pull/14) [`09097f2`](https://github.com/docorbitapp/orbidicom/commit/09097f2650d6a0cdea4a927a1f27033ad98d5f97) Thanks [@gasci](https://github.com/gasci)! - Fix two series-rail preview bugs:

  - **iOS/WebKit: invisible thumbnail loading spinner.** The rail spinner used
    `color-mix(…, transparent)` for its track border; in the WebKit used by iOS
    in-app web views that resolves to an invalid value, so the whole `border`
    declaration was dropped and the spinner rendered nothing. It now uses solid
    `rgba` borders (like the viewport spinner), which are theme-agnostic on the
    always-black thumbnail and render everywhere.
  - **Previews silently disabled when a PACS omits the instance count.**
    `NumberOfSeriesRelatedInstances` (0020,1209) is an optional QIDO field, but the
    DICOMweb source collapsed a missing count to `0`, and both preview consumers
    read `0` as “report — show the document glyph, never fetch”. A server that
    omits the count therefore showed document glyphs and zero thumbnails for the
    entire rail. The count is now emitted as `undefined` when absent, and the
    document-glyph decision is gated on the series **modality** (SR/DOC/KO/PR/AU)
    rather than on the count — which also fixes genuine reports that advertise a
    positive instance count previously rendering the broken “no preview” glyph.

## 0.11.2

## 0.11.1

## 0.11.0

### Minor Changes

- [#11](https://github.com/docorbitapp/orbidicom/pull/11) [`dd744d1`](https://github.com/docorbitapp/orbidicom/commit/dd744d1f7b81f89882f9573e41fa5c7e300d664a) Thanks [@gasci](https://github.com/gasci)! - Series rail now shows a preview thumbnail for each series, on desktop and mobile.

  - `@orbidicom/core`: new `createThumbnailProvider` (LRU-cached, single-flight,
    concurrency-limited) and an offscreen `createThumbnailer`; an optional
    `DataSource.getThumbnail` fast path, implemented for DICOMweb via the WADO-RS
    thumbnail endpoint. Backends without it fall back to a client-side render, so
    offline and local-file previews keep working.
  - `@orbidicom/vue`: `SeriesRail` renders a leading preview (compact list on
    desktop, thumbnail-over-caption tile strip on mobile) with skeleton and glyph
    states, loading lazily via `IntersectionObserver`.

## 0.10.0

### Minor Changes

- [#9](https://github.com/docorbitapp/orbidicom/pull/9) [`4270f92`](https://github.com/docorbitapp/orbidicom/commit/4270f9297b2dd4bbd46b6d1f0c48de303b24d529) Thanks [@gasci](https://github.com/gasci)! - Add the **AI & Results** right-dock panel (`AiResultsPanel`) to the Vue viewer, gated by the `features.aiResults` deployment toggle. It imports an `AIResultSet` (JSON), lists results grouped by kind (segmentations / measurements / findings) with accept / reject / visibility toggles, applies the accepted + visible results to the active cell (measurements as Cornerstone annotations, segmentations as labelmap overlays), and exports the accepted set as JSON / CSV / ai-json. A toolbar button opens the panel when the feature is enabled; the demo passes `features` through from its runtime config. Core's `readImageMetadata` / `ImageMetadata` now also expose `sopInstanceUID`, used to align imported SEG labelmaps to the active stack's slices. The panel is responsive (stacks full-width below the viewport on phones, with larger touch targets) and honours custom themes via the standard CSS variables.

### Patch Changes

- Fix multi-frame image counting for PET/CT (and NM/cine/Enhanced objects).

  `LocalDataSource` now reads `NumberOfFrames` (0028,0008) and expands each
  multi-frame instance into per-frame wadouri imageIds (`?frame=N`, 1-based),
  matching the DICOMweb path. Previously a multi-frame local file rendered only its
  first frame and counted as a single image — the remaining frames were silently
  dropped. Its series `numberOfFrames` now sums frames across instances rather than
  counting files.

  The Vue viewer also reconciles the series-rail image count to the number of frames
  actually loaded, so a multi-frame series whose pre-fetch estimate (e.g. a QIDO
  instance count) under-reports frames no longer shows a count that disagrees with
  the scrollable stack.

## 0.9.1

## 0.9.0

### Minor Changes

- [#6](https://github.com/docorbitapp/orbidicom/pull/6) [`942c0bb`](https://github.com/docorbitapp/orbidicom/commit/942c0bbb144cedc76f9418ea26c8acf49d694d69) Thanks [@gasci](https://github.com/gasci)! - Add a per-annotation **×** overlay to delete a single measurement directly in the viewport, and make annotation **delete** and **move/resize edits** undoable/redoable via the existing undo/redo (Ctrl/Cmd+Z, toolbar). Core gains `deleteAnnotation`, `getAnnotationDeleteTargets`, and `StackHandle.getViewport()`; the history controller records `edit` steps coalesced to one per drag gesture.

## 0.8.1

### Patch Changes

- docs: align CLI README feature table with shipped reality — mark DICOM-SR export (Part-10 + STOW-RS upload) as shipped and correct the DICOM-SEG row to "read-only labelmap rendering (2D stack)".

## 0.8.0

### Minor Changes

- [`614f04b`](https://github.com/docorbitapp/orbidicom/commit/614f04bf96ec36d353106c6275d223504d64d5ea) Thanks [@gasci](https://github.com/gasci)! - Add annotation undo/redo. Create and delete of measurements can now be stepped
  back and forward via Ctrl/Cmd+Z (undo), Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y (redo),
  and two new toolbar buttons that disable when their stack is empty.

  - core: new `annotationHistory` controller + `startAnnotationHistory()`
    (command/inverse history over Cornerstone's global annotation state), a pure
    `resolveEditCommand` hotkey helper, and `StackHandle.refreshAnnotations()`.
  - vue: undo/redo toolbar buttons, keyboard shortcuts, and `undo`/`redo` strings
    in all 20 locales.

  Clear-all resets the history (it is a deliberate bulk action, not an undoable
  step); loading a new series set also resets it. Moving/resizing an existing
  annotation is not a discrete history step, but such edits are preserved across
  an undo→redo round trip.

- [`09c19e7`](https://github.com/docorbitapp/orbidicom/commit/09c19e70ba6e10fa0738bc831cbca42ca2796df3) Thanks [@gasci](https://github.com/gasci)! - Add key-image flagging. Mark/unmark the current slice as a key image via a star
  toolbar toggle (with a count badge) or the `k` hotkey, and export the flagged
  slices as JSON.

  - core: `KeyImage` type + `keyImagesToJson` serializer (provenance envelope,
    mirrors the measurement export), and a `keyImage` hotkey command bound to `k`.
  - vue: star toggle + count badge + capability-gated key-images export button;
    `flagKeyImage`/`keyImages` strings in all 20 locales. Flags reset when a new
    series set loads.

- [`5e4b647`](https://github.com/docorbitapp/orbidicom/commit/5e4b6470d618f13f5dd2711ce2fabc2365b99bf1) Thanks [@gasci](https://github.com/gasci)! - Add read-only DICOM-SEG labelmap rendering (2D stack). Segmentations discovered in
  a series can be toggled on/off as colored labelmap overlays.

  - core: `DataSource.getSegmentation` fetches a SEG's PixelData via WADO-RS bulkdata
    and decodes it (using the existing SEG parser) into per-source-image labelmaps
    (`DicomWebDataSource` implementation, with the SEG metadata cached during
    `getImageIds`). `seg/align.ts` pairs labelmaps to a viewport's stack by SOP UID,
    and `cornerstone/seg.ts` (`StackHandle.showSegmentation` / `hideSegmentation`)
    draws them as a Cornerstone stack labelmap with each segment's display color.
  - vue: a "Segmentations" sidebar list for the active series with per-SEG toggles;
    `segmentations` string in all 20 locales.

  The data + orchestration layers are unit-tested; the WebGL render itself needs
  real-browser verification — see `docs/seg-rendering-qa.md`. MPR/volume rendering
  and brush/threshold editing remain future work.

- [`5ff3ccf`](https://github.com/docorbitapp/orbidicom/commit/5ff3ccf96ddc1943de1a873e2ec9b50aeef8b7b3) Thanks [@gasci](https://github.com/gasci)! - Add DICOM-SR Part-10 encoding + STOW-RS upload. Measurements can now be uploaded
  to a store-capable PACS as a Comprehensive SR.

  - core: `dicomJsonToPart10` — a small, dependency-free Explicit-VR-Little-Endian
    Part-10 writer (preamble + generated File Meta Information + dataset, including
    nested sequences) that encodes the DICOM-JSON from `buildMeasurementSr`. Verified
    by round-tripping through `dicom-parser`.
  - vue: a capability-gated "Upload SR" toolbar button (shown when the source
    advertises `store` and measurements exist) with a confirm + result dialog;
    `uploadSr`/`confirmUploadSr`/`upload`/`srUploaded`/`srUploadFailed` strings in
    all 20 locales. Uploads via the existing `DataSource.storeInstances` (STOW-RS).

## 0.7.2

### Patch Changes

- docs: refresh the README screenshots.

## 0.7.1

### Patch Changes

- docs: add desktop and mobile screenshots to the README and the published package READMEs.

## 0.7.0

### Minor Changes

- Zoom now responds to a single-finger touch drag like every other tool, instead of
  requiring a two-finger pinch. The `ZoomTool` is registered with `pinchToZoom: false`
  so its touch handler uses the plain vertical-drag zoom when Zoom is the active tool.

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

## 0.3.0

### Minor Changes

- LocalDataSource now renders encapsulated-PDF reports from local `.dcm` files. Previously
  only the DICOMweb source handled encapsulated PDFs; the local reader dropped any instance
  without PixelData at ingestion, so a PDF report opened offline (`npx orbidicom`, drag-drop)
  silently vanished. `LocalDataSource` now detects encapsulated PDFs (Encapsulated PDF Storage
  SOP class, or any instance carrying an `EncapsulatedDocument` `0042,0011`), retains their
  bytes, advertises `capabilities.encapsulatedPdf`, and implements `listPdfs` / `getPdfObjectUrl`
  — matching the DICOMweb contract, so the viewer renders them with no UI change.

- Render DICOM Structured Reports (SR). SR series are no longer filtered out — they're
  parsed into a normalized `SrTree` and shown as a readable, indented document. The
  `DataSource` interface gains a generalized report surface (`listReports`,
  `getStructuredReport`, `ReportInstance`, `capabilities.reports`) alongside the
  existing PDF hooks; `DicomWebDataSource` parses the SR Content Sequence already inline
  in WADO-RS metadata (no extra fetch). The new `SrView` renders the tree with escaped
  interpolation (no `v-html`), themed from CSS tokens, with SR error/placeholder i18n in
  all four locales. Core text value types (CONTAINER/TEXT/NUM/CODE/DATE/TIME/PNAME/UIDREF)
  render fully; spatial/image/waveform types show a labeled placeholder for now.

## 0.2.1

### Patch Changes

- Maintenance release. Republishes the encapsulated-PDF support from 0.2.0 (whose release run did not complete publishing); no source changes. CI builds the container image amd64-only (emulated arm64 was prohibitively slow).

## 0.2.0

### Minor Changes

- Render encapsulated-PDF report series. `DicomWebDataSource` gains `getPdfObjectUrl()` (WADO-RS bulk fetch with multipart unwrap, rebased onto the configured root, honoring cookie/bearer auth), and the `<Viewer>` shows a `PdfView` (lazy-loaded pdf.js) for PDF-only series instead of an empty cell. New `PdfInstance` type and optional `DataSource.listPdfs` / `getPdfObjectUrl` hooks.

## 0.1.0

### Minor Changes

- [`97ae566`](https://github.com/docorbitapp/orbidicom/commit/97ae5662c7dfe547ca2d1449885405da8b1dd154) Thanks [@gasci](https://github.com/gasci)! - Port the headless DICOM engine: Cornerstone init/stack, WADO-RS image IDs,
  window presets, and pluggable DicomWeb + Local data sources.
