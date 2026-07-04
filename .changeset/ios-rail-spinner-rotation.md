---
"@orbidicom/vue": patch
---

Fix the series-rail thumbnail spinner appearing frozen (not rotating) on
iOS/WebKit. The spinner's parent `.rail__thumb` has `overflow: hidden` +
`border-radius`, and iOS Safari fails to repaint a rotating child under a
rounded clip — the ring rendered but sat static. The spinner is now promoted to
its own compositor layer with `will-change: transform`, which restores the
rotation. Also removes the `prefers-reduced-motion` guard so the rail spinner
matches the always-animating viewport spinner. (Follow-up to the 0.11.3 fix,
which only restored the spinner's _visibility_.)
