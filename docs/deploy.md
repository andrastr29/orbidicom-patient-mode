# Deploying OrbiDICOM

OrbiDICOM ships a container image and a Helm chart, so you can run the viewer on
Kubernetes in one command. The same image works **local-file-only** or
**connected to a PACS**: the PACS endpoint is configured at container start, no
rebuild needed.

## TL;DR

```bash
# 1. Build & push the image (or use the published ghcr.io image)
docker build -t ghcr.io/docorbitapp/orbidicom:latest .
docker push ghcr.io/docorbitapp/orbidicom:latest

# 2. Install the chart, pointed at your in-cluster DICOMweb server
helm install orbidicom ./helm/orbidicom \
  --set pacs.proxy.upstream=http://orthanc.pacs.svc.cluster.local:8042/dicom-web

# 3. Try it
kubectl port-forward svc/orbidicom 8080:80
# open http://localhost:8080
```

## Try PACS mode locally

[`examples/docker-compose.yaml`](../examples/docker-compose.yaml) brings up a
throwaway Orthanc PACS (with the DICOMweb plugin) plus the viewer, already wired:

```bash
docker compose -f examples/docker-compose.yaml up --build
# Viewer  → http://localhost:8080   Orthanc → http://localhost:8042
```

Upload a study to Orthanc, then open it in the viewer by its Study Instance UID.
See [`examples/README.md`](../examples/README.md).

## The image

A multi-stage build (`Dockerfile`) compiles `@orbidicom/core`, bundles the SPA
with Vite, and serves the static output on **unprivileged nginx** (listens on
`8080`, runs as uid `101`, no root).

```bash
docker build -t orbidicom:dev .
# Local-file viewer (no PACS):
docker run --rm -p 8080:8080 orbidicom:dev
# PACS-connected via same-origin reverse proxy:
docker run --rm -p 8080:8080 \
  -e ORBIDICOM_PACS_URL=/dicom-web \
  -e ORBIDICOM_PACS_UPSTREAM=http://orthanc:8042/dicom-web \
  orbidicom:dev
```

### Runtime environment variables

| Variable                  | Purpose                                                                                                                         | Example                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `ORBIDICOM_PACS_URL`      | DICOMweb base the **browser** calls. `/dicom-web` pairs with the reverse proxy (same-origin, no CORS). Empty = local-file-only. | `/dicom-web`                    |
| `ORBIDICOM_PACS_UPSTREAM` | If set, nginx reverse-proxies `/dicom-web/` → this in-cluster DICOMweb server.                                                  | `http://orthanc:8042/dicom-web` |
| `ORBIDICOM_STUDY_UID`     | Optional Study Instance UID to auto-open on load.                                                                               | `1.2.840…`                      |

A startup script regenerates `config.js` (read by the SPA as
`window.__ORBIDICOM_CONFIG__`) and the optional proxy snippet from these
variables before nginx starts.

## PACS connectivity: two modes

**Same-origin reverse proxy (recommended, the default).** The browser calls the
viewer's own origin at `/dicom-web`; nginx forwards to your DICOMweb server. The
PACS never needs CORS headers and can stay private inside the cluster.

```text
Browser ──/dicom-web──> nginx (viewer pod) ──proxy──> Orthanc/dcm4chee (ClusterIP)
```

**Direct browser → PACS.** Set `pacs.proxy.enabled=false` and
`pacs.url=https://pacs.example.com/dicom-web`. The browser talks to the PACS
directly, so **that server must send CORS headers** for the viewer's origin.

## Helm chart

The chart lives in [`helm/orbidicom`](../helm/orbidicom). Common installs:

```bash
# PACS via reverse proxy (default), behind an ingress with TLS
helm install orbidicom ./helm/orbidicom \
  --set pacs.proxy.upstream=http://orthanc.pacs.svc:8042/dicom-web \
  --set ingress.enabled=true \
  --set ingress.className=nginx \
  --set ingress.hosts[0].host=orbidicom.example.com \
  --set ingress.hosts[0].paths[0].path=/ \
  --set ingress.hosts[0].paths[0].pathType=Prefix \
  --set ingress.tls[0].secretName=orbidicom-tls \
  --set ingress.tls[0].hosts[0]=orbidicom.example.com

# Local-file viewer only (no PACS UI)
helm install orbidicom ./helm/orbidicom --set pacs.url="" --set pacs.proxy.enabled=false

# Auto-open one study
helm install orbidicom ./helm/orbidicom \
  --set pacs.proxy.upstream=http://orthanc:8042/dicom-web \
  --set pacs.studyUid=1.2.840.113619.2.1...
```

### Key values

| Value                            | Default                                              | Notes                                                |
| -------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `image.repository` / `image.tag` | `ghcr.io/docorbitapp/orbidicom` / chart `appVersion` |                                                      |
| `replicaCount`                   | `2`                                                  | Ignored when `autoscaling.enabled`.                  |
| `pacs.url`                       | `/dicom-web`                                         | Browser-facing DICOMweb base.                        |
| `pacs.proxy.enabled`             | `true`                                               | Reverse-proxy `/dicom-web` to `pacs.proxy.upstream`. |
| `pacs.proxy.upstream`            | `http://orthanc:8042/dicom-web`                      | In-cluster DICOMweb endpoint.                        |
| `pacs.studyUid`                  | `""`                                                 | Optional auto-open study.                            |
| `ingress.enabled`                | `false`                                              | Standard ingress with `className`, `hosts`, `tls`.   |
| `autoscaling.enabled`            | `false`                                              | CPU HPA (`minReplicas`/`maxReplicas`/target).        |
| `resources`                      | 50m / 64Mi requests                                  | nginx serving static assets is light.                |

See [`helm/orbidicom/values.yaml`](../helm/orbidicom/values.yaml) for the full,
commented list.

## Publishing the image (CI)

`.github/workflows/docker-publish.yml` builds a multi-arch (amd64/arm64) image
and pushes it to `ghcr.io/<owner>/orbidicom` on version tags (`vX.Y.Z`). Pull
requests build the image without pushing, keeping the Dockerfile verified.

```bash
git tag v0.1.0 && git push origin v0.1.0   # → ghcr.io/docorbitapp/orbidicom:0.1.0
```

## Notes & hardening

- The container runs as a non-root user with `ALL` capabilities dropped and a
  `RuntimeDefault` seccomp profile. `readOnlyRootFilesystem` is left `false`
  because the entrypoint regenerates `config.js` and nginx uses its temp dirs.
- Build assets are hash-named and served `immutable`; `index.html` and
  `config.js` are sent `no-cache` so deploys and config changes take effect at
  once.
- Cornerstone's WASM codecs work **without** `SharedArrayBuffer`, so no
  cross-origin-isolation (COOP/COEP) headers are required.
- DICOM data dropped locally never leaves the browser; in PACS mode, traffic
  flows browser → viewer pod → PACS.
