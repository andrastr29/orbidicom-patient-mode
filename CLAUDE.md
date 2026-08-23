# CLAUDE.md: OrbiDICOM

An extensible, Vue 3 + Cornerstone3D DICOM viewer that plugs into any PACS and runs offline
on local files.

## Layout

- `packages/core`: framework-agnostic TS engine. Owns the `DataSource` interface
  (`src/datasource.ts`), auth strategies (`src/auth.ts`), and the tool/preset registry
  (`src/registry.ts`). **No Vue, no DOM-framework code, no hardcoded endpoints or branding.**
- `packages/vue`: Vue 3 UI. Renders from the registry; consumes a `DataSource`.
- `packages/cli`: the `orbidicom` CLI. `serve` (what `npx orbidicom` runs), `init`/`create`,
  `ai`, `generate`.
- `apps/demo`: runnable reference viewer.

## Conventions

- TypeScript strict, ESM only. 2-space indent, Prettier-formatted.
- Tests live in each package's `test/` as `*.spec.ts`, run by root Vitest.
- Every published-package change needs a changeset (`pnpm changeset`).
- **Never reintroduce DocOrbit specifics**: endpoints, tokens, brand colors, product copy.

## Common commands

- `make dev`: run the demo with hot reload
- `make test` / `make lint` / `make build`
- `pnpm --filter @orbidicom/core test`

## Where do I add…?

- **A tool** → `.claude/skills/add-a-tool` (register in core's tool registry + a toolbar entry)
- **A PACS backend** → `.claude/skills/add-a-data-source` (implement `DataSource`)
- **A theme** → `.claude/skills/create-a-theme`
- **A language** → `.claude/skills/add-a-locale`
- **A new app from the template** → `.claude/skills/scaffold-an-app`

## The DataSource contract

See `packages/core/src/datasource.ts`. A backend implements `getSeries`, `getImageIds`,
optional `getMetadata`/`downloadArchive`, and advertises `capabilities`. The UI never branches
on backend type: add a backend by adding an adapter, not by editing the UI.
