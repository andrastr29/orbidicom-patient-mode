# OrbiDICOM

A **modern**, **mobile-responsive**, lightweight, extensible **Vue 3** DICOM viewer that plugs
into **any PACS** (Orthanc, dcm4chee, Google Healthcare, or a proxy) and also runs **fully
offline** on local `.dcm`/`.nii` files.

Built mobile-first: a touch-friendly, responsive UI that works everywhere from a phone to a
4K reading station: selectable 1–10-up grids, linked viewports, an on-image metadata overlay
with a privacy (blur) mode for demos, a DICOM metadata reader, cine playback, keyboard
shortcuts, and W/L presets. The interface is **multilingual**, with 20 built-in languages
(including right-to-left support for Arabic and Persian) and a searchable live
language switcher, and you can [add your own](.claude/skills/add-a-locale). It's also **easy to
deploy**: Kubernetes-ready with its own **Helm chart** and container image, runnable in a
single command.

## Features & roadmap

✅ shipped · 🟡 partial · ⬜ planned. Tiers and detail in [ROADMAP.md](./ROADMAP.md).

As of **v0.8.0**, all of Tier 1 and most of Tier 2 have shipped, including annotation
undo/redo, key-image flagging, DICOM-SR Part-10/STOW upload, and read-only DICOM-SEG
labelmap rendering (2D stack). The remaining gap, the `npm create orbidicom` scaffolder,
is tracked in [ROADMAP.md](./ROADMAP.md).

| Status | Capability                                                                                                                                          |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | **2D viewing** on Cornerstone3D: window/level, zoom, pan, slice scroll, rotate, flip, invert                                                        |
| ✅     | **Cine** playback: per cell, adjustable fps                                                                                                         |
| ✅     | **Measurement tools**: length, angle, rectangle & ellipse ROI, probe (labelled with its value, not voxel coordinates)                               |
| ✅     | **Annotation undo/redo**: Ctrl/Cmd+Z · Ctrl/Cmd+Shift+Z + toolbar buttons (create & delete)                                                         |
| ✅     | **Key-image flagging**: star toggle + count badge, `k` hotkey, JSON export                                                                          |
| ✅     | **Keyboard shortcuts**: tools, transforms, slice nav, presets (shown in tooltips, remappable)                                                       |
| ✅     | **W/L preset engine**: CT built-ins + modality-aware, host-extensible                                                                               |
| ✅     | **Grid layouts**: 1–10-up, each cell independent                                                                                                    |
| ✅     | **Linked viewports**: synchronized scrolling (position-based, so T1/T2 stay level) + reference lines from the focused cell                          |
| ✅     | **Plain circle annotation**: draw a circle that reports no numbers, for pointing at a finding (`c`)                                                 |
| ✅     | **Download slice as JPEG**: image + measurements (no patient text)                                                                                  |
| ✅     | **Reports**: encapsulated PDF + DICOM Structured Report (SR)                                                                                        |
| ✅     | **Metadata**: on-image overlay with privacy blur + full DICOM tag reader                                                                            |
| ✅     | **Data sources**: DICOMweb (QIDO/WADO-RS), local files, NIfTI, DICOM-JSON, all behind one [`DataSource`](packages/core/src/datasource.ts) interface |
| ✅     | **Auth**: none / basic / bearer / cookie / custom                                                                                                   |
| ✅     | **Study ZIP download** (DICOMweb)                                                                                                                   |
| ✅     | **STOW-RS upload**: `storeInstances` (multipart/related)                                                                                            |
| ✅     | **20 UI languages** (incl. RTL: Arabic, Persian) + searchable switcher + CSS-variable theming                                                       |
| ✅     | **Runs anywhere**: offline, `npx orbidicom`, Kubernetes/Helm                                                                                        |
| ✅     | **MPR + 3D volume rendering (VR)**: tri-planar + crosshairs + VR presets (CT-Bone, MIP, …), one click from the toolbar                              |
| ✅     | **Measurement export**: JSON + CSV                                                                                                                  |
| ✅     | **DICOM-SR export**: measurement SR + Part-10 encoding & STOW-RS upload (`buildMeasurementSr` → `dicomJsonToPart10` → `storeInstances`)             |
| ✅     | **DICOM-SEG**: read-only labelmap rendering (2D stack: parse → decode → Cornerstone labelmap)                                                       |
| ✅     | **Hanging protocols**: `single` / `grid` built-ins + custom; `hanging-protocol` prop                                                                |
| ✅     | **Study list / worklist**: QIDO-RS `searchStudies` + a `<StudyList>` filter/results component                                                       |
| ✅     | **Plugin SDK**: `registerPlugin` (tools / presets / data sources) + data-source factory registry                                                    |

## Try it in one command

```bash
npx orbidicom
```

Opens the viewer in your browser in **local mode**: drag in `.dcm` files, no server required.
Point it at a DICOMweb PACS, and optionally open a study on launch:

```bash
npx orbidicom --pacs https://your-dicomweb-endpoint/dicom-web --study 1.2.840.113619…
```

`--pacs` and `--study` can also be passed at runtime through the URL
(`…/?pacs=/dicom-web&study=1.2.840…`), so one hosted build (or the container image)
can open any study without rebuilding or editing config.

