<template>
  <div class="viewer orbidicom" :dir="layoutDir">
    <Toolbar
      :modality="activeModality"
      :active-tool="activeTool"
      :layout="cellCount"
      :overlay-mode="overlayMode"
      :menu-open="menuOpen"
      :title="title"
      :can-download="canDownload"
      :can-download-image="canDownloadImage"
      :can-export-measurements="canExportMeasurements"
      :can-undo="canUndo"
      :can-redo="canRedo"
      :is-key-image="isCurrentKeyImage"
      :key-image-count="keyImageCount"
      :can-upload-sr="canUploadSr"
      :can-mpr="canMpr"
      :mpr-active="layoutMode === 'mpr'"
      :stacked="gridStacked"
      :can-ai-results="aiResultsEnabled"
      @preset="applyPreset"
      @tool="selectTool"
      @invert="onActive((s) => s.invert())"
      @rotate="onActive((s) => s.rotate())"
      @flip-h="onActive((s) => s.flipH())"
      @reset="onReset"
      @clear-annotations="confirmClearOpen = true"
      @undo="onUndo"
      @redo="onRedo"
      @toggle-key-image="toggleKeyImage"
      @export-key-images="onExportKeyImages"
      @upload-sr="confirmUploadSrOpen = true"
      @set-layout="setLayout"
      @cycle-overlay="cycleOverlay"
      @open-meta="openMeta"
      @toggle-menu="menuOpen = !menuOpen"
      @download-study="onDownloadStudy"
      @download-image="onDownloadImage"
      @export-measurements="onExportMeasurements"
      @open-ai-results="aiPanelOpen = !aiPanelOpen"
    />

    <div class="content" :class="{ 'rail-collapsed': railCollapsed }">
      <div class="sidebar">
        <SeriesRail
          :series="series"
          :active="seriesIdx[activeCell]"
          :displayed="displayedSeriesIdx"
          :provider="thumbnails"
          @select="selectSeries"
          @close-study="onCloseStudy"
        />
        <button v-if="canAddStudy" class="rail-add" type="button" @click="addStudyOpen = true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span>{{ t("addStudy") }}</span>
        </button>
        <!-- DICOM-SEG: per-series segmentations, each toggled as a labelmap overlay. -->
        <div v-if="segmentations.length" class="segs">
          <div class="segs__title">{{ t("segmentations") }}</div>
          <label v-for="sg in segmentations" :key="sg.sopUid" class="segs__item">
            <input
              type="checkbox"
              :checked="shownSegs.has(sg.sopUid)"
              @change="toggleSegmentation(sg)"
            />
            <span class="segs__label">{{ sg.label || sg.sopUid }}</span>
          </label>
        </div>
        <Controls :open="menuOpen">
          <!-- Host actions (e.g. a "New study" button) docked bottom-left. -->
          <slot name="actions" />
        </Controls>
      </div>

      <!-- Collapse/expand the series rail to free up room for the images. -->
      <button
        class="rail-toggle"
        type="button"
        :aria-label="t('series')"
        :aria-expanded="!railCollapsed"
        @click="railCollapsed = !railCollapsed"
      >
        <svg
          class="rail-toggle__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>

      <div class="stage">
        <!-- Non-blocking warm-up bar: the active series decodes into cache in the
             background while the user can already scroll. Floats over the stage as
             a transparent overlay so it never shifts the viewport on show/hide. -->
        <Transition name="toploader">
          <div v-if="caching" class="toploader" role="status" aria-live="polite">
            <div class="toploader__track">
              <div class="toploader__fill" :style="{ width: cachePct + '%' }" />
            </div>
            <div class="toploader__meta">
              <span class="toploader__label">
                {{ t("caching") }} {{ prefetchLoaded[activeCell] }}/{{ prefetchTotal[activeCell] }}
              </span>
              <span class="toploader__note">{{ t("cacheNote") }}</span>
            </div>
          </div>
        </Transition>

        <!-- The grid stays mounted in MPR mode (display:none) so its viewports'
             rendering engines keep their DOM elements — switching back is instant. -->
        <div class="grid" :class="[gridClass, { 'grid--hidden': layoutMode === 'mpr' }]">
          <div
            v-for="i in MAX_CELLS"
            :key="i"
            class="cell"
            :class="{
              'cell--active': cellCount > 1 && activeCell === i - 1,
              'cell--hidden': !isVisible(i - 1),
            }"
            @pointerdown="activeCell = i - 1"
          >
            <div :ref="(el) => setEl(i - 1, el)" class="cs-viewport" />

            <!-- Report series render here instead of an image stack: encapsulated
                 PDF via PdfView, DICOM Structured Report via SrView. -->
            <PdfView v-if="pdfUrl[i - 1]" :src="pdfUrl[i - 1]!" />
            <SrView v-else-if="srTree[i - 1]" :tree="srTree[i - 1]!" />

            <Overlay
              v-if="sliceCount[i - 1]"
              :meta="meta[i - 1]"
              :wl="wl[i - 1]"
              :index="sliceIndex[i - 1]"
              :count="sliceCount[i - 1]"
              :series-label="cellLabel(i - 1)"
              :privacy="overlayPrivacy"
            />
            <AnnotationOverlay
              v-if="sliceCount[i - 1]"
              :get-viewport="() => stacks[i - 1]?.getViewport() ?? null"
              :element="els[i - 1]"
              :version="annotationVersion"
              @delete="onDeleteAnnotation"
            />

            <div v-if="cellLoading[i - 1]" class="loading">
              <span class="spinner" />
              <span class="loading__text">{{ t("loading") }}</span>
            </div>

            <div
              v-if="
                cellCount > 1 && isVisible(i - 1) && seriesIdx[i - 1] < 0 && !cellLoading[i - 1]
              "
              class="cell__empty"
            >
              <span class="cell__empty-chip">{{ t("pickSeries") }}</span>
            </div>
          </div>
        </div>

        <!-- MPR / 3D: three linked orthographic planes + a volume-rendering pane,
             all built from the active series (OHIF-style 2×2 hanging protocol). -->
        <div v-if="layoutMode === 'mpr'" class="mpr">
          <div :ref="(el) => (mprEls.axial.value = el as HTMLDivElement)" class="mpr__pane" />
          <div :ref="(el) => (mprEls.coronal.value = el as HTMLDivElement)" class="mpr__pane" />
          <div :ref="(el) => (mprEls.sagittal.value = el as HTMLDivElement)" class="mpr__pane" />
          <div class="mpr__pane mpr__pane--vr">
            <div :ref="(el) => (mprEls.volume3d.value = el as HTMLDivElement)" class="mpr__vr" />
            <label class="mpr__preset" :title="t('vrPreset')">
              <span class="mpr__preset-label">{{ t("vrPreset") }}</span>
              <select
                :value="vrPreset"
                :disabled="!mprReady"
                @change="onVrPreset(($event.target as HTMLSelectElement).value)"
              >
                <option v-for="name in VR_PRESETS" :key="name" :value="name">{{ name }}</option>
              </select>
            </label>
          </div>
          <div v-if="!mprReady" class="loading">
            <span class="spinner" />
            <span class="loading__text">{{ t("mprBuilding") }}</span>
          </div>
        </div>

        <div v-if="layoutMode === 'grid' && sliceCount[activeCell] > 1" class="slicebar">
          <button
            class="slicebar__play"
            :class="{ 'is-playing': cinePlaying[activeCell] }"
            :title="cinePlaying[activeCell] ? t('pause') : t('playLoop')"
            @click="toggleCine"
          >
            <svg v-if="!cinePlaying[activeCell]" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" fill="currentColor" />
            </svg>
            <svg v-else viewBox="0 0 24 24">
              <path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" />
            </svg>
          </button>
          <select
            class="slicebar__speed"
            :title="t('cineSpeed')"
            :value="cineFps[activeCell]"
            @change="setSpeed(Number(($event.target as HTMLSelectElement).value))"
          >
            <option v-for="f in CINE_SPEEDS" :key="f" :value="f">{{ f }} fps</option>
          </select>
          <input
            class="slicebar__range"
            type="range"
            min="0"
            :max="sliceCount[activeCell] - 1"
            :value="sliceIndex[activeCell]"
            @input="onSlider"
          />
          <span class="slicebar__count"
            >{{ sliceIndex[activeCell] + 1 }} / {{ sliceCount[activeCell] }}</span
          >
        </div>
      </div>

      <!-- AI & Results right dock: imports an AIResultSet and applies its
           accepted/visible results to the active cell. Gated by features.aiResults
           (the panel + toolbar button don't exist unless the deployment enables it). -->
      <AiResultsPanel
        v-if="aiResultsEnabled && aiPanelOpen"
        :result-set="aiResultSet"
        :error="aiImportMsg"
        @import-file="onAiImport"
        @accept="onAiAccept"
        @reject="onAiReject"
        @toggle="onAiToggle"
        @export="onAiExport"
      />
    </div>

    <MetaPanel :open="metaPanelOpen" :groups="metaGroups" @close="metaPanelOpen = false" />

    <div v-if="confirmClearOpen" class="modal" @click.self="confirmClearOpen = false">
      <div class="modal__card">
        <p class="modal__msg">{{ t("confirmClear") }}</p>
        <div class="modal__actions">
          <button class="modal__btn" @click="confirmClearOpen = false">{{ t("cancel") }}</button>
          <button class="modal__btn modal__btn--danger" @click="doClearAnnotations">
            {{ t("clear") }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="confirmCloseUid" class="modal" @click.self="confirmCloseUid = null">
      <div class="modal__card">
        <p v-if="confirmCloseLabel" class="modal__subject">{{ confirmCloseLabel }}</p>
        <p class="modal__msg">{{ t("confirmCloseStudy") }}</p>
        <div class="modal__actions">
          <button class="modal__btn" @click="confirmCloseUid = null">{{ t("cancel") }}</button>
          <button class="modal__btn modal__btn--danger" @click="doCloseStudy">
            {{ t("closeStudy") }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="confirmUploadSrOpen" class="modal" @click.self="!srUploadBusy && closeUploadSr()">
      <div class="modal__card">
        <p class="modal__msg">{{ srUploadMsg ?? t("confirmUploadSr") }}</p>
        <div class="modal__actions">
          <template v-if="srUploadMsg">
            <button class="modal__btn" @click="closeUploadSr">{{ t("close") }}</button>
          </template>
          <template v-else>
            <button class="modal__btn" :disabled="srUploadBusy" @click="closeUploadSr">
              {{ t("cancel") }}
            </button>
            <button
              class="modal__btn modal__btn--primary"
              :disabled="srUploadBusy"
              @click="doUploadSr"
            >
              {{ t("upload") }}
            </button>
          </template>
        </div>
      </div>
    </div>

    <div v-if="addStudyOpen" class="modal" @click.self="addStudyOpen = false">
      <div class="modal__card modal__card--wide">
        <StudyList :source="source" :open-uids="openStudyUids" @open="onPickStudy" />
        <div class="modal__actions">
          <button class="modal__btn" @click="addStudyOpen = false">{{ t("cancel") }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import Toolbar from "./Toolbar.vue";
import SeriesRail from "./SeriesRail.vue";
import Controls from "./Controls.vue";
import Overlay from "./Overlay.vue";
import MetaPanel from "./MetaPanel.vue";
import PdfView from "./PdfView.vue";
import SrView from "./SrView.vue";
import AnnotationOverlay from "./AnnotationOverlay.vue";
import AiResultsPanel from "./AiResultsPanel.vue";
import StudyList from "./StudyList.vue";
import {
  initCornerstone,
  setPrimaryTool,
  TOOLS,
  createStack,
  createThumbnailProvider,
  readImageMetadata,
  readMetadataGroups,
  resolveHotkey,
  resolveEditCommand,
  DEFAULT_KEYMAP,
  windowPresetsFor,
  collectMeasurements,
  measurementsToJson,
  measurementsToCsv,
  keyImagesToJson,
  buildMeasurementSr,
  dicomJsonToPart10,
  onMeasurementsChanged,
  annotationHistory,
  startAnnotationHistory,
  deleteAnnotation,
  createMprView,
  isVolumeCapable,
  VR_PRESETS,
  defaultVrPreset,
  applyHangingProtocol,
  orderStudyGroups,
  importResults,
  applyResultSet,
  removeApplied,
  removeAppliedSegmentations,
  exportAccepted,
  ImportError,
} from "@orbidicom/core";
import type {
  StackHandle,
  WindowLevel,
  DataSource,
  SeriesSummary,
  ImageMetadata,
  MetaGroup,
  SrTree,
  Keymap,
  MprHandle,
  HangingProtocol,
  HangingProtocolName,
  KeyImage,
  SegmentationInstance,
  AIResultSet,
} from "@orbidicom/core";
import { t, dir, getLang, formatDicomDate } from "../i18n";

// Mirrors the whole viewer for right-to-left UI languages (Arabic, Persian, …).
// Reactive: reading getLang() tracks setLang(), so switching language flips dir.
const layoutDir = computed(() => dir(getLang()));

// Selectable viewport layouts (cell count -> CSS class on the grid). MAX_CELLS
// is the largest layout; every per-cell array is sized to it and the extra
// cells are simply display:none (so their stacks stay attached to live DOM).
const MAX_CELLS = 10;
const LAYOUT_SIZES = [1, 2, 4, 6, 8, 10];
const VALID_LAYOUTS = new Set(LAYOUT_SIZES);
// Snap an arbitrary cell count to the smallest grid layout that holds it (a
// custom hanging protocol may return any number; the grid only renders these).
const snapLayout = (n: number): number =>
  LAYOUT_SIZES.find((c) => c >= n) ?? LAYOUT_SIZES[LAYOUT_SIZES.length - 1];
const CINE_FPS = 10; // default playback speed
const CINE_SPEEDS = [5, 10, 15, 20, 30]; // fps options in the bottom cine bar
const LOAD_TIMEOUT_MS = 45_000;

const props = defineProps<{
  source: DataSource;
  studyUids?: string[];
  title?: string;
  /** Override the built-in keyboard shortcuts (merged over `DEFAULT_KEYMAP`). */
  keymap?: Keymap;
  /**
   * Initial hanging protocol applied once the study's series load: a built-in
   * name (`"single"` — default — or `"grid"`) or a custom function. Controls how
   * many cells open and which series fills each.
   */
  hangingProtocol?: HangingProtocolName | HangingProtocol;
  /** Per-deployment feature toggles (from runtime config). */
  features?: { aiResults?: boolean };
}>();
/**
 * `studyUids` is a two-way surface: hosts can bind `v-model:study-uids` and see
 * the built-in affordances (the rail's close button, Task 9's study picker) move
 * the open set, not only their own prop writes.
 */
const emit = defineEmits<{ "update:studyUids": [string[]] }>();
// Kicked off at setup, not in onMounted: the studyUids watcher is live from setup
// and can reach loadIntoCell -> createStack before onMounted's await would have
// resolved, building a viewport against an uninitialised Cornerstone. Everything
// that touches a viewport awaits this first. Idempotent by construction — one
// promise per component, started once.
const csReady = initCornerstone();
const series = ref<SeriesSummary[]>([]);
// One shared preview provider for the rail (LRU-cached, lazy). Cheap to create —
// it allocates no DOM/viewport until a series actually needs a client render.
const thumbnails = createThumbnailProvider({ source: props.source });
const cellCount = ref(1);
const activeCell = ref(0);
// The 2-cell grid can be side-by-side (1×2) or stacked (2×1). Only meaningful
// when cellCount === 2; any other layout choice resets it (see setLayout).
const gridStacked = ref(false);
// The series rail can be collapsed to give the stage more room. Session-only.
const railCollapsed = ref(false);
// "grid" = the stack-cell grid; "mpr" = a 3-plane volume reconstruction that
// replaces the stage (the grid stays mounted but hidden). Min slices to bother.
const MIN_MPR_SLICES = 16;
const layoutMode = ref<"grid" | "mpr">("grid");
const mprReady = ref(false);
const mprEls = {
  axial: ref<HTMLDivElement | null>(null),
  coronal: ref<HTMLDivElement | null>(null),
  sagittal: ref<HTMLDivElement | null>(null),
  volume3d: ref<HTMLDivElement | null>(null),
};
let mpr: MprHandle | null = null;
let enteringMpr = false;
// Which cell's series the reconstruction was built from. The MPR is a separate
// handle from that cell's stack and covers the whole stage, so blanking the cell
// (its study closed) has to tear the volume down too — see blankCell.
let mprCell = -1;
// Active 3D volume-rendering preset (only meaningful in MPR mode).
const vrPreset = ref<string>(VR_PRESETS[0]);
const activeTool = ref<string>(TOOLS.WindowLevel);
const confirmClearOpen = ref(false);
// Overlay toggle: show full info <-> blur patient data (for demos/screenshots).
const overlayMode = ref<"full" | "private">("full");
const OVERLAY_CYCLE = { full: "private", private: "full" } as const;
const overlayPrivacy = computed(() => overlayMode.value === "private");
const cycleOverlay = () => (overlayMode.value = OVERLAY_CYCLE[overlayMode.value]);

// Mobile controls menu (header hamburger → Controls dropdown).
const menuOpen = ref(false);

// Metadata reader panel (full DICOM tag dump for the active cell's image).
const metaPanelOpen = ref(false);
const metaGroups = ref<MetaGroup[]>([]);
async function openMeta() {
  const i = activeCell.value;
  const id = cellImageIds[i][sliceIndex[i]];
  metaGroups.value = id ? await readMetadataGroups(id) : [];
  metaPanelOpen.value = true;
}

// Per-cell reactive state (index 0..MAX_CELLS-1).
const fill = <T,>(v: T) => Array.from({ length: MAX_CELLS }, () => v);
const seriesIdx = reactive<number[]>(fill(-1));
const sliceIndex = reactive<number[]>(fill(0));
const sliceCount = reactive<number[]>(fill(0));
const wl = reactive<(WindowLevel | null)[]>(fill<WindowLevel | null>(null));
// Normalized DICOM metadata for each cell's current slice, driving the overlay.
const meta = reactive<(ImageMetadata | null)[]>(fill<ImageMetadata | null>(null));
const cellLoading = reactive<boolean[]>(fill(false));
const cinePlaying = reactive<boolean[]>(fill(false));
// Cine speed is per-cell: each grid cell can autoplay at its own fps, so the
// speed dropdown must track the active cell (not a single shared value).
const cineFps = reactive<number[]>(fill(CINE_FPS));
// Object URL of the encapsulated PDF shown in a cell (null = image/empty cell).
const pdfUrl = reactive<(string | null)[]>(fill<string | null>(null));
// Parsed Structured Report shown in a cell (null = not an SR cell).
const srTree = reactive<(SrTree | null)[]>(fill<SrTree | null>(null));
// Background warm-up (stackPrefetch) progress per cell, driving the top loader bar.
const prefetchLoaded = reactive<number[]>(fill(0));
const prefetchTotal = reactive<number[]>(fill(0));

// Per-cell non-reactive handles.
const els: (HTMLDivElement | null)[] = fill(null);
const stacks: (StackHandle | null)[] = fill(null);
const cellImageIds: string[][] = Array.from({ length: MAX_CELLS }, () => []);
// seriesInstanceUID -> the imageIds the viewer actually resolved for it. Keyed by
// series and scoped to the session, NOT to whichever cell happens to show it now:
// a user can measure a series, scroll a different one into that cell, and the
// measurement still belongs to the first. Dropped only when its study closes.
const loadedImageIds = new Map<string, string[]>();
const tokens = fill(0);

/**
 * Clear one cell back to "empty": its series is gone, so drop the stack, the
 * per-cell reactive state and any report view. The grid already renders an
 * empty-cell placeholder for seriesIdx === -1.
 */
function blankCell(i: number) {
  // Invalidate any in-flight load for this cell (same guard loadIntoCell uses).
  tokens[i]++;
  // The MPR is a second handle rendering this cell's series over the whole stage,
  // and nothing else drops it (exitMpr is only reachable from setLayout/onMprError).
  // Left alone it would keep displaying — and captureJpeg would keep exporting —
  // the closed study's reconstruction long after the rail forgot the study.
  if (layoutMode.value === "mpr" && mprCell === i) exitMpr();
  stopCine(i);
  clearPdf(i);
  // Destroy, don't just forget: the handle owns this cell's viewport on the shared
  // rendering engine, and its canvas keeps painting the last rendered slice. The
  // empty-cell placeholder is a transparent chip, so a leaked viewport would leave
  // the *closed study's image* on screen. ensureStack() rebuilds a fresh handle on
  // the next load into this cell.
  stacks[i]?.destroy();
  stacks[i] = null;
  cellImageIds[i] = [];
  seriesIdx[i] = -1;
  sliceIndex[i] = 0;
  sliceCount[i] = 0;
  wl[i] = null;
  meta[i] = null;
  cellLoading[i] = false;
  prefetchLoaded[i] = 0;
  prefetchTotal[i] = 0;
  imageVersion.value++;
}

/**
 * Re-point every cell at the same *series* after `series.value` is reordered or
 * filtered. seriesIdx holds positional indices, and newest-first ordering moves
 * series on add as well as on close — so both paths must translate
 * index -> UID -> new index. Cells whose series is gone are blanked.
 */
function remapCells(prev: SeriesSummary[], next: SeriesSummary[]) {
  // null marks "this cell was already empty"; a cell pointing at a series that
  // isn't in `prev` (shouldn't happen, but the arrays are independent) yields ""
  // and is treated as gone rather than silently kept at a stale index.
  const before = seriesIdx.map((i) => (i >= 0 ? (prev[i]?.seriesInstanceUID ?? "") : null));
  const pos = new Map(next.map((s, i) => [s.seriesInstanceUID, i]));
  for (let c = 0; c < MAX_CELLS; c++) {
    const uid = before[c];
    if (uid === null) continue; // cell was already empty
    const at = pos.get(uid);
    if (at == null) blankCell(c);
    else seriesIdx[c] = at;
  }
}

// Unsubscribe from the global annotation-change listener (set on mount).
let unsubscribeMeasurements: (() => void) | null = null;
// Annotation undo/redo: stack-change subscription + Cornerstone event wiring teardown.
let unsubscribeHistory: (() => void) | null = null;
let stopHistory: (() => void) | null = null;

// Which cells are on screen: in single view only the focused cell shows (so it
// fills the stage); otherwise the first `cellCount` cells. Cells beyond that are
// display:none and excluded from the CSS grid's auto-flow.
const isVisible = (i: number) =>
  cellCount.value === 1 ? i === activeCell.value : i < cellCount.value;
// Flat indices of every series on screen (not just the active cell) — the rail
// keeps a group expanded when it holds one of these.
const displayedSeriesIdx = computed(() => seriesIdx.filter((si, c) => si >= 0 && isVisible(c)));
const gridClass = computed(
  () => `grid--n${cellCount.value}${gridStacked.value ? " grid--n2-stacked" : ""}`,
);

// Refresh the overlay metadata for a cell from its current slice's imageId.
// Best-effort + race-guarded: a late resolve is dropped if the slice moved on.
async function refreshMeta(i: number) {
  const id = cellImageIds[i][sliceIndex[i]];
  if (!id) {
    meta[i] = null;
    return;
  }
  try {
    const m = await readImageMetadata(id);
    if (cellImageIds[i][sliceIndex[i]] === id) meta[i] = m;
  } catch {
    /* metadata is best-effort — never block rendering on it */
  }
}

const setEl = (i: number, el: unknown) => (els[i] = (el as HTMLDivElement) ?? null);

const activeModality = computed(() => series.value[seriesIdx[activeCell.value]]?.modality ?? "");
const canCine = computed(() => sliceCount[activeCell.value] > 1);
const canDownload = computed(
  () => !!props.source.capabilities.downloadArchive && !!props.source.downloadArchive,
);
// Branch on the advertised capability, never on backend type.
const canAddStudy = computed(
  () =>
    !!props.source.capabilities?.multiStudy &&
    !!props.source.capabilities?.studySearch &&
    typeof props.source.searchStudies === "function",
);
const addStudyOpen = ref(false);

async function onPickStudy(uid: string) {
  addStudyOpen.value = false;
  // Record it as picker-owned BEFORE the fetch: a prop write landing mid-flight
  // must not be able to treat it as a study the host dropped. Skipped when the
  // prop already names it — then the host owns it and always has.
  if (!openStudyUids.value.includes(uid) && !(props.studyUids ?? []).includes(uid)) {
    pickedStudyUids.add(uid);
  }
  await addStudies([uid]);
}
// Slice export needs a rendered image stack. Report/SR/PDF and empty cells never
// set a positive sliceCount, so this is false for them (same signal as canCine).
const canDownloadImage = computed(() => sliceCount[activeCell.value] > 0);
// Bumped on annotation create/modify/remove (Cornerstone mutations don't trip Vue
// reactivity) so the export gate re-evaluates and the button shows/hides live.
const annotationVersion = ref(0);
const canExportMeasurements = computed(() => {
  void annotationVersion.value; // reactive dependency
  return canDownloadImage.value && collectMeasurements().length > 0;
});
// Bumped whenever the undo/redo stacks change (the controller lives outside Vue),
// so the toolbar buttons enable/disable live.
const historyVersion = ref(0);
const canUndo = computed(() => {
  void historyVersion.value;
  return annotationHistory.canUndo();
});
const canRedo = computed(() => {
  void historyVersion.value;
  return annotationHistory.canRedo();
});
// Offer MPR only for a volume-capable active series (multi-slice cross-sectional).
// Report/SR/PDF cells and short/odd series are excluded. While in MPR, stay true.
const canMpr = computed(() => {
  if (layoutMode.value === "mpr") return true;
  const i = activeCell.value;
  const s = series.value[seriesIdx[i]];
  if (!s || pdfUrl[i] || srTree[i]) return false;
  return isVolumeCapable(s, sliceCount[i], { min: MIN_MPR_SLICES });
});
// Top loader bar follows the active cell: visible only while its multi-frame
// series is still warming (some frames not yet cached).
const caching = computed(() => {
  const i = activeCell.value;
  return prefetchTotal[i] > 1 && prefetchLoaded[i] < prefetchTotal[i];
});
const cachePct = computed(() => {
  const i = activeCell.value;
  return prefetchTotal[i] > 0 ? Math.round((prefetchLoaded[i] / prefetchTotal[i]) * 100) : 0;
});
const cellLabel = (i: number) => {
  const s = series.value[seriesIdx[i]];
  return s ? s.seriesDescription || s.modality || "" : "";
};
const onActive = (fn: (s: StackHandle) => void) => {
  const s = stacks[activeCell.value];
  if (s) fn(s);
};

// Undo/redo mutate the (global) Cornerstone annotation state inside the history
// controller, then we redraw every live cell's overlay and nudge the export gate
// (programmatic add/remove doesn't emit the COMPLETED/REMOVED events the gate
// listens to — same reason doClearAnnotations bumps it).
function refreshAllAnnotations() {
  for (const s of stacks) s?.refreshAnnotations();
  annotationVersion.value++;
}
function onUndo() {
  if (annotationHistory.undo()) refreshAllAnnotations();
}
function onRedo() {
  if (annotationHistory.redo()) refreshAllAnnotations();
}
// A per-annotation × was clicked. Delete through core (recorded as an undoable
// delete via ANNOTATION_REMOVED), then redraw every cell's overlay + nudge the
// export/overlay gate — same path as undo/redo.
function onDeleteAnnotation(uid: string) {
  deleteAnnotation(uid);
  refreshAllAnnotations();
}

// Key-image flagging: a session-level map of imageId -> context (image ids are
// globally unique). Captured at flag time so export doesn't depend on what's
// still loaded. Reset when a new series set loads (see applyInitialLayout).
const keyImages = reactive(new Map<string, KeyImage>());
// cellImageIds is non-reactive; bumped on (re)load so currentImageId recomputes.
// sliceIndex/activeCell are reactive and cover scroll + cell switches.
const imageVersion = ref(0);
const currentImageId = computed(() => {
  void imageVersion.value;
  return cellImageIds[activeCell.value]?.[sliceIndex[activeCell.value]] ?? "";
});
const isCurrentKeyImage = computed(
  () => !!currentImageId.value && keyImages.has(currentImageId.value),
);
const keyImageCount = computed(() => keyImages.size);

function toggleKeyImage() {
  const i = activeCell.value;
  const imageId = cellImageIds[i]?.[sliceIndex[i]];
  if (!imageId) return;
  if (keyImages.has(imageId)) {
    keyImages.delete(imageId);
    return;
  }
  const s = series.value[seriesIdx[i]];
  keyImages.set(imageId, {
    imageId,
    seriesInstanceUID: s?.seriesInstanceUID ?? "",
    seriesDescription: s?.seriesDescription ?? "",
    modality: s?.modality ?? "",
    sliceIndex: sliceIndex[i],
  });
}

function onExportKeyImages() {
  if (!keyImages.size) return;
  const s = series.value[seriesIdx[activeCell.value]];
  const desc = sanitizeName(s?.seriesDescription || s?.modality || "keyimages");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const blob = new Blob([keyImagesToJson([...keyImages.values()])], { type: "application/json" });
  triggerBlobDownload(blob, `${desc}_keyimages_${stamp}.json`);
}

// SR upload (STOW-RS): available when the source advertises store support and
// there are measurements on a rendered image stack to encode.
const confirmUploadSrOpen = ref(false);
const srUploadBusy = ref(false);
const srUploadMsg = ref<string | null>(null);
const canUploadSr = computed(() => {
  void annotationVersion.value;
  return (
    canDownloadImage.value &&
    props.source.capabilities.store === true &&
    typeof props.source.storeInstances === "function" &&
    collectMeasurements().length > 0
  );
});
function closeUploadSr() {
  confirmUploadSrOpen.value = false;
  srUploadMsg.value = null;
}
// DICOM-SEG: list the active series' segmentations and toggle each on/off as a
// labelmap over the active cell's stack. Rendering requires a real WebGL viewport.
const shownSegs = reactive(new Set<string>());
const segmentations = computed<SegmentationInstance[]>(() => {
  void imageVersion.value;
  const s = series.value[seriesIdx[activeCell.value]];
  return (s && props.source.listSegmentations?.(s)) || [];
});
async function toggleSegmentation(seg: SegmentationInstance) {
  const stack = stacks[activeCell.value];
  if (!stack || !props.source.getSegmentation) return;
  const segId = `seg-${seg.sopUid}`;
  if (shownSegs.has(seg.sopUid)) {
    stack.hideSegmentation(segId);
    shownSegs.delete(seg.sopUid);
    return;
  }
  const s = series.value[seriesIdx[activeCell.value]];
  if (!s) return;
  try {
    const data = await props.source.getSegmentation(s, seg);
    if (await stack.showSegmentation(data, segId)) shownSegs.add(seg.sopUid);
  } catch {
    /* leave the toggle off — a real failure surfaces in the console/network tab */
  }
}

// --- Multi-study session ----------------------------------------------------
// Studies can be added and closed mid-session. `series.value` stays a single flat
// list ordered newest-study-first (orderStudyGroups), so every mutation moves the
// positional indices seriesIdx holds — remapCells re-points the cells by UID.
const openStudyUids = ref<string[]>([]);

/** Single writer for the open set, so hosts binding v-model:study-uids see add
 *  and close from the built-in affordances too — not only their own prop. */
function setOpenStudies(uids: string[]) {
  openStudyUids.value = uids;
  emit("update:studyUids", uids);
}

// Study uids whose getSeries() is in flight. The idempotence guard has to consult
// this as well as openStudyUids: the latter is only written *after* the fetch
// resolves, so two prop changes in the same tick would otherwise both get past it
// and merge the same study's block twice.
const pendingStudyUids = new Set<string>();

// Studies opened from the built-in picker, which `studyUids` never named. The
// close pass reads "absent from the prop" as "the host dropped it" — true for a
// study the prop once carried, but a picker-opened one was never there, so an
// uncontrolled host (one that binds :study-uids and ignores update:studyUids, as
// the demo does) would silently destroy it, with its measurements and no confirm,
// on its very next prop write — the watcher fires on identity, not content.
// Ownership transfers to the host the moment its prop does name the study.
const pickedStudyUids = new Set<string>();

/**
 * Load one or more studies into the session, as a single source round trip. A
 * user-initiated single-study add (the study picker) calls `addStudies([uid])`.
 *
 * Deliberately NOT applyInitialLayout() unless the session is empty: that resets
 * annotation history, clears key images and segmentation toggles and re-runs the
 * hanging protocol — right on mount, destructive mid-session. Adding to a live
 * session preserves annotations, key images, window/level, cellCount and
 * activeCell; only array positions move, which remapCells absorbs.
 */
async function addStudies(uids: string[], initial = false) {
  const want: string[] = [];
  for (const uid of uids) {
    if (!uid || openStudyUids.value.includes(uid) || pendingStudyUids.has(uid)) continue;
    if (!want.includes(uid)) want.push(uid); // a repeated uid is one study
  }
  // The bootstrap load hits the source even with no uids: `studyUids` is optional,
  // and a local-file or single-study backend ignores the argument and returns
  // whatever it holds. Only while the session is genuinely unclaimed, though —
  // the watcher can beat onMounted (a prop change, or just a parent re-render
  // passing a fresh array literal, during Cornerstone init), and then an empty
  // getSeries([]) means "every study you have" to DicomJson/Local. Those extra
  // studies would merge into the rail while `want` leaves openStudyUids empty,
  // so the close pass — which only iterates openStudyUids — could never remove
  // them: another patient's series, stuck in the rail for the session.
  const unclaimed = !openStudyUids.value.length && !pendingStudyUids.size && !series.value.length;
  if (!want.length && !(initial && unclaimed)) return;
  for (const uid of want) pendingStudyUids.add(uid);
  let added: SeriesSummary[];
  try {
    added = await props.source.getSeries(want);
  } finally {
    // Cleared here, and the merge below runs synchronously from this point, so no
    // other task can observe a uid as neither pending nor open.
    for (const uid of want) pendingStudyUids.delete(uid);
  }
  // "Empty session", not "no cell is hung": a viewer can hold an open study with
  // key images while every cell happens to be blank (its series was swapped out,
  // then its study closed). Re-hanging then would silently destroy that work.
  // Read after the fetch but before the merge, so it describes the session we are
  // actually adding to — not the one that existed when the request went out.
  const wasEmpty = !series.value.length;
  // A source that ignores the uid argument can hand back series the session
  // already holds; merging a block twice would duplicate rail rows and leave
  // remapCells pointing cells at the second copy.
  const have = new Set(series.value.map((s) => s.seriesInstanceUID));
  const fresh = added.filter((s) => !have.has(s.seriesInstanceUID));
  if (fresh.length) {
    const prev = series.value;
    const next = orderStudyGroups([...prev, ...fresh]);
    remapCells(prev, next);
    series.value = next;
  }
  setOpenStudies([...openStudyUids.value, ...want]);
  // Nothing was on screen (mounted, or every study since closed), so there is no
  // user work to preserve — hang the new set rather than leaving the stage blank
  // until the user clicks a rail row.
  if (wasEmpty && series.value.length) await applyInitialLayout();
  ensureSomethingShown();
}

/**
 * Put something on screen when the session holds series but no visible cell does.
 *
 * Non-destructive on purpose, which is what makes it safe where applyInitialLayout
 * is not: it resets no annotation history, clears no key images or segmentation
 * toggles, and leaves cellCount/activeCell alone — it only fills a cell that is
 * already empty. Without it, replacing study A with study B (mount hangs A, the
 * merge sees a non-empty session so it doesn't hang B, then the close pass blanks
 * A's cell) leaves a black stage: at cellCount === 1 even the "pick a series" chip
 * is suppressed by its own cellCount > 1 guard.
 */
function ensureSomethingShown() {
  if (!series.value.length) return;
  for (let c = 0; c < MAX_CELLS; c++) if (isVisible(c) && seriesIdx[c] >= 0) return;
  void loadIntoCell(activeCell.value, 0);
}

/**
 * Bring the session in line with `props.studyUids`. The ONLY writer of the open
 * set from the prop — mount goes through it too, so an initial load and a
 * mid-session change can never write `series.value` from two directions.
 */
async function syncOpenStudies(initial = false) {
  const want = props.studyUids ?? [];
  await addStudies(
    want.filter((uid) => !openStudyUids.value.includes(uid)),
    initial,
  );
  // Re-read the prop after the await: a host that swaps studies while the first
  // fetch is still in flight must win over the load already on its way, or the
  // study it dismissed stays open (and on mount would replace what it asked for).
  // A host that never passes `studyUids` isn't managing the set — close nothing.
  const latest = props.studyUids;
  if (!latest) return;
  for (const uid of [...openStudyUids.value]) {
    if (latest.includes(uid)) {
      pickedStudyUids.delete(uid); // the host now names it, so the host owns it
      continue;
    }
    if (pickedStudyUids.has(uid)) continue; // picker-opened; the prop never had it
    closeStudy(uid);
  }
}

// props.studyUids is reactive: a host can add or drop studies mid-session. The
// diff is idempotent, so re-entering it (e.g. after our own update:studyUids)
// loads nothing twice. Wrapped so the watcher's (new, old) args can't be mistaken
// for the `initial` flag.
watch(
  () => props.studyUids,
  () => syncOpenStudies(),
);

/**
 * Every imageId the viewer has ever resolved for these series — read from the
 * session-scoped map, not from the cells. A series that was displayed, annotated
 * and then scrolled out of its cell still carries that work, and closing its study
 * must find it.
 */
function loadedImageIdsFor(removed: SeriesSummary[]): Set<string> {
  const ids = new Set<string>();
  for (const s of removed) {
    for (const id of loadedImageIds.get(s.seriesInstanceUID) ?? []) ids.add(id);
  }
  return ids;
}

/** Does anything the user made belong to these series? Key images carry their own
 *  seriesInstanceUID (captured at flag time), so they are matched on that as well
 *  as on imageId — the two agree, but the uid holds even if a reload changed ids. */
function hasUserWork(removed: SeriesSummary[]): boolean {
  const uids = new Set(removed.map((s) => s.seriesInstanceUID));
  const ids = loadedImageIdsFor(removed);
  return (
    [...keyImages.values()].some((k) => ids.has(k.imageId) || uids.has(k.seriesInstanceUID)) ||
    collectMeasurements().some((m) => ids.has(m.imageId))
  );
}

/**
 * Discard the closed study's user work, so a measurement export can never
 * reference a study that is no longer open. History is reset rather than trimmed:
 * AnnotationHistory exposes only reset(), and a partial history that can redo a
 * measurement onto a closed study is worse than none — the same reasoning as
 * doClearAnnotations.
 */
function purgeUserWork(removed: SeriesSummary[]) {
  const uids = new Set(removed.map((s) => s.seriesInstanceUID));
  const ids = loadedImageIdsFor(removed);
  let touched = false;
  for (const m of collectMeasurements()) {
    if (ids.has(m.imageId)) {
      deleteAnnotation(m.annotationUID);
      touched = true;
    }
  }
  // Snapshot before deleting — keyImages is reactive and this mutates it.
  for (const k of [...keyImages.values()]) {
    if (ids.has(k.imageId) || uids.has(k.seriesInstanceUID)) {
      keyImages.delete(k.imageId);
      touched = true;
    }
  }
  if (!touched) return;
  annotationHistory.reset();
  refreshAllAnnotations();
}

/**
 * Forget the closed study's segmentation toggles. `shownSegs` is keyed by SOP
 * Instance UID, not series UID, so the only way back to the right keys is to
 * re-list each removed series through the same source call that produced them.
 * Rebuilding the set from the `segmentations` computed would be wrong: that only
 * covers the ACTIVE cell's series, so it would drop toggles that belong to studies
 * which are still open.
 */
function dropSegmentationsFor(removed: SeriesSummary[]) {
  if (!shownSegs.size) return;
  for (const s of removed) {
    for (const seg of props.source.listSegmentations?.(s) ?? []) shownSegs.delete(seg.sopUid);
  }
}

function closeStudy(uid: string) {
  const removed = series.value.filter((s) => s.studyInstanceUID === uid);
  if (!removed.length) {
    // Open, but the source returned no series for it. Still drop it from the open
    // set, so a host's v-model converges instead of re-requesting it forever.
    if (openStudyUids.value.includes(uid)) {
      setOpenStudies(openStudyUids.value.filter((u) => u !== uid));
    }
    return;
  }
  const prev = series.value;
  const next = prev.filter((s) => s.studyInstanceUID !== uid);
  purgeUserWork(removed);
  dropSegmentationsFor(removed);
  remapCells(prev, next);
  series.value = next;
  for (const s of removed) loadedImageIds.delete(s.seriesInstanceUID);
  pickedStudyUids.delete(uid);
  thumbnails.release(removed.map((s) => s.seriesInstanceUID));
  setOpenStudies(openStudyUids.value.filter((u) => u !== uid));
  ensureSomethingShown();
}

const confirmCloseUid = ref<string | null>(null);

/**
 * Which study the close confirm is about, in the same identity line the rail's
 * group header shows (date · description · patient). With two patients open at
 * once — the whole point of this feature — an unnamed destructive confirm is the
 * wrong affordance. Composed alongside the existing message rather than
 * interpolated into it, so no locale string changes shape.
 */
const confirmCloseLabel = computed(() => {
  const uid = confirmCloseUid.value;
  if (!uid) return "";
  const st = series.value.find((s) => s.studyInstanceUID === uid)?.study;
  const who = st?.patientName || st?.patientId || "";
  return [formatDicomDate(st?.studyDate), st?.studyDescription, who].filter(Boolean).join(" · ");
});

/** Close is destructive, so it asks first — but only when there is something to
 *  lose. Dismissing a prior you merely glanced at stays frictionless. */
function onCloseStudy(uid: string) {
  const removed = series.value.filter((s) => s.studyInstanceUID === uid);
  if (hasUserWork(removed)) confirmCloseUid.value = uid;
  else closeStudy(uid);
}

function doCloseStudy() {
  const uid = confirmCloseUid.value;
  confirmCloseUid.value = null;
  if (uid) closeStudy(uid);
}

// --- AI & Results (Phase 1) -------------------------------------------------
// A right-dock panel imports an AIResultSet (JSON) and applies its accepted +
// visible results to the active cell: measurements become real Cornerstone
// annotations, segmentations render as labelmap overlays. Gated by the
// features.aiResults deployment toggle; the panel and toolbar button only exist
// when it's on.
const aiResultsEnabled = computed(() => props.features?.aiResults === true);
const aiPanelOpen = ref(false);
const aiResultSet = ref<AIResultSet | null>(null);
// User-visible import error (mirrors the srUploadMsg pattern). Set on a failed
// import, cleared on the next successful one; bound to the panel's `error` prop.
const aiImportMsg = ref<string | null>(null);
// Handles (annotation UIDs + segmentation ids) the last apply added — removed
// before every re-apply so accept/reject/toggle re-derive the on-screen state
// from the (mutated) set, instead of leaking duplicate/stale representations.
let aiApplied: { annotationUids: string[]; segmentationIds: string[] } = {
  annotationUids: [],
  segmentationIds: [],
};

// Build the apply context from the SAME active-cell state the segmentation path
// uses: the live viewport's id (getViewport().id — as AnnotationOverlay reads it)
// and the active cell's image ids, each paired with its SOP Instance UID (needed
// to align imported SEG labelmaps to the right slices — see seg/align.ts).
async function buildAiCtx(): Promise<{
  viewportId: string;
  stack: { imageId: string; sopInstanceUID: string }[];
}> {
  const i = activeCell.value;
  const viewportId = stacks[i]?.getViewport()?.id ?? "";
  const ids = cellImageIds[i] ?? [];
  const stack = await Promise.all(
    ids.map(async (imageId) => ({
      imageId,
      sopInstanceUID: (await readImageMetadata(imageId)).sopInstanceUID ?? "",
    })),
  );
  return { viewportId, stack };
}

// Re-apply the current set from scratch: drop the previously-injected annotations,
// then add back the accepted + visible ones. Keeps the viewport in sync after any
// accept/reject/visibility change without tracking per-result annotation identity.
async function reapplyAi() {
  const ctx = await buildAiCtx();
  removeApplied(aiApplied.annotationUids);
  removeAppliedSegmentations(aiApplied.segmentationIds);
  aiApplied = aiResultSet.value
    ? await applyResultSet(aiResultSet.value, ctx)
    : { annotationUids: [], segmentationIds: [] };
}
async function onAiImport(file: File) {
  // All-or-nothing: parse+validate BEFORE mutating any state, so a bad file
  // surfaces a visible error and leaves the prior result set intact (no partial
  // state, no unhandled rejection).
  let parsed: AIResultSet;
  try {
    parsed = importResults(await file.text());
  } catch (e) {
    aiImportMsg.value = e instanceof ImportError ? e.reason : String(e);
    return;
  }
  aiImportMsg.value = null;
  aiResultSet.value = parsed;
  await reapplyAi();
}
function onAiReject(id: string) {
  const r = aiResultSet.value?.results.find((x) => x.id === id);
  if (r) {
    r.reviewStatus = "rejected";
    void reapplyAi();
  }
}
function onAiAccept(id: string) {
  const r = aiResultSet.value?.results.find((x) => x.id === id);
  if (r) {
    r.reviewStatus = "accepted";
    void reapplyAi();
  }
}
function onAiToggle(id: string) {
  const r = aiResultSet.value?.results.find((x) => x.id === id);
  if (r) {
    r.visible = !r.visible;
    void reapplyAi();
  }
}
function onAiExport(format: "json" | "csv" | "ai-json") {
  if (!aiResultSet.value) return;
  const text = exportAccepted(aiResultSet.value, format);
  const blob = new Blob([text], { type: format === "csv" ? "text/csv" : "application/json" });
  triggerBlobDownload(blob, `orbidicom-ai.${format === "csv" ? "csv" : "json"}`);
}

async function doUploadSr() {
  if (srUploadBusy.value) return;
  srUploadBusy.value = true;
  try {
    const sr = buildMeasurementSr(collectMeasurements());
    const part10 = dicomJsonToPart10(sr as Record<string, { vr: string; Value?: unknown[] }>);
    const res = await props.source.storeInstances!([part10], { studyUid: activeStudyUid() });
    srUploadMsg.value = res.failed.length
      ? `${t("srUploadFailed")} (${res.failed.length})`
      : t("srUploaded");
  } catch {
    srUploadMsg.value = t("srUploadFailed");
  } finally {
    srUploadBusy.value = false;
  }
}

function ensureStack(i: number): StackHandle {
  if (!stacks[i]) {
    stacks[i] = createStack(els[i]!, {
      onSlice: ({ index, count }) => {
        sliceIndex[i] = index;
        sliceCount[i] = count;
        void refreshMeta(i);
      },
      onVoi: (v) => (wl[i] = v),
      onReady: () => (cellLoading[i] = false),
      onPrefetch: ({ loaded, total }) => {
        prefetchLoaded[i] = loaded;
        prefetchTotal[i] = total;
      },
    });
  }
  return stacks[i]!;
}

async function loadIntoCell(i: number, si: number) {
  const token = ++tokens[i];
  const s = series.value[si];
  if (!s) return;
  seriesIdx[i] = si;
  stopCine(i);
  cellLoading[i] = true;
  // Watchdog: never leave the spinner up forever on a stuck/huge series.
  const watchdog = window.setTimeout(() => {
    if (tokens[i] === token) cellLoading[i] = false;
  }, LOAD_TIMEOUT_MS);

  let imageIds: string[];
  try {
    imageIds = await props.source.getImageIds(s);
  } catch {
    if (tokens[i] === token) cellLoading[i] = false;
    clearTimeout(watchdog);
    return;
  }
  if (token !== tokens[i]) {
    clearTimeout(watchdog);
    return;
  }
  clearPdf(i);
  cellImageIds[i] = imageIds;
  loadedImageIds.set(s.seriesInstanceUID, imageIds);
  sliceCount[i] = imageIds.length;
  // The series-list count is a pre-fetch estimate (e.g. QIDO instance count),
  // which under-reports multi-frame series where one instance yields many frames
  // (PET/CT, NM, cine). Now that the frames are resolved, reconcile the rail count
  // to what actually loaded. Image series only — leave report/PDF series (0 images).
  if (imageIds.length && s.numberOfFrames !== imageIds.length) {
    s.numberOfFrames = imageIds.length;
  }
  sliceIndex[i] = 0;
  imageVersion.value++; // cellImageIds is non-reactive; signal current-image consumers

  try {
    if (imageIds.length) {
      // The single choke point for viewport creation: applyInitialLayout,
      // selectSeries and ensureSomethingShown all funnel through here, and the
      // studyUids watcher can reach any of them before Cornerstone is ready.
      await csReady;
      // csReady is a new suspension point, so re-check the load token before
      // building anything into a cell that may have been blanked meanwhile.
      if (token !== tokens[i]) return;
      await ensureStack(i).setStack(imageIds);
      void refreshMeta(i);
    } else {
      // No images — a report series (encapsulated PDF or Structured Report) or
      // other non-image series. Render the first report the source exposes.
      await maybeShowReport(i, s, token);
    }
  } finally {
    clearTimeout(watchdog);
    if (token === tokens[i]) cellLoading[i] = false;
  }
}

// Render the active series' first report document (PDF or SR), if the source
// supports it. The report list is populated by the getImageIds() call that just
// ran for this series. (Multiple reports / mixed image+report series — render-all
// — is a later enhancement; this shows the first.)
async function maybeShowReport(i: number, s: SeriesSummary, token: number) {
  const src = props.source;
  // Prefer the generalized report surface; fall back to the legacy PDF-only one.
  const reports =
    src.listReports?.(s) ??
    (src.listPdfs?.(s) ?? []).map((p) => ({
      sopUid: p.sopUid,
      kind: "pdf" as const,
      bulkDataUri: p.bulkDataUri,
    }));
  const report = reports[0];
  if (!report) return;
  try {
    if (report.kind === "pdf" && src.getPdfObjectUrl) {
      const url = await src.getPdfObjectUrl(s, {
        sopUid: report.sopUid,
        bulkDataUri: report.bulkDataUri ?? null,
      });
      if (token === tokens[i]) pdfUrl[i] = url;
      else URL.revokeObjectURL(url); // a newer load won — drop this one
    } else if (report.kind === "sr" && src.getStructuredReport) {
      const tree = await src.getStructuredReport(s, report);
      if (token === tokens[i]) srTree[i] = tree;
    }
  } catch {
    /* leave the cell empty on failure */
  }
}

function clearPdf(i: number) {
  if (pdfUrl[i]) {
    URL.revokeObjectURL(pdfUrl[i]!);
    pdfUrl[i] = null;
  }
  srTree[i] = null;
}

const selectSeries = (si: number) => loadIntoCell(activeCell.value, si);

function onSlider(e: Event) {
  const target = Number((e.target as HTMLInputElement).value);
  stacks[activeCell.value]?.setIndex(target);
}

function toggleCine() {
  const i = activeCell.value;
  if (!stacks[i] || !canCine.value) return;
  if (cinePlaying[i]) {
    stacks[i]!.stopCine();
    cinePlaying[i] = false;
  } else {
    stacks[i]!.playCine(cineFps[i]);
    cinePlaying[i] = true;
  }
}
// Change the active cell's cine speed; if it's playing, restart it at the new fps.
function setSpeed(fps: number) {
  const i = activeCell.value;
  cineFps[i] = fps;
  if (cinePlaying[i] && stacks[i]) {
    stacks[i]!.stopCine();
    stacks[i]!.playCine(fps);
  }
}
function stopCine(i: number) {
  if (cinePlaying[i]) {
    stacks[i]?.stopCine();
    cinePlaying[i] = false;
  }
}

function setLayout(n: number | "mpr" | "2v") {
  if (n === "mpr") {
    if (layoutMode.value !== "mpr") void enterMpr(); // re-entry guard
    return;
  }
  if (layoutMode.value === "mpr") exitMpr(); // leaving MPR for a normal grid
  // "2v" is the stacked (2×1) variant of the 2-cell grid; every other choice is a
  // plain cell count and clears the stacked flag.
  const stacked = n === "2v";
  const count = stacked ? 2 : n;
  if (!VALID_LAYOUTS.has(count)) return;
  gridStacked.value = stacked;
  cellCount.value = count;
  // Keep the focused cell within the visible range when shrinking the grid.
  if (count > 1 && activeCell.value >= count) activeCell.value = 0;
  // Stop cine on any cell that just became hidden.
  for (let i = 0; i < MAX_CELLS; i++) if (!isVisible(i)) stopCine(i);
}

// Build a 3-plane MPR from the active series. The grid (and its stacks) stay
// mounted but hidden, so exitMpr() restores the stack view instantly.
async function enterMpr() {
  if (enteringMpr || mpr) return;
  const i = activeCell.value;
  const ids = cellImageIds[i];
  if (ids.length < MIN_MPR_SLICES) return;
  enteringMpr = true;
  mprCell = i;
  stopCine(i);
  mprReady.value = false;
  layoutMode.value = "mpr";
  await nextTick(); // let the MPR panes mount so their refs populate
  const { axial, coronal, sagittal, volume3d } = mprEls;
  if (!axial.value || !coronal.value || !sagittal.value || !volume3d.value) {
    enteringMpr = false;
    return;
  }
  const modality = series.value[seriesIdx[i]]?.modality;
  vrPreset.value = defaultVrPreset(modality);
  mpr = createMprView(
    {
      axial: axial.value,
      coronal: coronal.value,
      sagittal: sagittal.value,
      volume3d: volume3d.value,
    },
    {
      onReady: () => (mprReady.value = true),
      onVoi: (v) => (wl[i] = v),
      onError: onMprError,
    },
  );
  await mpr.setVolume(ids, { modality });
  enteringMpr = false;
}

// Switch the 3D pane's volume-rendering preset (CT-Bone, CT-Soft-Tissue, …).
function onVrPreset(name: string) {
  vrPreset.value = name;
  mpr?.setPreset(name);
}

function exitMpr() {
  mpr?.destroy();
  mpr = null;
  mprCell = -1;
  mprReady.value = false;
  layoutMode.value = "grid";
}

function onMprError(e: unknown) {
  console.warn("[viewer] MPR reconstruction failed", e);
  exitMpr();
}

// W/L presets and Reset route to whichever view is active.
const applyPreset = (p: { windowWidth: number; windowCenter: number }) =>
  layoutMode.value === "mpr"
    ? mpr?.setWindowLevel(p.windowWidth, p.windowCenter)
    : onActive((s) => s.setWindowLevel(p.windowWidth, p.windowCenter));
const onReset = () => (layoutMode.value === "mpr" ? mpr?.reset() : onActive((s) => s.reset()));
const selectTool = (name: string) => {
  setPrimaryTool(name);
  activeTool.value = name;
};
// removeAllAnnotations() (inside the handle) is global, so refresh every live
// cell's overlay — not just the active one — to wipe their SVG too.
function doClearAnnotations() {
  confirmClearOpen.value = false;
  for (const s of stacks) s?.clearAnnotations();
  // Clear-all is a deliberate bulk action, not an undoable step — drop the history.
  annotationHistory.reset();
  // removeAllAnnotations() doesn't emit per-annotation events, so nudge the gate.
  annotationVersion.value++;
}

function activeStudyUid(): string {
  // Fall back to what is actually open, not to the prop: after a close the prop's
  // first entry can name a study this session no longer holds.
  return (
    series.value[seriesIdx[activeCell.value]]?.studyInstanceUID ?? openStudyUids.value[0] ?? ""
  );
}
function onDownloadStudy() {
  void Promise.resolve(props.source.downloadArchive?.(activeStudyUid())).catch((e) =>
    console.warn("[viewer] study archive download failed", e),
  );
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on a later macrotask — revoking too eagerly (e.g. on the next frame)
  // can cancel the download mid-flight in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// Strip characters that are invalid in filenames across platforms.
const sanitizeName = (s: string) => s.replace(/[\\/:*?"<>|]/g, "_");

// Save the active slice (image + measurements, no metadata overlay) as a JPEG.
function onDownloadImage() {
  const i = activeCell.value;
  const s = series.value[seriesIdx[i]];
  const desc = sanitizeName(s?.seriesDescription || s?.modality || "slice");
  // In MPR mode capture the axial pane; otherwise the active stack slice.
  const capture =
    layoutMode.value === "mpr" ? mpr?.captureJpeg("axial") : stacks[i]?.captureSliceJpeg();
  const fileName =
    layoutMode.value === "mpr" ? `${desc}_mpr_axial.jpg` : `${desc}_${sliceIndex[i] + 1}.jpg`;
  void Promise.resolve(capture)
    .then((blob) => {
      if (blob) triggerBlobDownload(blob, fileName);
    })
    .catch((e) => console.warn("[viewer] slice image download failed", e));
}

// Export the drawn measurements (session-wide — Cornerstone annotation state is
// global) as JSON or CSV. Filename derives from the active series.
function onExportMeasurements(format: "json" | "csv") {
  const measurements = collectMeasurements();
  if (!measurements.length) return;
  const i = activeCell.value;
  const s = series.value[seriesIdx[i]];
  const desc = sanitizeName(s?.seriesDescription || s?.modality || "measurements");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  if (format === "json") {
    const blob = new Blob([measurementsToJson(measurements)], { type: "application/json" });
    triggerBlobDownload(blob, `${desc}_measurements_${stamp}.json`);
  } else {
    const blob = new Blob([measurementsToCsv(measurements)], { type: "text/csv" });
    triggerBlobDownload(blob, `${desc}_measurements_${stamp}.csv`);
  }
}

// Built-in shortcuts, with any host overrides merged on top.
const keymap = computed(() => ({ ...DEFAULT_KEYMAP, ...props.keymap }));

// Don't hijack keys while the user is typing in a field or operating a control.
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
}

function onKeydown(e: KeyboardEvent) {
  if (isTypingTarget(e.target)) return;
  // Undo/redo first: resolveHotkey deliberately ignores Ctrl/Cmd, so these
  // (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y) are handled explicitly here.
  const edit = resolveEditCommand(e);
  if (edit) {
    e.preventDefault();
    if (edit.kind === "undo") onUndo();
    else onRedo();
    return;
  }
  const cmd = resolveHotkey(e, keymap.value);
  if (!cmd) return;
  const applyPresetHotkey = () => {
    // Digit keys apply the Nth window preset for the active modality
    // (CT ships five; other modalities only if a host registered them).
    const p = windowPresetsFor(activeModality.value)[cmd.kind === "preset" ? cmd.index : 0];
    if (p) applyPreset(p);
  };
  // In MPR mode the stack is hidden; only the commands that route to the volume
  // (presets + reset) apply. Ignore the stack-only ones so keys don't silently
  // act on the hidden grid.
  if (layoutMode.value === "mpr") {
    if (cmd.kind === "preset") applyPresetHotkey();
    else if (cmd.kind === "reset") onReset();
    else return;
    e.preventDefault();
    return;
  }
  const s = stacks[activeCell.value];
  switch (cmd.kind) {
    case "tool":
      selectTool(TOOLS[cmd.tool]);
      break;
    case "invert":
      s?.invert();
      break;
    case "rotate":
      s?.rotate();
      break;
    case "flipH":
      s?.flipH();
      break;
    case "reset":
      s?.reset();
      break;
    case "cine":
      toggleCine();
      break;
    case "scroll":
      s?.scroll(cmd.delta);
      break;
    case "keyImage":
      toggleKeyImage();
      break;
    case "preset":
      applyPresetHotkey();
      break;
  }
  e.preventDefault();
}

onMounted(async () => {
  window.addEventListener("keydown", onKeydown);
  unsubscribeMeasurements = onMeasurementsChanged(() => annotationVersion.value++);
  stopHistory = startAnnotationHistory();
  unsubscribeHistory = annotationHistory.subscribe(() => historyVersion.value++);
  await csReady;
  // The initial load is just the first reconciliation: one getSeries() for the
  // whole prop, ordered newest-study-first, hung by the protocol because the
  // session is empty. Going through syncOpenStudies (rather than assigning
  // series.value here) means a host that swaps studies while this is still in
  // flight cannot end up with the mount's result overwriting theirs unremapped.
  await syncOpenStudies(true);
});

// Arrange the loaded series per the hanging protocol (default "single" keeps the
// historical one-cell behavior). Loads each assigned cell; empty cells stay blank.
async function applyInitialLayout() {
  // A fresh series set invalidates any prior annotation history + key-image flags.
  annotationHistory.reset();
  keyImages.clear();
  shownSegs.clear();
  const { cellCount: cc, assignments } = applyHangingProtocol(
    series.value,
    props.hangingProtocol ?? "single",
    { maxCells: MAX_CELLS },
  );
  // A custom protocol is host-supplied, so clamp to a layout the grid actually
  // renders and never load past the fixed-size per-cell state arrays.
  cellCount.value = snapLayout(cc);
  activeCell.value = 0;
  const cells = Math.min(cellCount.value, assignments.length, MAX_CELLS);
  // Resolve the protocol's positional picks to series UIDs before loading any of
  // them. `assignments` is computed once but consumed across awaits, and a
  // concurrent addStudies reorders series.value — remapCells repairs cells that
  // are already loaded, but it cannot touch an index this loop hasn't reached, so
  // a positional replay would hang a different study's series than the protocol
  // chose.
  const picks: (string | null)[] = [];
  for (let c = 0; c < cells; c++) {
    const s = assignments[c] >= 0 ? series.value[assignments[c]] : undefined;
    picks.push(s?.seriesInstanceUID ?? null);
  }
  // Start every cell in the same tick instead of sequentially. loadIntoCell writes
  // seriesIdx synchronously, so this makes `displayedSeriesIdx` complete before
  // Vue's first flush — the rail materializes each study group's collapse default
  // exactly once, at that flush, and a sequential loop left cells >= 1 still empty
  // then, permanently collapsing a study whose only on-screen series was headed
  // for a later cell.
  const pos = new Map(series.value.map((s, i) => [s.seriesInstanceUID, i]));
  await Promise.all(
    picks.map((uid, c) => {
      const si = uid == null ? undefined : pos.get(uid);
      return si == null ? undefined : loadIntoCell(c, si);
    }),
  );
}

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  unsubscribeMeasurements?.();
  unsubscribeHistory?.();
  stopHistory?.();
  annotationHistory.reset();
  mpr?.destroy();
  mpr = null;
  thumbnails.destroy();
  for (let i = 0; i < MAX_CELLS; i++) {
    tokens[i]++;
    stopCine(i);
    clearPdf(i);
    stacks[i]?.destroy();
    stacks[i] = null;
  }
});
</script>
<style scoped>
.viewer {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  background: var(--bg);
  /* Full-viewport shell: clip any internal overflow here so it can't propagate
     up to the document and turn into a page scroll. Inner regions (rail, panels)
     keep their own scrolling. */
  overflow: hidden;
}
.content {
  display: flex;
  flex: 1;
  min-height: 0;
  /* Positioning context for the floating rail-collapse toggle. */
  position: relative;
}
/* Left panel: the series rail scrolls, the controls dock pins to its bottom. */
.sidebar {
  display: flex;
  flex-direction: column;
  flex: none;
  min-height: 0;
  border-right: 1px solid var(--border);
  /* Collapse animates max-width (desktop) / max-height (mobile); the large
     default never constrains the natural size. */
  max-width: 400px;
  transition:
    max-width 0.2s ease,
    max-height 0.2s ease;
}
.content.rail-collapsed .sidebar {
  max-width: 0;
  border-right: 0;
  overflow: hidden;
}
.sidebar :deep(.rail) {
  flex: 1;
  min-height: 0;
  border-right: 0;
}
/* Floating chevron at the rail/stage boundary. It rides to the far left when the
   rail is collapsed and flips its arrow to point back the other way. */
.rail-toggle {
  position: absolute;
  top: 50%;
  left: 200px;
  transform: translateY(-50%);
  z-index: 6;
  width: 20px;
  height: 40px;
  display: grid;
  place-items: center;
  padding: 0;
  background: var(--panel-2);
  color: var(--muted);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  transition:
    left 0.2s ease,
    background 0.12s,
    color 0.12s;
}
.rail-toggle:hover {
  background: var(--elevated);
  color: var(--text);
}
.rail-toggle__icon {
  width: 14px;
  height: 14px;
  transition: transform 0.2s ease;
}
.content.rail-collapsed .rail-toggle {
  left: 4px;
}
.content.rail-collapsed .rail-toggle__icon {
  transform: rotate(180deg);
}
.segs {
  flex: none;
  padding: 8px 10px;
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--text);
  max-height: 30%;
  overflow: auto;
}
.segs__title {
  color: var(--muted);
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.04em;
  margin-bottom: 6px;
}
.segs__item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 3px 0;
  cursor: pointer;
}
.segs__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stage {
  position: relative;
  flex: 1;
  min-width: 0;
  /* Critical in the mobile column layout: without this the stage refuses to
     shrink below its content (image + cine bar) and the page scrolls. */
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #000;
}

.grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: 1fr;
  gap: 2px;
  background: var(--border);
}
/* Layouts: 1×1, 1×2, 2×2, 2×3, 2×4, 2×5. Hidden cells (display:none) are
   skipped by grid auto-flow, so the visible cells fill the template exactly. */
.grid--n2 {
  grid-template-columns: 1fr 1fr;
}
/* Stacked 2×1 variant of the 2-cell grid: two rows, one column. */
.grid--n2-stacked {
  grid-template-columns: 1fr;
  grid-template-rows: 1fr 1fr;
}
.grid--n4 {
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(2, 1fr);
}
.grid--n6 {
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(2, 1fr);
}
.grid--n8 {
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(2, 1fr);
}
.grid--n10 {
  grid-template-columns: repeat(5, 1fr);
  grid-template-rows: repeat(2, 1fr);
}
/* Hidden (not unmounted) while MPR is active, so the stack engines stay attached. */
.grid--hidden {
  display: none;
}
/* MPR / 3D: three orthographic planes + a volume-rendering pane in a 2×2
   hanging protocol (a single scrolling column on phones). */
.mpr {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: 2px;
  background: var(--border);
}
.mpr__pane {
  position: relative;
  background: #000;
  min-height: 0;
}
/* The 3D pane hosts the Cornerstone canvas plus a floating preset picker. */
.mpr__vr {
  position: absolute;
  inset: 0;
}
.mpr__preset {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.mpr__preset-label {
  font-size: 11px;
  letter-spacing: 0.02em;
  color: var(--muted);
  text-transform: uppercase;
}
.mpr__preset select {
  height: 28px;
  padding: 0 8px;
  border-radius: var(--r-sm);
  background: color-mix(in srgb, var(--elevated) 88%, transparent);
  color: var(--text);
  border: 1px solid var(--border);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.mpr__preset select:focus-visible {
  outline: 2px solid var(--accent-strong);
  outline-offset: 1px;
}
@media (max-width: 640px) {
  .mpr {
    grid-template-columns: 1fr;
    grid-template-rows: repeat(4, 1fr);
    grid-auto-rows: minmax(40vw, 1fr);
    overflow-y: auto;
  }
}
.cell {
  position: relative;
  background: #000;
  overflow: hidden;
  min-height: 0;
}
.cell--hidden {
  display: none;
}
.cell--active {
  outline: 2px solid var(--highlight);
  outline-offset: -2px;
}
.cell:hover :deep(.cs-del-x) {
  opacity: 1;
  pointer-events: auto;
}
.cs-viewport {
  position: absolute;
  inset: 0;
}
.cell__empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  pointer-events: none;
}
.cell__empty-chip {
  max-width: 220px;
  text-align: center;
  line-height: 1.5;
  color: var(--muted);
  font-size: 13px;
  font-family: var(--font);
  padding: 11px 16px;
  border: 1px dashed var(--border);
  border-radius: var(--r-md);
  background: rgba(255, 255, 255, 0.02);
}

.loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(5, 8, 8, 0.55);
}
.spinner {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 3px solid var(--border);
  border-top-color: var(--accent-strong);
  animation: spin 1.1s linear infinite;
}
.loading__text {
  font-size: 12px;
  color: var(--muted);
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Non-blocking warm-up bar: floats over the top of the stage (absolute) so it
   never pushes the viewport down when it shows/hides. A thin progress line hugs
   the very top; the label rides in a centered frosted chip below it, clear of the
   corner metadata overlay so it never occludes the patient/study info. */
.toploader {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 6;
  pointer-events: none;
}
.toploader__track {
  height: 3px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}
.toploader__fill {
  height: 100%;
  background: var(--accent-strong);
  transition: width 0.2s ease;
}
.toploader__meta {
  width: fit-content;
  max-width: min(82%, 460px);
  margin: 10px auto 0;
  display: flex;
  align-items: baseline;
  gap: 4px 10px;
  padding: 6px 13px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  /* Frosted backdrop: blurs whatever is behind so the chip reads as one seamless
     element instead of text floating over pixels. */
  background: color-mix(in srgb, var(--panel) 70%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
  font-family: var(--font);
  font-size: 12px;
  line-height: 1.3;
}
.toploader__label {
  flex: none;
  font-family: var(--mono);
  font-weight: 600;
  color: var(--accent-strong);
}
.toploader__note {
  color: var(--text);
  opacity: 0.82;
  min-width: 0;
}
.toploader-enter-active,
.toploader-leave-active {
  transition: opacity 0.25s ease;
}
.toploader-enter-from,
.toploader-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .toploader__fill,
  .toploader-enter-active,
  .toploader-leave-active {
    transition: none;
  }
}

.slicebar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: var(--panel);
  border-top: 1px solid var(--border);
}
.slicebar__play {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex: none;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  background: var(--elevated);
  color: var(--text);
  cursor: pointer;
  transition:
    color 0.12s,
    border-color 0.12s;
}
.slicebar__play:hover {
  border-color: var(--accent-strong);
}
.slicebar__play.is-playing {
  color: var(--highlight);
  border-color: var(--highlight);
}
.slicebar__play svg {
  width: 16px;
  height: 16px;
}
.slicebar__speed {
  flex: none;
  height: 32px;
  padding: 0 6px;
  border-radius: var(--r-sm);
  background: var(--elevated);
  color: var(--text);
  border: 1px solid var(--border);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.slicebar__count {
  flex: none;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--muted);
  min-width: 54px;
  text-align: right;
}
.slicebar__range {
  flex: 1;
  appearance: none;
  height: 4px;
  border-radius: 3px;
  background: var(--border);
  outline: none;
}
.slicebar__range::-webkit-slider-thumb {
  appearance: none;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: var(--accent-strong);
  cursor: pointer;
  border: 2px solid var(--panel);
}
.slicebar__range::-moz-range-thumb {
  width: 15px;
  height: 15px;
  border: 2px solid var(--panel);
  border-radius: 50%;
  background: var(--accent-strong);
  cursor: pointer;
}

/* In-app confirm dialog. */
.modal {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.55);
}
.modal__card {
  width: 100%;
  max-width: 340px;
  padding: 20px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
}
.modal__subject {
  margin: 0 0 6px;
  color: var(--text);
  font-family: var(--font);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.modal__msg {
  margin: 0 0 18px;
  color: var(--text);
  font-family: var(--font);
  font-size: 14px;
  line-height: 1.45;
}
.modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.modal__btn {
  font: inherit;
  font-size: 13px;
  padding: 8px 15px;
  cursor: pointer;
  border-radius: var(--r-sm);
  border: 1px solid var(--border);
  background: var(--elevated);
  color: var(--text);
}
.modal__btn:hover {
  border-color: var(--accent-strong);
}
.modal__btn--danger {
  background: var(--highlight);
  border-color: var(--highlight);
  color: #fff;
}
.modal__btn--danger:hover {
  background: var(--highlight-strong);
  border-color: var(--highlight-strong);
}
.modal__btn--primary {
  background: var(--accent);
  border-color: var(--accent-strong);
  color: var(--text);
}
.modal__btn--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.modal__card--wide {
  width: min(720px, 92vw);
}

.rail-add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 6px 8px 0;
  padding: 7px 10px;
  border: 1px dashed var(--border);
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.rail-add:hover {
  background: var(--elevated);
  color: var(--text);
}
.rail-add svg {
  width: 13px;
  height: 13px;
}

@media (max-width: 640px) {
  .content {
    flex-direction: column;
  }
  /* Rail becomes a top strip; its dock collapses to a floating hamburger. */
  .sidebar {
    width: 100%;
    border-right: 0;
    /* Full-width strip: drop the desktop width cap and collapse by height. */
    max-width: none;
    max-height: 50vh;
  }
  .content.rail-collapsed .sidebar {
    max-width: none;
    max-height: 0;
    border-bottom: 0;
  }
  .sidebar :deep(.rail) {
    flex: none;
  }
  /* On phones the rail is a top strip, so pin the toggle to the top-right and
     turn its chevron to point up (collapse) / down (expand). */
  .rail-toggle {
    top: 6px;
    left: auto;
    right: 6px;
    transform: rotate(90deg);
  }
  .content.rail-collapsed .rail-toggle {
    left: auto;
    right: 6px;
    transform: rotate(90deg);
  }
  .toploader__meta {
    flex-wrap: wrap;
    max-width: 92%;
    margin-top: 8px;
    padding: 5px 12px;
    gap: 2px 8px;
    font-size: 11px;
  }
  .toploader__note {
    flex-basis: 100%;
  }
  /* Dense grids would be unusably small on a phone: cap columns at 2 and let
     rows flow, so 6/8/10-up become scrollable 2-wide stacks. */
  .grid--n6,
  .grid--n8,
  .grid--n10 {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: none;
    grid-auto-rows: minmax(40vw, 1fr);
    gap: 3px;
    overflow-y: auto;
  }
  .grid--n2,
  .grid--n4 {
    gap: 3px;
  }
  .cell__empty {
    padding: 14px;
  }
  .cell__empty-chip {
    font-size: 12px;
    padding: 9px 13px;
    max-width: 180px;
  }
}
</style>
