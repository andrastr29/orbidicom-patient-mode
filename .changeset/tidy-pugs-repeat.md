---
"@orbidicom/vue": patch
---

Add an About row showing the running viewer version. It lives in the controls
dock, so it renders at the bottom of the left rail on desktop and inside the
hamburger dropdown on phones. The version is read from the package's own
`package.json` (also exported as `VERSION`), so a release bump can't drift from
what the UI reports.
