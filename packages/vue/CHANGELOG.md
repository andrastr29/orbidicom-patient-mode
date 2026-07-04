# @orbidicom/vue

## 0.11.5

### Patch Changes

- [#15](https://github.com/docorbitapp/orbidicom/pull/15) [`9281738`](https://github.com/docorbitapp/orbidicom/commit/9281738c9e0919cea0367ff84ed6c4eaed388e90) Thanks [@gasci](https://github.com/gasci)! - Fix the series-rail thumbnail spinner appearing frozen (not rotating) on
  iOS/WebKit. The spinner's parent `.rail__thumb` has `overflow: hidden` +
  `border-radius`, and iOS Safari fails to repaint a rotating child under a
  rounded clip — the ring rendered but sat static. The spinner is now promoted to
  its own compositor layer with `will-change: transform`, which restores the
  rotation. Also removes the `prefers-reduced-motion` guard so the rail spinner
  matches the always-animating viewport spinner. (Follow-up to the 0.11.3 fix,
  which only restored the spinner's _visibility_.)
- Updated dependencies []:
  - @orbidicom/core@0.11.5

## 0.11.4

### Patch Changes

- [`a882974`](https://github.com/docorbitapp/orbidicom/commit/a882974ed85c07eb0bf42616d1c54ee0b2eecd79) Thanks [@gasci](https://github.com/gasci)! - Remove the hover tooltip from the mobile header hamburger (menu) button. The
  `v-tip` chip could surface over the toolbar and block content on some devices;
  the button now carries a plain `aria-label` instead, so it keeps its accessible
  name for screen readers but no longer renders a tooltip.
- Updated dependencies []:
  - @orbidicom/core@0.11.4

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

- Updated dependencies [[`09097f2`](https://github.com/docorbitapp/orbidicom/commit/09097f2650d6a0cdea4a927a1f27033ad98d5f97)]:
  - @orbidicom/core@0.11.3

## 0.11.2

### Patch Changes

- [`4c9dd9a`](https://github.com/docorbitapp/orbidicom/commit/4c9dd9a2aaa71d38e2e4c6998821b500dc05a8a7) Thanks [@gasci](https://github.com/gasci)! - Series rail: while a thumbnail is loading, the tile now shows a small muted
  spinner instead of the shimmer placeholder, so it reads clearly as "loading".
- Updated dependencies []:
  - @orbidicom/core@0.11.2

## 0.11.1

### Patch Changes

- [`772cca7`](https://github.com/docorbitapp/orbidicom/commit/772cca7b5c557e20619b1795fc62da1b25cf352a) Thanks [@gasci](https://github.com/gasci)! - Viewer layout refinements:

  - **Stacked 2×1 grid** — the layout picker now offers a stacked (2×1) two-cell grid
    alongside the existing side-by-side (1×2) option.
  - **Collapsible series rail** — a chevron toggle at the rail edge collapses the rail
    to give the images more room (works on desktop and the mobile top strip).
  - **Smaller mobile thumbnails** — the mobile rail's preview tiles are more compact
    (64px), freeing space on phones.

- Updated dependencies []:
  - @orbidicom/core@0.11.1

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

### Patch Changes

- Updated dependencies [[`dd744d1`](https://github.com/docorbitapp/orbidicom/commit/dd744d1f7b81f89882f9573e41fa5c7e300d664a)]:
  - @orbidicom/core@0.11.0

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

- Updated dependencies [[`4270f92`](https://github.com/docorbitapp/orbidicom/commit/4270f9297b2dd4bbd46b6d1f0c48de303b24d529)]:
  - @orbidicom/core@0.10.0

## 0.9.1

### Patch Changes

- [`f2d020a`](https://github.com/docorbitapp/orbidicom/commit/f2d020a4eabb3f9a0febd10fb250cc98d088f9cd) Thanks [@gasci](https://github.com/gasci)! - Toolbar controls now show a custom, themed hover tooltip instead of the slow,
  OS-styled native `title`. The chip is teleported into the viewer's themed
  container and fixed-positioned (so the toolbar's horizontal scroll can't clip
  it, and it inherits the theme tokens) and displays the action's keyboard shortcut as
  keycaps. It appears on mouse hover and keyboard focus only — never on touch — and
  respects `prefers-reduced-motion`. Labels are mirrored to `aria-label`, so
  icon-only buttons keep an accessible name.

- [`f2d020a`](https://github.com/docorbitapp/orbidicom/commit/f2d020a4eabb3f9a0febd10fb250cc98d088f9cd) Thanks [@gasci](https://github.com/gasci)! - Fix: the cine-speed dropdown now tracks the active grid cell's own fps. In a
  multi-cell grid, autoplaying one cell at 10fps and another at 20fps left the
  dropdown showing a single shared value, so switching the active cell no longer
  reflected that cell's playback speed. Cine speed is now stored per cell.
- Updated dependencies []:
  - @orbidicom/core@0.9.1

## 0.9.0

### Minor Changes

- [#6](https://github.com/docorbitapp/orbidicom/pull/6) [`942c0bb`](https://github.com/docorbitapp/orbidicom/commit/942c0bbb144cedc76f9418ea26c8acf49d694d69) Thanks [@gasci](https://github.com/gasci)! - Add a per-annotation **×** overlay to delete a single measurement directly in the viewport, and make annotation **delete** and **move/resize edits** undoable/redoable via the existing undo/redo (Ctrl/Cmd+Z, toolbar). Core gains `deleteAnnotation`, `getAnnotationDeleteTargets`, and `StackHandle.getViewport()`; the history controller records `edit` steps coalesced to one per drag gesture.

### Patch Changes

- Updated dependencies [[`942c0bb`](https://github.com/docorbitapp/orbidicom/commit/942c0bbb144cedc76f9418ea26c8acf49d694d69)]:
  - @orbidicom/core@0.9.0

## 0.8.1

### Patch Changes

- docs: align CLI README feature table with shipped reality — mark DICOM-SR export (Part-10 + STOW-RS upload) as shipped and correct the DICOM-SEG row to "read-only labelmap rendering (2D stack)".

- Updated dependencies []:
  - @orbidicom/core@0.8.1

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

### Patch Changes

- Updated dependencies [[`614f04b`](https://github.com/docorbitapp/orbidicom/commit/614f04bf96ec36d353106c6275d223504d64d5ea), [`09c19e7`](https://github.com/docorbitapp/orbidicom/commit/09c19e70ba6e10fa0738bc831cbca42ca2796df3), [`5e4b647`](https://github.com/docorbitapp/orbidicom/commit/5e4b6470d618f13f5dd2711ce2fabc2365b99bf1), [`5ff3ccf`](https://github.com/docorbitapp/orbidicom/commit/5ff3ccf96ddc1943de1a873e2ec9b50aeef8b7b3)]:
  - @orbidicom/core@0.8.0

## 0.7.2

### Patch Changes

- docs: refresh the README screenshots.

- Updated dependencies []:
  - @orbidicom/core@0.7.2

## 0.7.1

### Patch Changes

- docs: add desktop and mobile screenshots to the README and the published package READMEs.

- Updated dependencies []:
  - @orbidicom/core@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @orbidicom/core@0.7.0

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
- Updated dependencies []:
  - @orbidicom/core@0.6.1

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

### Patch Changes

- Updated dependencies [[`19276b4`](https://github.com/docorbitapp/orbidicom/commit/19276b470338f4e0292700a1b93c9702270ba56a)]:
  - @orbidicom/core@0.6.0

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

### Patch Changes

- Updated dependencies [[`ef66109`](https://github.com/docorbitapp/orbidicom/commit/ef6610994640a205e72925bd3c2bed702b18c032)]:
  - @orbidicom/core@0.5.0

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

### Patch Changes

- [#1](https://github.com/docorbitapp/orbidicom/pull/1) [`c3b0f9f`](https://github.com/docorbitapp/orbidicom/commit/c3b0f9f84faad92f6b5f645299c73bbffaacd04f) Thanks [@gasci](https://github.com/gasci)! - Refine the bottom-left controls dock and make Oxygen the project face.

  - `theme.css` now sets `--font` to an `"Oxygen", system-ui, …` stack and applies it on the
    `.orbidicom` root, so the whole viewer renders in Oxygen (hosts load the web font; it
    degrades cleanly to the system stack when absent).
  - The dock aligns its host action button and the language field to one full-width, 36px
    rhythm; the language switcher gets a cleaner standard globe, a custom chevron, and a visible
    focus ring; the slice hint gains a small scroll glyph and tidier type.

- Updated dependencies [[`c3b0f9f`](https://github.com/docorbitapp/orbidicom/commit/c3b0f9f84faad92f6b5f645299c73bbffaacd04f), [`c3b0f9f`](https://github.com/docorbitapp/orbidicom/commit/c3b0f9f84faad92f6b5f645299c73bbffaacd04f), [`c3b0f9f`](https://github.com/docorbitapp/orbidicom/commit/c3b0f9f84faad92f6b5f645299c73bbffaacd04f), [`c3b0f9f`](https://github.com/docorbitapp/orbidicom/commit/c3b0f9f84faad92f6b5f645299c73bbffaacd04f), [`eaee06d`](https://github.com/docorbitapp/orbidicom/commit/eaee06d3566c48204b78dd52488a43b8ab3ccb1d)]:
  - @orbidicom/core@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies []:
  - @orbidicom/core@0.3.1

## 0.3.0

### Minor Changes

- Render DICOM Structured Reports (SR). SR series are no longer filtered out — they're
  parsed into a normalized `SrTree` and shown as a readable, indented document. The
  `DataSource` interface gains a generalized report surface (`listReports`,
  `getStructuredReport`, `ReportInstance`, `capabilities.reports`) alongside the
  existing PDF hooks; `DicomWebDataSource` parses the SR Content Sequence already inline
  in WADO-RS metadata (no extra fetch). The new `SrView` renders the tree with escaped
  interpolation (no `v-html`), themed from CSS tokens, with SR error/placeholder i18n in
  all four locales. Core text value types (CONTAINER/TEXT/NUM/CODE/DATE/TIME/PNAME/UIDREF)
  render fully; spatial/image/waveform types show a labeled placeholder for now.

### Patch Changes

- Updated dependencies []:
  - @orbidicom/core@0.3.0

## 0.2.1

### Patch Changes

- Maintenance release. Republishes the encapsulated-PDF support from 0.2.0 (whose release run did not complete publishing); no source changes. CI builds the container image amd64-only (emulated arm64 was prohibitively slow).

- Updated dependencies []:
  - @orbidicom/core@0.2.1

## 0.2.0

### Minor Changes

- Render encapsulated-PDF report series. `DicomWebDataSource` gains `getPdfObjectUrl()` (WADO-RS bulk fetch with multipart unwrap, rebased onto the configured root, honoring cookie/bearer auth), and the `<Viewer>` shows a `PdfView` (lazy-loaded pdf.js) for PDF-only series instead of an empty cell. New `PdfInstance` type and optional `DataSource.listPdfs` / `getPdfObjectUrl` hooks.

### Patch Changes

- Updated dependencies []:
  - @orbidicom/core@0.2.0

## 0.1.0

### Minor Changes

- [`97ae566`](https://github.com/docorbitapp/orbidicom/commit/97ae5662c7dfe547ca2d1449885405da8b1dd154) Thanks [@gasci](https://github.com/gasci)! - Port the viewer UI (Viewer, Toolbar, SeriesRail) onto @orbidicom/core's
  DataSource, de-branded with neutral theme tokens. The demo now renders
  local .dcm files.

### Patch Changes

- Updated dependencies [[`97ae566`](https://github.com/docorbitapp/orbidicom/commit/97ae5662c7dfe547ca2d1449885405da8b1dd154)]:
  - @orbidicom/core@0.1.0
