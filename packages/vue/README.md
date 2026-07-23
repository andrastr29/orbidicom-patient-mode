# @orbidicom/vue

Vue 3 UI for [OrbiDICOM](https://github.com/docorbitapp/orbidicom) — a modern, mobile-responsive,
multilingual DICOM viewer. Components: `Viewer`, `Toolbar`, `SeriesRail`, `MetaPanel`,
`LangSwitcher`, `StudyList`, `Controls`, plus live i18n (20 built-in languages incl. RTL, searchable switcher) and
CSS-variable theming.

Source and issues: <https://github.com/docorbitapp/orbidicom>

> This package ships Vue single-file components as **source**. You need a Vue 3 + bundler
> (Vite, etc.) toolchain that can compile `.vue`/`.ts` from `node_modules`.

## Features & roadmap

✅ shipped · ⬜ planned. Tiers and detail in [ROADMAP.md](https://github.com/docorbitapp/orbidicom/blob/main/ROADMAP.md).

| Status | Capability                                                                                                                                                  |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | **2D viewing** — window/level, zoom, pan, slice scroll, rotate, flip, invert                                                                                |
| ✅     | **Cine** playback — per cell, adjustable fps                                                                                                                |
| ✅     | **Measurement tools** — length, angle, rectangle & ellipse ROI, probe                                                                                       |
| ✅     | **Annotation undo/redo** — Ctrl/Cmd+Z · Ctrl/Cmd+Shift+Z + toolbar buttons (create & delete)                                                                |
| ✅     | **Key-image flagging** — star toggle + count badge, `k` hotkey, JSON export                                                                                 |
| ✅     | **DICOM-SEG segmentations** — per-series sidebar toggles, labelmap overlay (read-only, 2D stack)                                                            |
| ✅     | **Keyboard shortcuts** — tools, transforms, slice nav, presets (remappable)                                                                                 |
| ✅     | **W/L preset engine** — CT built-ins + modality-aware, host-extensible                                                                                      |
| ✅     | **Grid layouts** — 1–10-up, each cell independent                                                                                                           |
| ✅     | **Download slice as JPEG** — image + measurements (no patient text)                                                                                         |
| ✅     | **Reports** — encapsulated PDF + DICOM Structured Report (SR)                                                                                               |
| ✅     | **Metadata** — on-image overlay with privacy blur + full DICOM tag reader                                                                                   |
| ✅     | **Renders from any [`DataSource`](https://github.com/docorbitapp/orbidicom/blob/main/packages/core/src/datasource.ts)** — UI never branches on backend type |
| ✅     | **20 UI languages** (`setLang`, searchable `LangSwitcher`, RTL-aware) + CSS-variable theming                                                                |
| ✅     | **MPR + 3D volume rendering (VR)** — tri-planar + crosshairs + VR presets (CT-Bone, MIP, …)                                                                 |
| ✅     | **Measurement export** — JSON + CSV                                                                                                                         |
| ✅     | **STOW-RS upload** — `storeInstances` (multipart/related)                                                                                                   |
| ✅     | **DICOM-SR export** — measurement SR + Part-10 encoding & STOW-RS upload (capability-gated "Upload SR" button)                                              |
| ✅     | **Hanging protocols** — `single` / `grid` built-ins + custom; `hanging-protocol` prop                                                                       |
| ✅     | **Study list / worklist** — QIDO-RS `searchStudies` + a `<StudyList>` filter/results component                                                              |
| ✅     | **Plugin SDK** — `registerPlugin` (tools / presets / data sources) + data-source factory registry                                                           |

## Install

```sh
npm install @orbidicom/vue @orbidicom/core vue
```

> **Not embedding it in an app?** The [`orbidicom`](https://www.npmjs.com/package/orbidicom)
> CLI serves this exact UI in one command — `npx orbidicom` (local files) or
> `npx orbidicom --pacs <url>` (any DICOMweb PACS). Use this package when you want
> the `<Viewer>` inside your own Vue app, themed and wired to your data source.

## Usage

Pick a data source from `@orbidicom/core`, pass it to `<Viewer>`. The available sources:

- `DicomWebDataSource` — a DICOMweb PACS (QIDO + WADO-RS).
- `LocalDataSource` — local files (`.dcm`, drag & drop, study folder / zip).
- `NiftiDataSource` — a single `.nii` / `.nii.gz` volume.

```vue
<script setup lang="ts">
import { Viewer } from "@orbidicom/vue";
import "@orbidicom/vue/theme.css";
import { DicomWebDataSource } from "@orbidicom/core";

// Point at a DICOMweb PACS (optionally with an auth strategy — discriminator is `kind`):
const source = new DicomWebDataSource({ root: "/dicom-web" });
// const source = new DicomWebDataSource({ root: "/dicom-web", auth: { kind: "bearer", token } });

// …or run fully offline on local files:
// import { LocalDataSource } from "@orbidicom/core";
// const source = new LocalDataSource();
</script>

<template>
  <Viewer :source="source" :study-uids="['1.2.840…']" />
</template>
```

Switch language at runtime (or drop in the `<LangSwitcher>` component):

```ts
import { setLang } from "@orbidicom/vue";
setLang("ja"); // en·tr·de·es·fr·it·pt·ru·zh·ja·ko·hi·id·nl·pl·ar·fa·bn·vi·uk (ar/fa are RTL)
```

Open multiple series at once with a hanging protocol (`single` — default — or `grid`, or a
custom function):

```vue
<Viewer :source="source" hanging-protocol="grid" />
```

Implement your own backend by satisfying the `DataSource` contract in `@orbidicom/core`
(`getSeries`, `getImageIds`, plus `capabilities`) — no UI changes needed.

### Worklist → open a study

`<StudyList>` renders a patient / ID / accession / modality filter form over a
DICOMweb source's `searchStudies` and emits `open` with the chosen study UID —
hand it straight to `<Viewer>`:

```vue
<script setup lang="ts">
import { ref } from "vue";
import { StudyList, Viewer } from "@orbidicom/vue";
import "@orbidicom/vue/theme.css";
import { DicomWebDataSource } from "@orbidicom/core";

const source = new DicomWebDataSource({ root: "/dicom-web" });
const studyUids = ref<string[]>([]);
</script>

<template>
  <StudyList v-if="!studyUids.length" :source="source" @open="(uid) => (studyUids = [uid])" />
  <Viewer v-else :source="source" :study-uids="studyUids" />
</template>
```

### Theming

The UI is styled entirely with CSS custom properties — override them on a wrapper
(or `:root`) after importing `theme.css`. No build step or Sass needed:

```css
@import "@orbidicom/vue/theme.css";

.my-viewer {
  --accent: #1f6f78; /* primary accent */
  --accent-strong: #38b2bd; /* active tool / focus ring */
  --bg: #0b0e0e; /* viewport background */
  --panel: #14191a; /* toolbars & rails */
  --text: #e6eded;
  --font: "Inter", system-ui, sans-serif;
  --r-md: 10px; /* corner radius */
}
```

```vue
<div class="my-viewer"><Viewer :source="source" /></div>
```

### Remap keyboard shortcuts

Pass a `keymap` to override the defaults (the engine's `DEFAULT_KEYMAP` is the
starting point):

```vue
<script setup lang="ts">
import { Viewer } from "@orbidicom/vue";
import { DEFAULT_KEYMAP } from "@orbidicom/core";

const keymap = { ...DEFAULT_KEYMAP, z: { kind: "tool", tool: "Zoom" } };
</script>

<template>
  <Viewer :source="source" :keymap="keymap" />
</template>
```

## Supported languages

English, Türkçe, Deutsch, Español, Français, Italiano, Português, Русский, 中文, 日本語,
한국어, हिन्दी, Bahasa Indonesia, Nederlands, Polski, العربية, فارسی, বাংলা, Tiếng Việt,
Українська — with a built-in **searchable** live switcher; the right-to-left languages
(Arabic, Persian) mirror the layout via a `dir` attribute. Adding one is a small string table; see the
[add-a-locale guide](https://github.com/docorbitapp/orbidicom/tree/main/.claude/skills/add-a-locale).
Missing keys fall back to English.

## License

MIT © OrbiDICOM contributors.

"OrbiDICOM" and its logo are trademarks of DocOrbit — the MIT license covers the
source code, not the name or logo. Trademark, licensing, security, or commercial
inquiries: **<info@docorbit.com>**.
