---
"@orbidicom/core": minor
"@orbidicom/vue": minor
---

Series rail now shows a preview thumbnail for each series, on desktop and mobile.

- `@orbidicom/core`: new `createThumbnailProvider` (LRU-cached, single-flight,
  concurrency-limited) and an offscreen `createThumbnailer`; an optional
  `DataSource.getThumbnail` fast path, implemented for DICOMweb via the WADO-RS
  thumbnail endpoint. Backends without it fall back to a client-side render, so
  offline and local-file previews keep working.
- `@orbidicom/vue`: `SeriesRail` renders a leading preview (compact list on
  desktop, thumbnail-over-caption tile strip on mobile) with skeleton and glyph
  states, loading lazily via `IntersectionObserver`.
