---
"@orbidicom/core": minor
"@orbidicom/vue": minor
---

Group the series rail by study when more than one study is open.

- `SeriesSummary` carries optional study-level facts (`study.studyDate`,
  `studyDescription`, `patientName`, `patientId`), filled by the DICOMweb,
  DICOM-JSON and local-file sources from data they already parse.
- `LocalDataSource` now groups dropped files by `StudyInstanceUID` instead of
  merging everything into one synthetic study, and advertises
  `multiStudy: true` — so a folder or archive holding a current exam and its
  prior opens as two study groups offline, with no PACS. Files carrying no
  `StudyInstanceUID` still fall back to the synthetic `"local"` study, and a
  single-study drop is unchanged.
- Series are returned newest-study-first with each study's series contiguous,
  instead of interleaving series numbers across studies.
- The rail renders collapsible per-study sections with per-study ordinals; a
  single study is unchanged. Patient name is shown whenever open studies span
  more than one patient.
- Studies can be added and closed mid-session. Adding preserves annotations, key
  images and layout; closing purges that study's work behind a confirmation.
- `Viewer` honors `studyUids` reactively and emits `update:studyUids`.
- **Breaking for custom data-source integrations:** `ThumbnailProvider` gains a
  required `release(seriesUids)` method. Built-in providers are updated; any
  external implementation of the interface must add it.
