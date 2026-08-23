# DICOM-SEG labelmap rendering: browser QA checklist

The SEG data path (fetch + decode) and the render orchestration are unit-tested,
but the actual WebGL labelmap draw can only be verified against a real PACS in a
browser. Please verify the following before treating SEG rendering as shipped.

## Setup

- A DICOMweb source (`DicomWebDataSource`) whose `capabilities.segmentations` is
  true (it is, by default) pointed at a PACS that holds a **BINARY** DICOM-SEG plus
  the series it references.
- Run the demo: `make dev`, open a study that includes the SEG's referenced series.

## Steps & expected results

1. **Discovery**: load the referenced series. A **Segmentations** section appears
   in the left sidebar listing the SEG(s) by label. (If absent: the SEG wasn't
   discovered, check `getImageIds` routed it out and `listSegmentations` returns it.)
2. **Toggle on**: tick a segmentation. Expected: its labelmap paints over the
   matching slices in the active cell, in each segment's Recommended Display color.
   Scroll through slices; the overlay follows the correct source images.
3. **Toggle off**: untick it. The overlay disappears; the underlying image is intact.
4. **Multi-segment**: a SEG with >1 segment shows each segment in its own color.
5. **No-match**: a SEG whose source images aren't in the loaded stack toggles to a
   no-op (no overlay, no error). The checkbox returns to unchecked.

## Things most likely to need adjustment (API-fuzzy spots)

These were written against the installed `@cornerstonejs/*@5.0.13` type defs and
compile cleanly, but the runtime shapes are best confirmed live:

- **Pixel write** in `packages/core/src/cornerstone/seg.ts`, populating the derived
  labelmap image's buffer (`voxelManager.getScalarData()` vs `getPixelData()`). If
  the overlay renders blank, this is the first place to check.
- **Color application**: `segmentation.config.color.setSegmentIndexColor(...)`.
  If colors are wrong/ignored, confirm this path on the running build.
- **Representation add**: `addLabelmapRepresentationToViewport` may need a render
  nudge; `StackHandle.showSegmentation` calls `vp.render()` after, which should suffice.

## Out of scope (future)

- MPR/volume labelmap rendering (this pass is 2D stack only).
- Brush / threshold editing (read-only display only).
