---
"@orbidicom/core": minor
---

The probe now labels its point with the measured value alone. Cornerstone's default
prints the voxel index `(i, j, k)` on the first line and the value underneath; the
index is a developer's coordinate, not a reading, and it crowded the image next to
the number the probe exists to show. Measurement export never read it, so JSON, CSV
and DICOM-SR output are unchanged.

The label is also steadier than the stock one, which rendered nothing at all when
the index was missing. `probeTextLines` is exported so a host can wrap or replace it.
