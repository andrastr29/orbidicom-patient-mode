# orbidicom

The CLI for **OrbiDICOM** — a modern, mobile-responsive, multilingual, open-source DICOM
viewer (Vue 3 + Cornerstone3D). One command serves the viewer in your browser: locally on
`.dcm`/`.nii` files, or against any DICOMweb PACS.

Source and issues: <https://github.com/docorbitapp/orbidicom>

## Quick start

```bash
npx orbidicom
```

Opens the viewer in your browser in **local mode** — drag in `.dcm` files (or a study
folder / zip), no server required. Images, encapsulated-PDF reports, and DICOM Structured
Reports (SR) all render.

### Connect to a PACS

```bash
npx orbidicom --pacs https://your-host/dicom-web --study 1.2.840.113619…
```

`--pacs` / `--study` can also be passed at runtime via the URL
(`…/?pacs=/dicom-web&study=1.2.840…`), so one served build can open any study without a
rebuild.

### Authentication

```bash
npx orbidicom --pacs https://host/dicom-web --auth bearer --token "$TOKEN"
npx orbidicom --pacs https://host/dicom-web --auth basic --username u --password p
npx orbidicom --pacs https://host/dicom-web --auth cookie    # cross-origin session cookie
```

The default is same-origin (no `Authorization` header; same-origin cookies are still
sent). **Security:** `basic`/`bearer` credentials are embedded in the served config and
visible to the browser — only use them on trusted/internal deployments; prefer `cookie`
or a reverse proxy that injects auth server-side.

## Options

| Flag                        | Description                                          |
| --------------------------- | ---------------------------------------------------- |
| `--pacs <url>`              | DICOMweb base URL (`/dicom-web` or `https://host/…`) |
| `--study <uid>`             | Study Instance UID to auto-open on load              |
| `--auth <kind>`             | `none` (default) · `cookie` · `bearer` · `basic`     |
| `--token <t>`               | Bearer token (with `--auth bearer`)                  |
| `--username` / `--password` | Basic-auth credentials (with `--auth basic`)         |
| `--port <n>`                | Port to serve on (default `4173`)                    |
| `--open` / `--no-open`      | Open (default) / don't open the browser              |

## Recipes

```bash
# Open a specific study on a custom port, without auto-launching a browser:
npx orbidicom --pacs https://host/dicom-web --study 1.2.840… --port 8080 --no-open

# Local-only review station — drag .dcm / .nii files in, nothing leaves the machine:
npx orbidicom

# Same-origin proxy: point --pacs at a relative path your own server proxies to the PACS
# (keeps the PACS in-cluster, no CORS, no credentials in the browser):
npx orbidicom --pacs /dicom-web
```

Because `--pacs` / `--study` are also read from the URL
(`…/?pacs=/dicom-web&study=1.2.840…`), one running instance (or the container
image) can open any study — handy for embedding the viewer in an `<iframe>` or
linking to it from a worklist without rebuilding.

## Features & roadmap

✅ shipped · ⬜ planned. Tiers and detail in [ROADMAP.md](https://github.com/docorbitapp/orbidicom/blob/main/ROADMAP.md).

| Status | Capability                                                                                                                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | **2D viewing** — window/level, zoom, pan, slice scroll, rotate, flip, invert                                                             |
| ✅     | **Cine** playback — per cell, adjustable fps                                                                                             |
| ✅     | **Measurement tools** — length, angle, rectangle & ellipse ROI, probe                                                                    |
| ✅     | **Keyboard shortcuts** — tools, transforms, slice nav, W/L presets (remappable)                                                          |
| ✅     | **W/L preset engine** — CT built-ins + modality-aware, host-extensible                                                                   |
| ✅     | **Grid layouts** — 1–10-up, each cell independent                                                                                        |
| ✅     | **Download slice as JPEG** — image + measurements (no patient text)                                                                      |
| ✅     | **Reports** — encapsulated PDF + DICOM Structured Report (SR)                                                                            |
| ✅     | **Metadata** — on-image overlay with privacy blur + full DICOM tag reader                                                                |
| ✅     | **Data sources** — DICOMweb (Orthanc, dcm4chee, Google Healthcare, proxy), local files, NIfTI, DICOM-JSON                                |
| ✅     | **Auth** — none / basic / bearer / cookie                                                                                                |
| ✅     | **Study ZIP download** (DICOMweb)                                                                                                        |
| ✅     | **20 UI languages** (incl. RTL: Arabic, Persian) + searchable switcher + theming                                                         |
| ✅     | **Runs anywhere** — offline, `npx orbidicom`, Kubernetes/Helm                                                                            |
| ✅     | **MPR + 3D volume rendering (VR)** — tri-planar + crosshairs + VR presets                                                                |
| ✅     | **Measurement export** — JSON + CSV                                                                                                      |
| ✅     | **STOW-RS upload** — `storeInstances` (multipart/related)                                                                                |
| ✅     | **DICOM-SR export** — measurement SR + Part-10 encoding & STOW-RS upload (`buildMeasurementSr` → `dicomJsonToPart10` → `storeInstances`) |
| ✅     | **DICOM-SEG** — read-only labelmap rendering (2D stack)                                                                                  |
| ✅     | **Hanging protocols** — `single` / `grid` built-ins + custom                                                                             |
| ✅     | **Study list / worklist** — QIDO-RS `searchStudies` + a `<StudyList>` filter/results component                                           |
| ✅     | **Plugin SDK** — `registerPlugin` + data-source factory registry                                                                         |
| ⬜     | **AI assist** — `orbidicom ai` — _Tier 3_                                                                                                |

## Embed or deploy

- **In your own app:** `npm i @orbidicom/vue @orbidicom/core vue` and render `<Viewer>`.
- **Kubernetes:** a container image and a Helm chart ship with the project (same-origin
  DICOMweb proxy, ingress/TLS, autoscaling, non-root hardening).

## Supported languages

The viewer ships with **20 languages** and a built-in **searchable** live switcher: English,
Türkçe, Deutsch, Español, Français, Italiano, Português, Русский, 中文, 日本語, 한국어, हिन्दी,
Bahasa Indonesia, Nederlands, Polski, العربية, فارسی, বাংলা, Tiếng Việt, Українська — the
right-to-left languages (Arabic, Persian) mirror the layout. Adding more is a small string table — see the
[add-a-locale guide](https://github.com/docorbitapp/orbidicom/tree/main/.claude/skills/add-a-locale).

Project, docs, and source: <https://github.com/docorbitapp/orbidicom>

## License

MIT © OrbiDICOM contributors.

"OrbiDICOM" and its logo are trademarks of DocOrbit — the MIT license covers the
source code, not the name or logo. Trademark, licensing, security, or commercial
inquiries: **<info@docorbit.com>**.
