---
name: bump-version
description: Set @orbidicom/core, @orbidicom/vue, and the orbidicom CLI to the same version, in lockstep.
---

# Bump version (core + vue + cli, in lockstep)

The three published packages ship as one unit and **must share a version**:

- `@orbidicom/core` (`packages/core`)
- `@orbidicom/vue` (`packages/vue`)
- `orbidicom` (`packages/cli`): the "main" package `npx orbidicom` runs; it bundles
  the demo, which uses core + vue, so it must never lag them.

Releases already enforce this via the changesets `fixed` group in
`.changeset/config.json`. Use this skill for a **direct/manual** bump, aligning
versions or cutting a specific version outside the changeset flow.

1. Pick the target version `X.Y.Z`. Always use an **explicit** version so all three
   land identical (a `patch`/`minor`/`major` bump only stays in lockstep if they're
   already equal).
2. Set all three at once:
   ```bash
   pnpm --filter @orbidicom/core --filter @orbidicom/vue --filter orbidicom \
     exec npm version X.Y.Z --no-git-tag-version --allow-same-version
   ```
3. Verify they match (must print the same version three times):
   ```bash
   node -p "['core','vue','cli'].map(d=>require('./packages/'+d+'/package.json').version)"
   ```
4. `make build && make test`: the CLI bundles the demo (which imports core + vue), so
   confirm the bundled build still works.
5. Add a changeset (`pnpm changeset`) describing the change, unless this bump _is_ the
   `changeset version` step. Then open a PR.

Note: the private `@orbidicom/demo` app stays at `0.0.0`. If you cut a user-facing
release, also bump `appVersion` in `helm/orbidicom/Chart.yaml` to match `X.Y.Z`.

## Releasing to npm

**You do not run `npm publish`.** Publishing is done by the `Publish to npm` GitHub
Action (`.github/workflows/release.yml`), which triggers on a pushed `v*` tag and
publishes all three packages via npm OIDC trusted publishing.

Preferred (when there are pending changesets, which carry the changelog):

```bash
pnpm exec changeset version   # consumes .changeset/*.md → sets all three to the
                              # next version (fixed group) + writes CHANGELOGs
# verify all three match (step 3 above), then build + test (step 4)
git commit -am "release: vX.Y.Z"
git tag vX.Y.Z
git push --follow-tags        # tag push → GitHub Action publishes to npm
```

If there are no changesets, set the version manually (steps 1–2) before tagging.

Prerequisite: each published package, including `orbidicom` (the CLI), needs its own
npm **trusted-publisher** entry for this workflow, or its publish step fails `ENEEDAUTH`.
After pushing the tag, watch the Action run to confirm all three published.
