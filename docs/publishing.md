# Publishing to npm

OrbiDICOM publishes three public packages from this monorepo:

| Package           | Contents                                   |
| ----------------- | ------------------------------------------ |
| `@orbidicom/core` | Engine (built `dist/`)                     |
| `@orbidicom/vue`  | Vue 3 UI (ships TypeScript source)         |
| `orbidicom`       | CLI, bundles the built viewer in `public/` |

`@orbidicom/demo` and `create-orbidicom` are `private` and are **not** published
(`pnpm -r publish` skips private packages). The CLI ships the demo build itself, so
it has no runtime workspace dependency.

## How releases work

Publishing is automated by [`.github/workflows/release.yml`](../.github/workflows/release.yml),
which runs on a version tag (`v*`) or a manual dispatch. It builds, tests, then runs
`pnpm -r publish`. `workspace:*` dependencies are rewritten to real versions by pnpm.

Auth uses **npm OIDC trusted publishing**; there is no long-lived `NPM_TOKEN`. The
workflow presents a short-lived OIDC token (`id-token: write`) that npm trusts because
of the trusted publisher configured on each package. Provenance is attested
automatically (`NPM_CONFIG_PROVENANCE`).

## One-time setup

1. **Reserve the names.** On npm, create the `@orbidicom` org (for the scoped
   packages) and ensure the unscoped `orbidicom` name is available (it is, as of the
   first release).
2. **Configure a trusted publisher** for each of `@orbidicom/core`, `@orbidicom/vue`,
   and `orbidicom` (npm package → Settings → Trusted Publisher):
   - Publisher: **GitHub Actions**
   - Organization/Repository: **docorbitapp/orbidicom**
   - Workflow filename: **release.yml**
3. **Make the repository public** before the first tagged release. OIDC trusted
   publishing and provenance attestation both require a public repo; a private repo
   will fail at the publish step.

> First publish only: npm trusted publishers normally attach to an existing package.
> For brand-new package names you may need to do the very first publish with a granular
> automation token (then switch to OIDC), or create the trusted publisher at the org
> level; see npm's "trusted publishing for new packages" docs.

## Cutting a release

Versions live in each package's `package.json` (all start at `0.1.0`).

```bash
# bump the version in packages/{core,vue,cli}/package.json, then:
git commit -am "release: v0.1.0"
git tag v0.1.0
git push origin main --tags     # the tag triggers release.yml
```

The same `v*` tag also triggers the container image build
([docker-publish.yml](../.github/workflows/docker-publish.yml)).

To publish from a workstation instead (requires `npm login` with publish rights):

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm -r publish --access public
```
