---
"@orbidicom/core": minor
"@orbidicom/vue": minor
"orbidicom": minor
---

Add the **AI & Results** right-dock panel (`AiResultsPanel`) to the Vue viewer, gated by the `features.aiResults` deployment toggle. It imports an `AIResultSet` (JSON), lists results grouped by kind (segmentations / measurements / findings) with accept / reject / visibility toggles, applies the accepted + visible results to the active cell (measurements as Cornerstone annotations, segmentations as labelmap overlays), and exports the accepted set as JSON / CSV / ai-json. A toolbar button opens the panel when the feature is enabled; the demo passes `features` through from its runtime config. Core's `readImageMetadata` / `ImageMetadata` now also expose `sopInstanceUID`, used to align imported SEG labelmaps to the active stack's slices. The panel is responsive (stacks full-width below the viewport on phones, with larger touch targets) and honours custom themes via the standard CSS variables.
