---
name: add-a-data-source
description: Connect a new PACS or backend by implementing the DataSource interface.
---

# Add a data source

1. Read the `DataSource` interface in `packages/core/src/datasource.ts`.
2. Create `packages/core/src/sources/<name>.ts` exporting a class implementing `getSeries`,
   `getImageIds`, optional `getMetadata`/`downloadArchive`, and a `capabilities` object.
3. Reuse an `AuthStrategy` from `src/auth.ts` for request auth; don't hardcode credentials.
4. Export it from `packages/core/src/index.ts`.
5. Add a test that the adapter satisfies the `DataSource` contract against fixture responses.
6. `make test && make lint`, changeset, PR. Add an entry under `examples/` if it's a common backend.
