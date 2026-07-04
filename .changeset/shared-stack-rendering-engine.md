---
"@orbidicom/core": patch
---

Fix the first grid cell going black (and staying black) when loading series into
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
