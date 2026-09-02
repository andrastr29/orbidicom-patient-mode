---
"@orbidicom/vue": minor
"orbidicom": minor
---

Add a patient-facing mode that hides the staff-only affordances. The `Viewer`
gains two opt-out `features` flags, `addStudy` and `imageDownload` (omitted or
`true` keeps the control, only an explicit `false` hides it): `addStudy` gates the
series rail's "Add study" button, `imageDownload` gates the toolbar's "Download
image as JPG" button. The `orbidicom` CLI adds `--patient`, and the served bundle
reads `features.patient` from `config.js` or `?patient=1` in the URL, which turns
off "Add study", the demo app's "New study" button, and "Download image as JPG"
together for kiosk / patient deployments.
