---
name: create-a-theme
description: Restyle OrbiDICOM using theme tokens (CSS custom properties).
---

# Create a theme

1. Copy the default token set (documented in `packages/vue`) into a `theme` object or a CSS
   custom-property block.
2. Override color/spacing/typography tokens; do not edit component styles directly.
3. Pass the theme to the viewer via app config (see `apps/demo/src/main.ts`).
4. Verify in `make dev`, then changeset + PR.
