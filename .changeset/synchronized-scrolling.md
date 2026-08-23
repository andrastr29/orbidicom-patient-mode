---
"@orbidicom/core": minor
"@orbidicom/vue": minor
---

Add synchronized scrolling across grid cells: scroll one viewport and the other
coplanar ones follow to the same anatomical level. The sync is position-based
(`imagePositionPatient`), not index-based, so two series with different slice
counts or spacing — T1 and T2 side by side — stay aligned instead of drifting.
Series with no shared frame of reference are spatially registered on the fly.

Off by default, toggled from the toolbar, and offered only when a multi-cell grid
is on screen. `createScrollSync` in core owns the synchronizer's lifetime and
membership; `StackHandle.getViewportId()` and `STACK_ENGINE_ID` are now exported
so a viewport can be addressed in engine-level APIs.
