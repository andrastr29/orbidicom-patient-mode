---
"@orbidicom/vue": patch
---

Remove the hover tooltip from the mobile header hamburger (menu) button. The
`v-tip` chip could surface over the toolbar and block content on some devices;
the button now carries a plain `aria-label` instead, so it keeps its accessible
name for screen readers but no longer renders a tooltip.
