---
"@orbidicom/vue": patch
---

Tidy the study group header in the mobile series rail.

On narrow viewports the header was a 84px tile — wider than the 76px series
tile it introduces — with its title, count and close button pushed to three
different edges. It is now a 68px two-zone grid: the study label spans the top
and wraps to a second line instead of truncating, while the series count (now a
small badge) and the close button share the bottom row. Close and chevron get
larger touch targets, and a collapsed prior study dims and hides its close
button so the study being read stays visually dominant. Desktop is unchanged.