## Use it in your app

Install the packages and embed the viewer component:

```bash
npm install @orbidicom/vue @orbidicom/core vue
```

```ts
import { Viewer } from "@orbidicom/vue";
import "@orbidicom/vue/theme.css";
import { DicomWebDataSource } from "@orbidicom/core";

const source = new DicomWebDataSource({ root: "/dicom-web" });
// <Viewer :source="source" :study-uids="['1.2.840…']" />
```

Theme it, translate it (live switching across 20 built-in languages, and easy to add
more), and plug in your own data sources and tools. See the [docs](./docs) and
[CONTRIBUTING](./CONTRIBUTING.md). (A `npm create orbidicom` scaffolder is planned.)

### Recipes

A few common setups. The package READMEs ([`@orbidicom/core`](./packages/core/README.md),
[`@orbidicom/vue`](./packages/vue/README.md), [`orbidicom`](./packages/cli/README.md)) have
the full API and many more examples.

**Run fully offline on local files**, no server, drag in `.dcm`/`.nii`:

```ts
import { LocalDataSource } from "@orbidicom/core";
const source = new LocalDataSource();
await source.addFiles(files); // File[] from an <input> or drag-and-drop
// <Viewer :source="source" />
```

**Authenticate against a PACS**. `auth` is a discriminated union on `kind`:

```ts
new DicomWebDataSource({ root: "https://pacs/dicom-web", auth: { kind: "cookie" } });
new DicomWebDataSource({ root: "https://pacs/dicom-web", auth: { kind: "bearer", token } });
new DicomWebDataSource({
  root: "https://pacs/dicom-web",
  auth: { kind: "basic", username, password },
});
```

**Add a backend the UI never has to know about** by implementing `DataSource`:

```ts
import type { DataSource, SeriesSummary } from "@orbidicom/core";

class MyPacs implements DataSource {
  capabilities = { multiStudy: true };
  async getSeries(studyUids: string[]): Promise<SeriesSummary[]> {
    /* … */ return [];
  }
  async getImageIds(series: SeriesSummary): Promise<string[]> {
    /* … */ return [];
  }
}
```

**Theme it**: every color, font, and radius is a CSS variable:

```css
@import "@orbidicom/vue/theme.css";
.viewer {
  --accent: #1f6f78;
  --accent-strong: #38b2bd;
  --bg: #0b0e0e;
  --font: "Inter", system-ui, sans-serif;
}
```

## Deploy to Kubernetes

OrbiDICOM is **Kubernetes-ready** with a container image and a bundled **Helm
chart**: one command to run, local-file-only or connected to a PACS:

```bash
helm install orbidicom ./helm/orbidicom \
  --set pacs.proxy.upstream=http://orthanc.pacs.svc.cluster.local:8042/dicom-web
```

The chart includes a same-origin DICOMweb reverse proxy (no CORS setup, PACS
stays in-cluster), ingress + TLS, autoscaling, and non-root hardening. The PACS
endpoint is set at container start, so one image serves any deployment. Full
guide: [docs/deploy.md](./docs/deploy.md).

## Supported languages

The UI ships with **20 languages** and a built-in **searchable** live switcher: type to
filter, change language at runtime, no reload. The right-to-left languages (`ar`, `fa`)
mirror the whole layout:

| Code | Language         | Code | Language      |
| ---- | ---------------- | ---- | ------------- |
| `en` | English          | `pl` | Polski        |
| `tr` | Türkçe           | `zh` | 中文 (简体)   |
| `de` | Deutsch          | `ja` | 日本語        |
| `es` | Español          | `ko` | 한국어        |
| `fr` | Français         | `hi` | हिन्दी        |
| `it` | Italiano         | `ar` | العربية (RTL) |
| `pt` | Português        | `fa` | فارسی (RTL)   |
| `ru` | Русский          | `bn` | বাংলা         |
| `id` | Bahasa Indonesia | `vi` | Tiếng Việt    |
| `nl` | Nederlands       | `uk` | Українська    |

Right-to-left scripts are supported: Arabic and Persian mirror the whole layout via a `dir`
attribute that follows the active language (Hebrew/Urdu are easy follow-ons). Need another
language? It's a small string table; see the [add-a-locale](.claude/skills/add-a-locale)
guide. Translations fall back to English for any missing key, so a partial locale is safe to ship.

## Packages

| Package           | What it is                                                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `@orbidicom/core` | Framework-agnostic engine: Cornerstone3D setup, `DataSource` interface, DICOMweb + local adapters, auth strategies, tool/preset registry |
| `@orbidicom/vue`  | Vue 3 UI components, theming, i18n, plugin host                                                                                          |
| `orbidicom`       | CLI: `npx orbidicom` runs the viewer locally or against any DICOMweb PACS (`--pacs`, `--study`)                                          |

## License

MIT © OrbiDICOM contributors.

"OrbiDICOM" and its logo are trademarks of DocOrbit. The MIT license covers the
source code, not the name or logo. Trademark, licensing, security, or commercial
inquiries: **<info@docorbit.com>**.
