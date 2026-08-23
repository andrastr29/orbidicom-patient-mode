# Roadmap

## Status at a glance (v0.8.0)

All of **Tier 1** (clinical table-stakes) and most of **Tier 2** (differentiators)
have shipped, including annotation undo/redo, key-image flagging, DICOM-SR Part-10
encoding + STOW-RS upload, and read-only DICOM-SEG labelmap rendering (2D stack). The
remaining gap is the `npm create orbidicom` scaffolder (stub today). Details
per item below.

## Now (v1.x): a clean, embeddable 2D viewer

- 2D stack viewer with the full tool set (W/L + presets, zoom/pan/rotate/flip/invert,
  length/angle/bidirectional/ROIs/probe, cine, grids, series rail)
- `DataSource` interface + DICOMweb / local-files / NIfTI / DICOM-JSON adapters; pluggable auth
- Theming, i18n, and `npx orbidicom`: _shipped_. A `npm create orbidicom` scaffolder
  is _planned_ (a stub today)

## Next

Sequenced against OHIF's feature breadth, but scoped to keep OrbiDICOM thin, embeddable,
and offline-capable. Tier 1 closes the highest-value clinical gaps; Tier 2 holds the
differentiators.

### Tier 1: clinical table-stakes (in progress)

- [x] **W/L preset engine + hotkeys**: modality-aware, host-extensible preset engine
      (`core/src/presets.ts`) + a framework-agnostic keymap (`core/src/hotkeys.ts`) wired
      into the viewer, with shortcuts shown in the toolbar tooltips. _Shipped._
- [x] **Download slice as JPEG**: `StackHandle.captureSliceJpeg` composites the rendered
      image with the annotation SVG overlay (no patient overlay text); toolbar button +
      `<series>_<slice>.jpg`. _Shipped._
- [x] **MPR + 3D volume rendering**: `createMprView` builds a volume and shows it in an
      OHIF-style 2×2 hanging protocol: three orthographic planes (axial / coronal / sagittal)
      plus a 3D volume-rendering (VR) pane with selectable transfer-function presets
      (CT-Bone, CT-Soft-Tissue, CT-Lung, MR-Default, MIP, …) and trackball rotation, gated to
      volume-capable series. The stack grid stays mounted (hidden) underneath. _Shipped
      (rendering/crosshair/VR sync needs real-browser QA)._
- [x] **Crosshairs**: `CrosshairsTool` links the three MPR planes. _Shipped._ (Standalone
      reference lines for the stack grid remain a follow-up.)
- [x] **Measurement export**: `collectMeasurements` + JSON/CSV export of Length/Angle/ROI/
      Probe from the toolbar. _Shipped._ **DICOM-SR generation** now ships too:
      `buildMeasurementSr` (`core/src/sr/to-json.ts`) turns the measurements into a Comprehensive
      SR (TID-1500-flavored, DICOM-JSON) that round-trips through the SR reader. _Part-10
      encoding (`dicomJsonToPart10`, a dependency-free Explicit-VR-LE writer) + STOW-RS upload
      now ship too, via a capability-gated "Upload SR" button._

### Tier 2: differentiators that fit the thin + pluggable identity

- [x] **Plugin SDK**: `registerPlugin({ tools, windowPresets, dataSources })` fans contributions
      out to the core registries; plus a data-source factory registry (`registerDataSource` /
      `createDataSource`) with the built-in adapters pre-registered. _Shipped (tool/preset/
      data-source contributions; Vue panels + locales remain a follow-up)._
- [x] **Hanging protocols (lightweight)**: `applyHangingProtocol` maps a study's series onto the
      grid (built-ins: `single`, `grid`; custom functions supported); the `<Viewer>`
      `hanging-protocol` prop applies one on load. _Shipped._
- [x] **DICOM-SEG display**: read-only labelmap rendering (2D stack). _Parsing shipped
      (`core/src/seg/parse.ts`): SOP-class detection, segment definitions (labels, property
      codes, Recommended-Display-CIELab → sRGB colors), per-frame → segment/source-image
      mapping, BINARY bitstream decode, labelmap assembly. **Rendering now shipped too**:
      `DataSource.getSegmentation` fetches + decodes a SEG into per-image labelmaps
      (`DicomWebDataSource` via WADO-RS bulkdata), `seg/align.ts` maps them to the stack, and
      `cornerstone/seg.ts` draws them as a Cornerstone stack labelmap (`StackHandle.show/hide
Segmentation`) with per-segment colors; a "Segmentations" sidebar toggles each on/off._
- [x] **More data sources**: STOW-RS upload (`DicomWebDataSource.storeInstances`, multipart/
      related) and an in-memory **DICOM-JSON** `DataSource` shipped; both additive, no UI
      branching.
- [x] **Study list / worklist**: QIDO-RS `searchStudies` (`StudyQuery` → `StudySummary[]`) on
      the `DataSource` contract (DICOMweb), plus a `<StudyList>` Vue component: a patient/ID/
      accession/modality filter form → results table that emits `open(studyInstanceUID)`. RTL-aware,
      capability-gated. _Shipped._

### Quick wins (anytime)

- Key-image flagging, annotation undo/redo.
- [x] **20 UI languages + searchable switcher**: en · tr · de · es · fr · it · pt · ru ·
      zh · ja · ko · hi · id · nl · pl · ar · fa · bn · vi · uk, with a filterable language
      picker. The right-to-left locales (Arabic, Persian) mirror the viewer via a `dir`
      attribute (`isRtl` / `dir` in `vue/src/i18n.ts`); the picker opens toward available
      space so it's never clipped on mobile. _Shipped._ (Hebrew / Urdu are easy follow-ons.)
- [x] **3D VR / MIP with transfer-function presets**: shipped as part of MPR + 3D above.

## In scope

Web-based DICOM viewing, standard DICOMweb/PACS connectivity, extensibility (tools, themes,
data sources, locales), embeddability.

## Out of scope (for now)

A full PACS server, DICOM storage/routing, non-web/native viewers, modality-specific clinical
workflows. Propose anything here as a `proposal` issue and we'll discuss.
