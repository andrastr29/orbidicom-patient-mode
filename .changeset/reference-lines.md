---
"@orbidicom/core": minor
"@orbidicom/vue": minor
---

Add reference lines: while you scroll the focused grid cell, the other cells draw
a line showing where that slice cuts through them: scroll an axial series on the
left and the coronal on the right marks the level. Toggled from the toolbar and
off by default, because the line is genuinely in the way on some studies.

Nothing is drawn for parallel planes (axial ↔ axial has no meaningful
intersection) or across viewports that share no frame of reference.

`createStack` now takes an options argument with `toolGroupId`, and the offscreen
thumbnailer passes `null`: a viewport in the shared tool group is a target for
display-only tools, so reference lines would otherwise be composited into the
thumbnail JPEGs.
