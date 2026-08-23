---
"@orbidicom/core": minor
"@orbidicom/vue": minor
---

Add a plain circle annotation tool (`C`). It draws a circle and nothing else: no
area, no mean, no text box, for pointing at a finding without cluttering the
image. The measuring ROIs (ellipse, rectangle) are unchanged.

Internally, the tool-name sets that measurement export, undo/redo and the delete
overlay each kept privately are now declared once in `cornerstone/tool-names.ts`
(`MEASUREMENT_TOOLS`, `SHAPE_TOOLS`, `ANNOTATION_TOOLS`). Circles are undoable and
deletable like any drawing, and deliberately excluded from measurement export.
