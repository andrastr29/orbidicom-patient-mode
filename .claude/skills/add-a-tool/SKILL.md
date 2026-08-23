---
name: add-a-tool
description: Add a new Cornerstone tool to OrbiDICOM and surface it in the toolbar.
---

# Add a tool

1. In `packages/core/src/registry.ts`, call `registerTool({ tool, name, binding, icon, label })`
   with the Cornerstone tool class. `binding` is `"primary"` for left-click-selectable tools.
2. If it's a windowing preset, use `registerWindowPreset({ modality, name, window, level })` instead.
3. The Vue toolbar renders from the registry automatically, so no UI edits are needed for a primary tool.
4. Add a test in `packages/core/test/` asserting the tool appears in `listTools()`.
5. `make test && make lint`, then `pnpm changeset` and open a PR.
