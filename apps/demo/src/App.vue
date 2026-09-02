<script setup lang="ts">
import { onMounted, ref, shallowRef } from "vue";
import { Viewer, LangSwitcher, t } from "@orbidicom/vue";
import {
  LocalDataSource,
  NiftiDataSource,
  DicomWebDataSource,
  type DataSource,
} from "@orbidicom/core";
import { unzip, type UnzipFileInfo } from "fflate";
import { runtimeConfig } from "./config";

const source = shallowRef<DataSource | null>(null);
const studyUids = ref<string[] | undefined>(undefined);
const dragging = ref(false);
const busy = ref(false);
const message = ref("");

// PACS mode is offered only when a DICOMweb endpoint is configured at runtime
// (see config.ts / config.js). Otherwise the app is purely a local-file viewer.
const cfg = runtimeConfig();
const pacsUrl = (cfg.pacsUrl ?? "").trim();
const hasPacs = pacsUrl.length > 0;

// Patient-facing mode (features.patient / ?patient=1): drop the affordances that
// only make sense for staff. Translated here into the Viewer's per-feature flags;
// the "New study" button is this app's own, so it's gated directly in the template.
const patientMode = cfg.features?.patient === true;
const viewerFeatures = {
  aiResults: cfg.features?.aiResults,
  addStudy: !patientMode,
  imageDownload: !patientMode,
};
const studyUid = ref((cfg.studyUid ?? "").trim());

function openPacs() {
  const uid = studyUid.value.trim();
  if (!uid) {
    message.value = t("pacsNeedUid");
    return;
  }
  message.value = "";
  studyUids.value = [uid];
  // cfg.auth is undefined unless a deployer configured one → source defaults to
  // same-origin (no header, cookies still sent same-origin).
  source.value = new DicomWebDataSource({ root: pacsUrl, auth: cfg.auth });
}

// Auto-open a preconfigured study (ORBIDICOM_STUDY_UID) on load.
onMounted(() => {
  if (hasPacs && studyUid.value) openPacs();
});

// Cap how much a dropped .zip may decompress to, so a huge (or zip-bomb) archive
// can't OOM the browser tab. Entries past the budget are skipped.
const MAX_UNZIP_BYTES = 1_500_000_000;

// --- collect files from a drop (plain files, folders, or .zip) ---------------

/** Read every entry from a directory reader. readEntries() returns at most ~100
 *  entries per call, so we must loop until it returns an empty batch. */
function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (!batch.length) resolve(all);
        else {
          all.push(...batch);
          next();
        }
      }, reject);
    next();
  });
}

/** Recursively flatten a dropped file/dir entry into File objects. A single
 *  unreadable file (moved / locked / permission-denied) yields [] rather than
 *  rejecting, so it can't abort the whole folder drop. */
async function readEntry(entry: FileSystemEntry): Promise<File[]> {
  try {
    if (entry.isFile) {
      const f = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      );
      return [f];
    }
    if (entry.isDirectory) {
      const entries = await readAllEntries((entry as FileSystemDirectoryEntry).createReader());
      const nested = await Promise.all(entries.map(readEntry));
      return nested.flat();
    }
  } catch {
    /* skip unreadable entry */
  }
  return [];
}

/** Expand a .zip into File objects, bounded by MAX_UNZIP_BYTES of decompressed
 *  output (entries past the budget, directory entries, and unsupported codecs
 *  are skipped, because fflate throws if a filtered-in entry isn't stored/deflate). */
function unzipToFiles(zip: File): Promise<{ files: File[]; truncated: boolean }> {
  return zip.arrayBuffer().then(
    (buf) =>
      new Promise((resolve, reject) => {
        let total = 0;
        let truncated = false;
        unzip(
          new Uint8Array(buf),
          {
            filter: (f: UnzipFileInfo) => {
              if (f.name.endsWith("/")) return false;
              if (f.compression !== 0 && f.compression !== 8) return false;
              if (total + f.originalSize > MAX_UNZIP_BYTES) {
                truncated = true;
                return false;
              }
              total += f.originalSize;
              return true;
            },
          },
          (err, data) => {
            if (err) return reject(err);
            const files: File[] = [];
            for (const [path, bytes] of Object.entries(data)) {
              files.push(new File([bytes], path.split("/").pop() || path));
            }
            resolve({ files, truncated });
          },
        );
      }),
  );
}

/** Parse + register collected files into a LocalDataSource; mount the Viewer if
 *  any were DICOM. Expands .zip archives first; non-DICOM files are skipped. */
