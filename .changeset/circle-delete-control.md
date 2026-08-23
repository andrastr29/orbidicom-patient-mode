---
"@orbidicom/core": patch
---

Fix the missing delete control on circle and probe annotations. Cornerstone stamps
every annotation with the placeholder `textBox.worldPosition = [0, 0, 0]` and only
`renderLinkedTextBoxAnnotation` replaces it — which `Probe` never calls (it draws
its value straight onto the canvas) and a plain circle never reaches (it runs with
`calculateStats: false`). The overlay anchored on that placeholder, so the "x" was
rendered at the patient-coordinate origin, off-image and unclickable.

The overlay now checks whether the text box was actually placed instead of listing
which tools place one, and falls back to the annotation's last handle point — a
circle's rim, a probe's point.
