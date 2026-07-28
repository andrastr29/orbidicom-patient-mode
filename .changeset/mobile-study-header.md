---
"@orbidicom/vue": patch
---

Tidy the study group header in the mobile series rail.

On narrow viewports the header was an 84px tile — wider than the 76px series
tile it introduces — with its title, count and close button pushed to three
different edges of a mostly empty box. It is now a 56px gutter: one centred
block holding the chevron, the study label and the series count, recessed a
step darker than the rail so it reads as a divider between studies rather than
a card. The label wraps instead of truncating ("HRCT THORAX" no longer becomes
"HRCT T…"), the close button moves out of the flow into the corner with a
larger touch target, and a collapsed prior study dims and hides its close
button so the study being read stays dominant. Desktop is unchanged.