async function ingest(files: File[]) {
  message.value = "";
  const expanded: File[] = [];
  for (const f of files) {
    if (f.name.toLowerCase().endsWith(".zip")) {
      try {
        const { files: zipped, truncated } = await unzipToFiles(f);
        if (truncated) {
          console.warn(`[demo] "${f.name}" exceeded the unzip budget; opened a subset.`);
        }
        expanded.push(...zipped);
      } catch {
        message.value = `Couldn't read the archive "${f.name}".`;
      }
    } else {
      expanded.push(f);
    }
  }
  if (!expanded.length) {
    if (!message.value) message.value = "Nothing to load from that drop.";
    return;
  }

  busy.value = true;
  try {
    // A NIfTI volume is a single file; if one is present, load it as a stack.
    const niftiFile = expanded.find((f) => /\.nii(\.gz)?$/i.test(f.name));
    if (niftiFile) {
      const nds = new NiftiDataSource();
      const n = await nds.addFile(niftiFile);
      if (n === 0) {
        message.value = `Couldn't read the NIfTI volume "${niftiFile.name}".`;
        return;
      }
      source.value = nds;
      return;
    }

    const ds = new LocalDataSource();
    const added = await ds.addFiles(expanded);
    if (added === 0) {
      message.value = `No DICOM images found in ${expanded.length} file(s).`;
      return;
    }
    source.value = ds;
  } catch (e) {
    message.value = "Failed to load the dropped files.";
    console.error("[demo] ingest failed", e);
  } finally {
    busy.value = false;
  }
}

async function onDrop(e: DragEvent) {
  dragging.value = false;
  if (busy.value) return;
  const items = e.dataTransfer?.items;
  // webkitGetAsEntry() must run synchronously, before any await, because the
  // DataTransferItemList is emptied once the drop handler yields.
  if (items && items.length && typeof items[0]?.webkitGetAsEntry === "function") {
    const entries = Array.from(items)
      .map((it) => it.webkitGetAsEntry())
      .filter((x): x is FileSystemEntry => x != null);
    try {
      const lists = await Promise.all(entries.map(readEntry));
      await ingest(lists.flat());
    } catch {
      message.value = "Couldn't read the dropped folder.";
    }
  } else {
    await ingest(Array.from(e.dataTransfer?.files ?? []));
  }
}

function onPick(e: Event) {
  if (busy.value) return;
  ingest(Array.from((e.target as HTMLInputElement).files ?? []));
}

// dragleave fires when the cursor crosses onto a child element too; only clear
// the highlight when leaving the page itself.
function onDragLeave(e: DragEvent) {
  const related = e.relatedTarget as Node | null;
  if (!related || !(e.currentTarget as HTMLElement).contains(related)) dragging.value = false;
}
</script>

<template>
  <template v-if="source">
    <Viewer :source="source" :study-uids="studyUids" :features="viewerFeatures" title="OrbiDICOM">
      <template #actions>
        <button
          v-if="!patientMode"
          class="newstudy"
          :title="t('newStudy')"
          @click="
            source = null;
            studyUids = undefined;
          "
        >
          <svg
            class="newstudy__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v4h-4" />
          </svg>
          <span>{{ t("newStudy") }}</span>
        </button>
      </template>
    </Viewer>
  </template>

  <div
    v-else
    class="page"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <!-- Language switcher on the upload screen, so users can pick a language
         before loading anything (it persists into the viewer). -->
    <div class="page__lang"><LangSwitcher /></div>

    <div class="dropzone" :class="{ 'dropzone--over': dragging }">
      <svg
        class="dropzone__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M12 15V4" />
        <path d="M7.5 8.5 12 4l4.5 4.5" />
        <path d="M5 15v2.5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5V15" />
      </svg>

      <h1 class="dropzone__title">OrbiDICOM</h1>

      <div v-if="busy" class="loading">
        <span class="spinner" aria-hidden="true" />
        <p class="dropzone__hint">{{ t("dropReading") }}</p>
        <p class="dropzone__sub">{{ t("dropReadingSub") }}</p>
      </div>
      <template v-else>
        <p class="dropzone__hint">{{ t("dropDrag") }}</p>
        <p class="dropzone__sub">{{ t("dropSub") }}</p>

        <div class="dropzone__buttons">
          <label class="btn">
            {{ t("chooseFiles") }}
            <input type="file" multiple hidden @change="onPick" />
          </label>
          <label class="btn btn--ghost">
            {{ t("chooseFolder") }}
            <input type="file" webkitdirectory hidden @change="onPick" />
          </label>
        </div>

        <!-- Shown only when a DICOMweb endpoint is configured at runtime. -->
        <template v-if="hasPacs">
          <div class="pacs__or">
            <span>{{ t("pacsOr") }}</span>
          </div>
          <form class="pacs" @submit.prevent="openPacs">
            <input
              v-model="studyUid"
              class="pacs__input"
              :placeholder="t('pacsStudyUid')"
              :aria-label="t('pacsStudyUid')"
            />
            <button class="btn" type="submit">{{ t("pacsOpen") }}</button>
          </form>
        </template>

        <p v-if="message" class="dropzone__msg">{{ message }}</p>
      </template>
    </div>
  </div>
