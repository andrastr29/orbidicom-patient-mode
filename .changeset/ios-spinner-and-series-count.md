---
"@orbidicom/core": patch
"@orbidicom/vue": patch
---

Fix two series-rail preview bugs:

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
