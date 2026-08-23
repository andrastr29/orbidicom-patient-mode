# Contributing to OrbiDICOM

Thanks for helping build an open DICOM viewer! We aim for a **fast, friendly first
contribution**.

## Run it locally (no PACS needed)

```bash
git clone https://github.com/orbidicom/orbidicom
cd orbidicom
make setup     # pnpm install
make dev       # demo viewer with hot reload; drag in .dcm files (local mode)
```

## Before you open a PR

```bash
make test      # unit tests
make lint      # eslint + prettier
make build     # type-check + build packages
```

CI runs these on every PR and is usually green in a few minutes.

## Where things live

- `packages/core`: engine, `DataSource` interface + adapters, auth, tool/preset registry (pure TS)
- `packages/vue`: Vue 3 UI
- `packages/cli`: the `orbidicom` CLI
- `apps/demo`: the reference viewer

See [CLAUDE.md](./CLAUDE.md) for an architecture map and "where do I add X?" recipes,
and [SKILLS.md](./SKILLS.md) for guided recipes (also usable by coding agents).

## Good first issues

Look for the `good first issue` and `help wanted` labels. Comment to claim one.

## Changesets

Run `pnpm changeset` and describe your change; releases and the changelog are generated
from these and **credit you by name**.

## Conduct

By participating you agree to our [Code of Conduct](./CODE_OF_CONDUCT.md).