</template>

<style>
html,
body,
#app {
  margin: 0;
  height: 100%;
  /* Match the viewer's dynamic-viewport height so the mobile URL-bar gap (lvh vs
     dvh) doesn't reveal a strip below the viewer. */
  height: 100dvh;
}
body {
  /* Never flash white behind the viewer (e.g. during overscroll). */
  background: #000;
}
.page {
  position: relative;
  height: 100vh;
  height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px;
  box-sizing: border-box;
  font-family:
    "Oxygen",
    system-ui,
    -apple-system,
    "Segoe UI",
    Roboto,
    sans-serif;
  background: #0b0e0e;
  color: #e6eded;
}
/* The dashed card is the visible drop target cue. The whole page is droppable,
   but this makes the affordance obvious. */
.dropzone {
  width: min(560px, 100%);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 48px 32px;
  text-align: center;
  border: 2px dashed #2f3a3b;
  border-radius: 16px;
  background: #101516;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    transform 0.15s ease;
}
.dropzone--over {
  border-color: #38b2bd;
  background: #12201f;
  transform: scale(1.01);
}
.dropzone__icon {
  width: 46px;
  height: 46px;
  color: #38b2bd;
  margin-bottom: 4px;
}
.dropzone__title {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.3px;
}
.dropzone__hint {
  margin: 0;
  font-size: 15px;
  color: #c4cfcf;
  line-height: 1.5;
}
.dropzone__hint strong {
  color: #e6eded;
}
.dropzone__sub {
  margin: 0 0 6px;
  font-size: 12.5px;
  color: #7f8c8c;
}
.dropzone code {
  background: #1c2323;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
}
.dropzone__buttons {
  display: flex;
  gap: 10px;
  margin-top: 6px;
  flex-wrap: wrap;
  justify-content: center;
}
.btn {
  cursor: pointer;
  padding: 10px 18px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: #1f6f78;
  color: #fff;
  font-size: 14px;
  transition:
    background 0.12s,
    border-color 0.12s;
}
.btn:hover {
  background: #38b2bd;
}
.btn--ghost {
  background: transparent;
  border-color: #2f3a3b;
  color: #c4cfcf;
}
.btn--ghost:hover {
  background: #1c2323;
  border-color: #38b2bd;
  color: #e6eded;
}
.pacs__or {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin: 4px 0 0;
  color: #7c8a8a;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.pacs__or::before,
.pacs__or::after {
  content: "";
  flex: 1;
  height: 1px;
  background: #2f3a3b;
}
.pacs {
  display: flex;
  gap: 8px;
  width: 100%;
  flex-wrap: wrap;
  justify-content: center;
}
.pacs__input {
  flex: 1;
  min-width: 200px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #2f3a3b;
  background: #0e1212;
  color: #e6eded;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.pacs__input:focus {
  outline: none;
  border-color: #38b2bd;
}
.dropzone__msg {
  margin: 4px 0 0;
  font-size: 13px;
  color: #e08636;
}
.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.spinner {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 3px solid #243030;
  border-top-color: #38b2bd;
  animation: spin 0.9s linear infinite;
  margin-bottom: 4px;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
/* Reset-to-landing control while a study is open. Bottom-left keeps it clear of
   the toolbar's scroll hint (top-right) and the slice bar (bottom of the stage). */
.page__lang {
  position: absolute;
  top: calc(14px + env(safe-area-inset-top, 0px));
  right: calc(14px + env(safe-area-inset-right, 0px));
  z-index: 2;
}
/* Docked in the viewer's bottom-left controls (slot). Uses the viewer's theme
   tokens (it renders inside .orbidicom) so it matches the language field beside
   it: same full width, 36px height, radius, and accent. */
.newstudy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--accent-strong);
  border-radius: var(--r-sm);
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  transition:
    background 0.12s,
    border-color 0.12s;
}
.newstudy__icon {
  flex: none;
  width: 16px;
  height: 16px;
}
.newstudy:hover {
  background: var(--accent-strong);
}
.newstudy:focus-visible {
  outline: 2px solid var(--accent-strong);
  outline-offset: 2px;
}
</style>
