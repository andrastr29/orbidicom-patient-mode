---
"@orbidicom/core": patch
---

Fix the missing delete control on plain circle annotations. Cornerstone seeds every
annotation's `textBox.worldPosition` with the placeholder `[0, 0, 0]` and only
replaces it when a tool actually draws its label — which a circle, running with
`calculateStats: false`, never does. The overlay anchored on that placeholder, so
the "x" was rendered at the patient-coordinate origin, off-image and out of reach.
Text-box-less shape tools now anchor on their rim handle instead.
