# @orbidicom/core

Framework-agnostic engine for [OrbiDICOM](https://github.com/docorbitapp/orbidicom) — a modern,
mobile-responsive DICOM viewer. Owns Cornerstone3D setup, the pluggable `DataSource` interface
(PACS / DICOMweb / local files), auth strategies, and the tool/window-level preset registry.

No Vue, no DOM-framework code, no hardcoded endpoints.

Source and issues: <https://github.com/docorbitapp/orbidicom>

## What's inside

- **Data sources** — `DicomWebDataSource` (QIDO/WADO-RS), `LocalDataSource` (`.dcm` files),
  `NiftiDataSource`, all implementing the pluggable [`DataSource`](src/datasource.ts) interface.
- **Auth strategies** — `none` / `basic` / `bearer` / `cookie` / custom.
- **Registries** — `registerTool` / `registerWindowPreset` and a modality-aware
  `windowPresetsFor` preset engine.
- **Keyboard shortcuts** — a framework-agnostic keymap (`DEFAULT_KEYMAP`, `resolveHotkey`,
  `resolveEditCommand` for undo/redo).
- **Cornerstone3D setup** — `initCornerstone`, `createStack`, plus DICOM metadata + SR parsing.
- **Annotations & reports** — measurement export (JSON/CSV) + DICOM-SR (`buildMeasurementSr`)
  with Part-10 encoding (`dicomJsonToPart10`) for STOW-RS upload, plus create/delete undo/redo
  (`annotationHistory`) and key-image export (`keyImagesToJson`).
- **DICOM-SEG** — parse + decode a SEG into per-image labelmaps (`getSegmentation`,
  `buildSegLabelmaps`) and render it over a stack (`StackHandle.showSegmentation`); read-only.

## Install

```sh
npm install @orbidicom/core
```

> **Just want to look at images?** You don't need to write any code. The
> [`orbidicom`](https://www.npmjs.com/package/orbidicom) CLI serves the full
> viewer in one command — `npx orbidicom` for local files, or
> `npx orbidicom --pacs <url>` against a DICOMweb PACS. Reach for `@orbidicom/core`
> when you're embedding the engine in your own app or wiring a custom backend.

## Usage

Use a built-in data source:

```ts
import { DicomWebDataSource } from "@orbidicom/core";

const source = new DicomWebDataSource({ root: "/dicom-web" });
const series = await source.getSeries(["1.2.840…"]);
const imageIds = await source.getImageIds(series[0]);
```

### Authentication

Every `DicomWebDataSource` takes an optional `auth` strategy (the discriminator
is `kind`). `none` (default) and `cookie` add no `Authorization` header —
`cookie` rides on `withCredentials` for a cross-origin session — while `basic`,
`bearer`, and `custom` inject headers:

```ts
new DicomWebDataSource({ root: "/dicom-web" }); // same-origin, no header
new DicomWebDataSource({ root: "https://pacs/dicom-web", auth: { kind: "cookie" } });
new DicomWebDataSource({
  root: "https://pacs/dicom-web",
  auth: { kind: "basic", username: "user", password: "pass" },
});
new DicomWebDataSource({
  root: "https://pacs/dicom-web",
  // A bearer token can be a string, or a (possibly async) function for refresh:
  auth: { kind: "bearer", token: () => getFreshAccessToken() },
});
```

### Other built-in sources

```ts
import { LocalDataSource, NiftiDataSource, DicomJsonDataSource } from "@orbidicom/core";

// Offline: parse dropped .dcm files (a study folder or zip), no server.
const local = new LocalDataSource();
await local.addFiles(fileList); // File[] from an <input> / drag-drop

// A single .nii / .nii.gz volume.
const nifti = new NiftiDataSource();
await nifti.addFile(niiFile);

// In-memory DICOM-JSON metadata (e.g. a QIDO/WADO-RS response you already hold).
const json = new DicomJsonDataSource({ metadata, root: "/dicom-web" });
```

…or add your own backend by implementing the `DataSource` contract — `getSeries`,
`getImageIds`, optional `getMetadata` / `downloadArchive`, plus `capabilities`. The UI never
branches on backend type, so a new backend is a new adapter, not a UI change:

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

Register window presets for any modality (CT ships five standard windows):

```ts
import { registerWindowPreset, windowPresetsFor } from "@orbidicom/core";

registerWindowPreset({ modality: "MR", name: "Brain T2", windowWidth: 2200, windowCenter: 1100 });
windowPresetsFor("MR"); // → [{ modality: "MR", name: "Brain T2", … }]
```

### Search a worklist (QIDO-RS)

DICOMweb sources advertise `capabilities.studySearch` and implement
`searchStudies` — a `StudyQuery` in, `StudySummary[]` out:

```ts
const studies = await source.searchStudies({
  patientId: "12345",
  modality: "CT",
  studyDate: "20240101-20241231", // DICOM date range
  limit: 50,
});
// → [{ studyInstanceUID, patientName, studyDate, modalitiesInStudy, … }]
```

### Export measurements (JSON / CSV / DICOM-SR)

Collect the on-screen annotations, then serialize them. The same measurements
feed a Comprehensive DICOM-SR document:

```ts
import {
  collectMeasurements,
  measurementsToCsv,
  measurementsToJson,
  buildMeasurementSr,
} from "@orbidicom/core";

const measurements = collectMeasurements(); // Length / Angle / ROI / Probe
const csv = measurementsToCsv(measurements);
const json = measurementsToJson(measurements);
const srDocument = buildMeasurementSr(measurements); // DICOM-JSON SR (TID-1500-flavored)
```

Encode that SR to Part-10 and upload it to a store-capable PACS (STOW-RS):

```ts
import { dicomJsonToPart10 } from "@orbidicom/core";

const part10 = dicomJsonToPart10(srDocument); // Explicit-VR-LE Part-10 bytes
await source.storeInstances?.([part10], { studyUid: "1.2.840…" }); // multipart/related STOW
```

### Keyboard shortcuts (framework-agnostic)

`resolveHotkey` maps a key event to a command against `DEFAULT_KEYMAP` (or your
own map), so the keymap is reusable outside Vue:

```ts
import { DEFAULT_KEYMAP, resolveHotkey } from "@orbidicom/core";

window.addEventListener("keydown", (e) => {
  const cmd = resolveHotkey(e, DEFAULT_KEYMAP);
  if (cmd?.kind === "tool") setPrimaryTool(cmd.tool);
  // other commands: invert, rotate, flipH, reset, cine, scroll, preset
});
```

### Read DICOM metadata

```ts
import { readImageMetadata, readMetadataGroups } from "@orbidicom/core";

const meta = await readImageMetadata(imageId); // { patientName, modality, pixelSpacing, … }
const groups = await readMetadataGroups(imageId); // grouped rows for a tag-reader panel
```

### MPR + 3D volume rendering

Build a volume from a stack and drive four linked panes (axial / coronal /
sagittal / 3D-VR) with selectable transfer-function presets:

```ts
import { createMprView, isVolumeCapable, VR_PRESETS } from "@orbidicom/core";

if (isVolumeCapable(series, imageIds.length)) {
  const mpr = createMprView({ axial, coronal, sagittal, volume3d }); // four HTMLDivElements
  await mpr.setVolume(imageIds, { modality: "CT" });
  mpr.setPreset("CT-Bone"); // VR_PRESETS: CT-Bone, CT-Lung, CT-MIP, MR-Default, …
}
```

## Plugins & data sources

Bundle tools, window presets, and backend factories into a plugin and register them in one
call — they fan out to the registries the UI reads from:

```ts
import { registerPlugin, createDataSource } from "@orbidicom/core";

registerPlugin({
  name: "acme-extras",
  windowPresets: [{ modality: "CT", name: "Stroke", windowWidth: 40, windowCenter: 40 }],
  // tools: [...], dataSources: [{ id: "acme", label: "Acme PACS", create: (cfg) => new AcmeSource(cfg) }],
});

// The built-in adapters are pre-registered, so you can build one by id:
const source = createDataSource("dicomweb", { root: "/dicom-web" });
```

## Roadmap

See the project [ROADMAP.md](https://github.com/docorbitapp/orbidicom/blob/main/ROADMAP.md).
Shipped here: MPR + 3D volume rendering (`createMprView`, VR presets), measurement export
(JSON/CSV) + DICOM-SR with Part-10/STOW upload, annotation undo/redo, key-image flagging, and
read-only DICOM-SEG labelmap rendering (2D stack, pending browser QA). Next up: DICOM-SEG
MPR/volume rendering and brush/threshold editing.

## License

MIT © OrbiDICOM contributors.

"OrbiDICOM" and its logo are trademarks of DocOrbit — the MIT license covers the
source code, not the name or logo. Trademark, licensing, security, or commercial
inquiries: **<info@docorbit.com>**.
