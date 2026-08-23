---
"@orbidicom/vue": minor
---

Surface MPR / 3D as its own toolbar button. The reconstruction (three linked
orthographic planes plus a volume-rendering pane) already existed, but only as an
entry inside the grid-layout dropdown, where nobody found it. The button toggles:
into MPR, and back out to whichever grid was showing, including the stacked 2×1
variant. It is disabled, with an explanatory tooltip, for series that cannot be
reconstructed. The dropdown entry stays.
