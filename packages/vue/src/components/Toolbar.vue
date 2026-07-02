<template>
  <div
    ref="rootEl"
    class="toolbar"
    @pointerover="onTipOver"
    @pointerout="onTipOut"
    @focusin="onTipFocus"
    @focusout="hideTip"
    @scroll.passive="hideTip"
  >
    <!-- Mobile-only: hamburger that toggles the controls menu (language, host
         actions, hint). In normal flow, right before the title. -->
    <button
      v-tip="t('menu')"
      class="toolbar__menu"
      :class="{ 'toolbar__menu--active': menuOpen }"
      :aria-expanded="menuOpen ?? false"
      @click="$emit('toggleMenu')"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      >
        <path v-if="!menuOpen" d="M4 7h16M4 12h16M4 17h16" />
        <path v-else d="M6 6l12 12M18 6 6 18" />
      </svg>
    </button>
    <span class="toolbar__title">{{ title ?? "OrbiDICOM" }}</span>
    <div class="toolbar__sep" />

    <!-- W/L presets only exist for CT; hidden for other modalities. -->
    <template v-if="presets.length">
      <label v-tip="t('presetTitle')" class="wl" @click="openSelect">
        <span class="wl__label">W/L</span>
        <select
          class="wl__select"
          :value="''"
          :aria-label="t('presetTitle')"
          @change="onPreset(($event.target as HTMLSelectElement).value)"
        >
          <option value="" disabled>{{ t("preset") }}</option>
          <option v-for="p in presets" :key="p.name" :value="p.name">{{ p.name }}</option>
        </select>
      </label>
      <div class="toolbar__sep" />
    </template>

    <!-- Active left-button tool (one at a time). -->
    <div class="toolbar__group">
      <button
        v-for="tool in toolButtons"
        :key="tool.name"
        v-tip="{ text: t(tool.titleKey), key: toolHotkey[tool.name] }"
        class="tbtn"
        :class="{ 'tbtn--active': activeTool === tool.name }"
        @click="$emit('tool', tool.name)"
      >
        <!-- eslint-disable-next-line vue/no-v-html -- tool.icon is static, trusted SVG markup defined in this file -->
        <svg viewBox="0 0 24 24" v-html="tool.icon" />
      </button>
      <button
        v-tip="{ text: t('undo'), key: 'Ctrl+Z' }"
        class="tbtn tbtn--undo"
        :disabled="!canUndo"
        @click="$emit('undo')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M7 7 3 11l4 4M3 11h10a6 6 0 0 1 0 12H8" />
        </svg>
      </button>
      <button
        v-tip="{ text: t('redo'), key: 'Ctrl+Shift+Z' }"
        class="tbtn tbtn--redo"
        :disabled="!canRedo"
        @click="$emit('redo')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M17 7l4 4-4 4M21 11H11a6 6 0 0 0 0 12h5" />
        </svg>
      </button>
      <button v-tip="t('clearMeasurements')" class="tbtn" @click="$emit('clearAnnotations')">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
        </svg>
      </button>
    </div>

    <div class="toolbar__sep" />

    <div class="toolbar__group">
      <button
        v-tip="{ text: t('invert'), key: actionHotkey.invert }"
        class="tbtn"
        @click="$emit('invert')"
      >
        <svg viewBox="0 0 24 24">
          <rect
            x="3"
            y="3"
            width="18"
            height="18"
            rx="2"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
          />
          <path d="M3 21 21 3" stroke="currentColor" stroke-width="1.6" />
          <path d="M3 21V3h18z" fill="currentColor" />
        </svg>
      </button>
      <button
        v-tip="{ text: t('rotate'), key: actionHotkey.rotate }"
        class="tbtn"
        @click="$emit('rotate')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v4h-4" />
        </svg>
      </button>
      <button
        v-tip="{ text: t('flip'), key: actionHotkey.flipH }"
        class="tbtn"
        @click="$emit('flipH')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 3v18" />
          <path d="M8 7l-4 5 4 5" />
          <path d="M16 7l4 5-4 5" />
        </svg>
      </button>
      <button
        v-tip="{ text: t('reset'), key: actionHotkey.reset }"
        class="tbtn"
        @click="$emit('reset')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </svg>
      </button>
    </div>

    <div class="toolbar__sep" />

    <!-- Grid layout: 1×1 .. 2×5 (1/2/4/6/8/10 viewports). -->
    <label v-tip="t('layout')" class="layout" @click="openSelect">
      <svg
        class="layout__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
      >
        <rect x="3" y="3" width="8" height="8" rx="1" />
        <rect x="13" y="3" width="8" height="8" rx="1" />
        <rect x="3" y="13" width="8" height="8" rx="1" />
        <rect x="13" y="13" width="8" height="8" rx="1" />
      </svg>
      <select
        class="layout__select"
        :aria-label="t('layout')"
        :value="mprActive ? 'mpr' : String(layout)"
        @change="onLayoutChange(($event.target as HTMLSelectElement).value)"
      >
        <option
          v-for="opt in layoutOptions"
          :key="opt.n"
          :value="String(opt.n)"
          :disabled="opt.disabled"
          :title="opt.disabled ? t('mprFailed') : undefined"
        >
          {{ opt.label }}
        </option>
      </select>
    </label>

    <!-- Toggle the on-image overlay: show full info <-> blur patient data. -->
    <button
      v-tip="overlayTitle"
      class="tbtn tbtn--overlay"
      :class="{ 'tbtn--active': mode === 'full', 'tbtn--privacy': mode === 'private' }"
      @click="$emit('cycleOverlay')"
    >
      <!-- full: info circle -->
      <svg
        v-if="mode === 'full'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5" />
        <circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none" />
      </svg>
      <!-- private: shield (patient data protected) -->
      <svg
        v-else
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    </button>

    <!-- Open the full DICOM metadata reader panel. -->
    <button v-tip="t('metadataTitle')" class="tbtn tbtn--meta" @click="$emit('openMeta')">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 9h4M7 13h10M7 17h10" />
      </svg>
    </button>

    <template v-if="canDownload">
      <div class="toolbar__sep" />
      <button
        v-tip="t('downloadStudy')"
        class="tbtn tbtn--download"
        @click="$emit('downloadStudy')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 3v12M8 11l4 4 4-4M5 21h14" />
        </svg>
      </button>
    </template>

    <!-- Save the active slice (image + measurements) as a JPEG. Hidden for
         report cells / cells with no image stack. -->
    <template v-if="canDownloadImage">
      <div class="toolbar__sep" />
      <button
        v-tip="t('downloadImage')"
        class="tbtn tbtn--download-image"
        @click="$emit('downloadImage')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="8.5" cy="9" r="1.5" />
          <path d="m21 16-5-5-4 4-2-2-4 4" />
        </svg>
      </button>
      <!-- Flag the current slice as a key image (toggle). A badge shows the count. -->
      <button
        v-tip="{ text: t('flagKeyImage'), key: actionHotkey.keyImage }"
        class="tbtn tbtn--keyimage"
        :class="{ 'tbtn--active': isKeyImage }"
        @click="$emit('toggleKeyImage')"
      >
        <svg
          viewBox="0 0 24 24"
          :fill="isKeyImage ? 'currentColor' : 'none'"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8L3.5 9.7l5.9-.9z" />
        </svg>
        <span v-if="keyImageCount" class="tbtn__badge">{{ keyImageCount }}</span>
      </button>
    </template>

    <!-- Export the flagged key images as JSON. Hidden when there are none. -->
    <template v-if="keyImageCount">
      <div class="toolbar__sep" />
      <button
        v-tip="`${t('keyImages')} (${keyImageCount})`"
        class="tbtn tbtn--export-keyimages"
        @click="$emit('exportKeyImages')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <path d="M14 3v6h6" />
          <path d="M12 11.3l1 2 2.2.3-1.6 1.5.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.5 2.2-.3z" />
        </svg>
      </button>
    </template>

    <!-- Export the drawn measurements as JSON or CSV. Hidden when there are none. -->
    <template v-if="canExportMeasurements">
      <div class="toolbar__sep" />
      <div class="toolbar__group tbtn--export-measurements">
        <button
          v-tip="t('exportMeasurementsJson')"
          class="tbtn"
          @click="$emit('exportMeasurements', 'json')"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <path d="M14 3v6h6" />
            <text
              x="12"
              y="18"
              text-anchor="middle"
              font-size="6"
              fill="currentColor"
              stroke="none"
            >
              {}
            </text>
          </svg>
        </button>
        <button
          v-tip="t('exportMeasurementsCsv')"
          class="tbtn"
          @click="$emit('exportMeasurements', 'csv')"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <path d="M14 3v6h6" />
            <path d="M8 16h2M12 16h2M16 16h0.5" />
          </svg>
        </button>
      </div>
    </template>

    <!-- Upload the measurements as a DICOM SR to the PACS (STOW-RS). Shown only
         when the data source advertises store support and measurements exist. -->
    <template v-if="canUploadSr">
      <div class="toolbar__sep" />
      <button v-tip="t('uploadSr')" class="tbtn tbtn--upload-sr" @click="$emit('uploadSr')">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 16V4M8 8l4-4 4 4" />
          <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
      </button>
    </template>

    <!-- Open the AI & Results right-dock panel. Shown only when the deployment
         enables it (features.aiResults). -->
    <template v-if="canAiResults">
      <div class="toolbar__sep" />
      <button v-tip="'AI & Results'" class="tbtn tbtn--ai" @click="$emit('openAiResults')">
        AI
      </button>
    </template>

    <!-- Custom hover tooltip. Teleported to the .orbidicom container so it inherits
         the theme tokens (they're scoped to that container, not :root) while its
         fixed positioning still escapes the toolbar's horizontal-scroll overflow. -->
    <Teleport :to="tipHost">
      <Transition name="tip">
        <div
          v-if="tip"
          ref="tipEl"
          class="tip"
          role="tooltip"
          :style="{ left: `${tip.x}px`, top: `${tip.y}px` }"
        >
          <span class="tip__label">{{ tip.label }}</span>
          <span v-if="tip.keys.length" class="tip__keys">
            <kbd v-for="(k, i) in tip.keys" :key="i" class="tip__key">{{ k }}</kbd>
          </span>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onUnmounted } from "vue";
import { windowPresetsFor, type WlPreset, TOOLS, DEFAULT_KEYMAP } from "@orbidicom/core";
import { t, type I18nKey } from "../i18n";

const props = defineProps<{
  modality: string;
  activeTool: string;
  layout: number;
  /** Overlay state: full info shown, or patient data blurred. */
  overlayMode?: "full" | "private";
  /** Whether the mobile controls menu is open (for the hamburger state). */
  menuOpen?: boolean;
  title?: string;
  canDownload?: boolean;
  /** Whether the active cell holds a rendered image stack that can be exported. */
  canDownloadImage?: boolean;
  /** Whether any measurements exist to export. */
  canExportMeasurements?: boolean;
  /** Whether there's an annotation action to undo / redo (enables the buttons). */
  canUndo?: boolean;
  canRedo?: boolean;
  /** Whether the current slice is flagged as a key image (toggle active state). */
  isKeyImage?: boolean;
  /** How many slices are flagged as key images (badge + export gate). */
  keyImageCount?: number;
  /** Whether measurements can be uploaded to the PACS as a DICOM SR (STOW-RS). */
  canUploadSr?: boolean;
  /** Whether the active series can be reconstructed in 3D (adds the MPR layout). */
  canMpr?: boolean;
  /** Whether the viewer is currently in MPR mode (so the selector shows "MPR"). */
  mprActive?: boolean;
  /** Whether the AI & Results panel is available (features.aiResults). */
  canAiResults?: boolean;
}>();
const emit = defineEmits<{
  preset: [WlPreset];
  tool: [string];
  invert: [];
  rotate: [];
  flipH: [];
  reset: [];
  clearAnnotations: [];
  undo: [];
  redo: [];
  toggleKeyImage: [];
  exportKeyImages: [];
  uploadSr: [];
  setLayout: [number | "mpr"];
  cycleOverlay: [];
  openMeta: [];
  toggleMenu: [];
  downloadStudy: [];
  downloadImage: [];
  exportMeasurements: ["json" | "csv"];
  openAiResults: [];
}>();

const mode = computed(() => props.overlayMode ?? "full");
const overlayTitle = computed(() =>
  mode.value === "full" ? t("overlayFull") : t("overlayPrivate"),
);

// Selectable viewport grids: cell count -> rows×cols label.
const LAYOUT_OPTIONS: { n: number; label: string }[] = [
  { n: 1, label: "1×1" },
  { n: 2, label: "1×2" },
  { n: 4, label: "2×2" },
  { n: 6, label: "2×3" },
  { n: 8, label: "2×4" },
  { n: 10, label: "2×5" },
];
// The MPR / 3D option is always listed (so it's discoverable), but disabled for
// series that can't be reconstructed — a tooltip then explains why.
const layoutOptions = computed<{ n: number | "mpr"; label: string; disabled: boolean }[]>(() => [
  ...LAYOUT_OPTIONS.map((o) => ({ ...o, disabled: false })),
  { n: "mpr", label: t("mpr"), disabled: !props.canMpr },
]);
// "mpr" stays a string sentinel; grid sizes parse to a number.
function onLayoutChange(value: string) {
  emit("setLayout", value === "mpr" ? "mpr" : Number(value));
}

// The whole field is a <label>, but tapping its leading icon/label (or the
// chevron) only FOCUSES the inner <select> — it doesn't open the picker. Open it
// explicitly so any tap on the field acts like a dropdown. showPicker() is
// supported in modern Chrome/Safari; .focus() is the graceful fallback elsewhere.
function openSelect(e: MouseEvent) {
  const field = e.currentTarget as HTMLElement;
  const sel = field.querySelector("select");
  if (!sel || e.target === sel) return;
  sel.focus();
  try {
    (sel as HTMLSelectElement & { showPicker?: () => void }).showPicker?.();
  } catch {
    /* showPicker unsupported or blocked — focus is the fallback */
  }
}

// Inner SVG markup per left-tool icon (static, trusted). Titles are stored as
// i18n keys (not resolved strings) so they re-translate when the language changes.
const toolButtons: { name: string; titleKey: I18nKey; icon: string }[] = [
  {
    name: TOOLS.WindowLevel,
    titleKey: "toolWl",
    icon: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
  },
  {
    name: TOOLS.Pan,
    titleKey: "toolPan",
    icon: '<path d="M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    name: TOOLS.Zoom,
    titleKey: "toolZoom",
    icon: '<circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M20 20l-4.3-4.3M11 8v6M8 11h6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  },
  {
    name: TOOLS.Length,
    titleKey: "toolLength",
    icon: '<path d="M3 17 17 3l4 4L7 21z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 13l2 2M11 9l2 2M15 5l2 2" stroke="currentColor" stroke-width="1.5"/>',
  },
  {
    name: TOOLS.Angle,
    titleKey: "toolAngle",
    icon: '<path d="M4 20h16M4 20 17 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    name: TOOLS.Rectangle,
    titleKey: "toolRect",
    icon: '<rect x="4" y="6" width="16" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  },
  {
    name: TOOLS.Ellipse,
    titleKey: "toolEllipse",
    icon: '<ellipse cx="12" cy="12" rx="8" ry="6" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  },
  {
    name: TOOLS.Probe,
    titleKey: "toolProbe",
    icon: '<circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4" stroke="currentColor" stroke-width="1.6"/>',
  },
];

const presets = computed(() => windowPresetsFor(props.modality));
function onPreset(name: string) {
  const p = presets.value.find((x) => x.name === name);
  if (p) emit("preset", p);
}

// Reverse-lookup the built-in shortcut for each tool / view action so tooltips
// can advertise it (e.g. "Zoom (Z)"). Single-character keys only.
const toolHotkey: Record<string, string> = {};
const actionHotkey: Record<string, string> = {};
for (const [key, cmd] of Object.entries(DEFAULT_KEYMAP)) {
  if (key.length !== 1) continue;
  const k = key.toUpperCase();
  if (cmd.kind === "tool") toolHotkey[TOOLS[cmd.tool]] = k;
  else if (cmd.kind === "invert") actionHotkey.invert = k;
  else if (cmd.kind === "rotate") actionHotkey.rotate = k;
  else if (cmd.kind === "flipH") actionHotkey.flipH = k;
  else if (cmd.kind === "reset") actionHotkey.reset = k;
  else if (cmd.kind === "keyImage") actionHotkey.keyImage = k;
}
// --- Custom hover tooltip -------------------------------------------------
// Native `title` tooltips are slow (~0.5s) and unstyled. `v-tip` renders a themed
// chip instead, teleported to <body> so the toolbar's horizontal scroll can't clip
// it, and shows the action's keyboard shortcut as keycaps. It appears for mouse
// hover and keyboard focus only — never on touch (a sticky tooltip with no way to
// dismiss). The directive also mirrors the label into aria-label so icon-only
// buttons keep an accessible name (previously carried by `title`).
type TipValue = string | { text: string; key?: string };
function applyTip(el: HTMLElement, v: TipValue) {
  const text = typeof v === "string" ? v : v.text;
  const key = typeof v === "string" ? undefined : v.key;
  el.setAttribute("data-tip", text);
  el.setAttribute("aria-label", text);
  if (key) el.setAttribute("data-tip-key", key);
  else el.removeAttribute("data-tip-key");
}
const vTip = {
  mounted: (el: HTMLElement, b: { value: TipValue }) => applyTip(el, b.value),
  updated: (el: HTMLElement, b: { value: TipValue }) => applyTip(el, b.value),
};

const tip = ref<{ label: string; keys: string[]; x: number; y: number } | null>(null);
const tipEl = ref<HTMLElement | null>(null);
const rootEl = ref<HTMLElement | null>(null);
// Render the chip inside this toolbar's own themed container (theme.css scopes the
// CSS variables to `.orbidicom`, not `:root`), falling back to <body>. closest()
// picks the right container even with multiple viewers mounted on one page.
const tipHost = ref<HTMLElement | string>("body");
onMounted(() => {
  tipHost.value = rootEl.value?.closest<HTMLElement>(".orbidicom") ?? document.body;
});
let tipTimer: ReturnType<typeof setTimeout> | undefined;
// Focus should only surface a tooltip on hover-capable devices; tapping a button
// on a touchscreen also focuses it, and we don't want a stuck chip there.
const canHover = () => window.matchMedia?.("(hover: hover)").matches ?? true;

function showTip(el: HTMLElement) {
  const label = el.getAttribute("data-tip");
  if (!label) return;
  const keyAttr = el.getAttribute("data-tip-key");
  const r = el.getBoundingClientRect();
  clearTimeout(tipTimer);
  // A short delay keeps the chip from flickering as the pointer sweeps the row.
  tipTimer = setTimeout(async () => {
    tip.value = {
      label,
      keys: keyAttr ? keyAttr.split("+") : [],
      x: r.left + r.width / 2,
      y: r.bottom + 8,
    };
    // Clamp the (centered) chip within the viewport once we can measure its width.
    await nextTick();
    const box = tipEl.value;
    if (!box || !tip.value) return;
    const half = box.offsetWidth / 2;
    const x = Math.min(Math.max(tip.value.x, half + 8), window.innerWidth - half - 8);
    if (x !== tip.value.x) tip.value = { ...tip.value, x };
  }, 90);
}
function hideTip() {
  clearTimeout(tipTimer);
  tip.value = null;
}
function onTipOver(e: PointerEvent) {
  if (e.pointerType && e.pointerType !== "mouse") return;
  const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-tip]");
  if (el) showTip(el);
}
function onTipOut(e: PointerEvent) {
  const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-tip]");
  const to = e.relatedTarget as Node | null;
  if (el && !(to && el.contains(to))) hideTip();
}
function onTipFocus(e: FocusEvent) {
  if (!canHover()) return;
  const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-tip]");
  if (el) showTip(el);
}
onUnmounted(() => clearTimeout(tipTimer));
</script>
<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: linear-gradient(180deg, var(--panel-2), var(--panel));
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
  scrollbar-width: thin;
}
.toolbar__title {
  flex: none;
  /* Brand wordmark font; falls back to the theme font if Oxygen isn't loaded. */
  font-family: "Oxygen", var(--font);
  font-weight: 700;
  font-size: 13px;
  color: var(--text);
}
.toolbar__sep {
  width: 1px;
  height: 22px;
  background: var(--border);
  flex: none;
}
.toolbar__group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
}
.tbtn {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  flex: none;
  transition:
    background 0.12s,
    color 0.12s,
    border-color 0.12s;
}
.tbtn svg {
  width: 19px;
  height: 19px;
}
.tbtn:hover {
  background: var(--elevated);
  color: var(--text);
  border-color: var(--border);
}
.tbtn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.tbtn--active {
  color: var(--text);
  background: color-mix(in srgb, var(--accent) 45%, transparent);
  border-color: var(--accent-strong);
}
/* Privacy mode: amber tint so it's obvious patient data is being blurred. */
.tbtn--privacy {
  color: #ffcf6b;
  background: color-mix(in srgb, #b9852a 35%, transparent);
  border-color: #b9852a;
}
/* Text-only AI button: same 34px chip as the icon buttons, sized for its label. */
.tbtn--ai {
  width: auto;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.4px;
}
/* Key-image count badge, pinned to the top-right of the star toggle. */
.tbtn--keyimage {
  position: relative;
}
.tbtn__badge {
  position: absolute;
  top: -3px;
  right: -3px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  background: var(--accent-strong);
  color: var(--text);
  font-size: 9px;
  line-height: 14px;
  text-align: center;
  font-weight: 600;
}
/* W/L + grid controls render as one bordered "field" — a leading label/icon, the
   value, and a trailing chevron — so the whole control unmistakably reads as a
   dropdown on every device. The native <select> is kept (OS picker on mobile,
   accessible, tests intact), just made transparent/borderless inside the field. */
.wl,
.layout {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  height: 34px;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  background: var(--elevated);
  cursor: pointer;
  transition: border-color 0.12s;
}
.wl:hover,
.layout:hover {
  border-color: color-mix(in srgb, var(--accent-strong) 45%, var(--border));
}
/* The ring follows the inner <select>'s keyboard focus. */
.wl:focus-within,
.layout:focus-within {
  outline: 2px solid var(--accent-strong);
  outline-offset: 1px;
  border-color: var(--accent-strong);
}
.wl__label {
  font-size: 11px;
  font-weight: 600;
  /* --muted (not --hush) so 11px text clears WCAG AA contrast on the field. */
  color: var(--muted);
  letter-spacing: 0.4px;
}
.layout {
  color: var(--muted);
}
.layout__icon {
  flex: none;
  width: 16px;
  height: 16px;
}
.wl__select,
.layout__select {
  appearance: none;
  -webkit-appearance: none;
  min-width: 0;
  height: 100%;
  /* Reserve space the chevron overlaps, so a click on the chevron still opens it. */
  padding-inline: 0 18px;
  padding-block: 0;
  border: none;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  /* iOS Safari won't vertically center a borderless select on its own — pin the
     value with an explicit line-height and start-align it next to the label. */
  line-height: 32px;
  text-align: left;
  cursor: pointer;
  outline: none;
}
/* Shared chevron: a masked icon so it inherits a theme color and stays crisp; the
   trailing affordance that signals "this opens a menu". pointer-events:none + the
   negative margin let it sit over the select's hit area (taps open the menu). */
.wl::after,
.layout::after {
  content: "";
  flex: none;
  width: 12px;
  height: 12px;
  margin-inline-start: -16px;
  background-color: var(--muted);
  -webkit-mask: url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2024%2024'%20fill='none'%20stroke='%23000'%20stroke-width='2.5'%20stroke-linecap='round'%20stroke-linejoin='round'%3E%3Cpath%20d='m6%209%206%206%206-6'/%3E%3C/svg%3E")
    center / contain no-repeat;
  mask: url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2024%2024'%20fill='none'%20stroke='%23000'%20stroke-width='2.5'%20stroke-linecap='round'%20stroke-linejoin='round'%3E%3Cpath%20d='m6%209%206%206%206-6'/%3E%3C/svg%3E")
    center / contain no-repeat;
  pointer-events: none;
  transition: background-color 0.12s;
}
.wl:hover::after,
.layout:hover::after {
  background-color: var(--text);
}
/* The opened option list (where the browser honors styling). */
.wl__select option,
.layout__select option {
  background: var(--panel);
  color: var(--text);
}
/* Mobile-only hamburger in the header, in normal flow before the title.
   Borderless ghost icon so it blends into the header (seamless, modern). */
.toolbar__menu {
  display: none;
  flex: none;
  place-items: center;
  width: 36px;
  height: 36px;
  margin-left: -4px;
  border: none;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition:
    background 0.12s,
    color 0.12s;
}
.toolbar__menu svg {
  width: 21px;
  height: 21px;
}
.toolbar__menu:hover {
  color: var(--text);
  background: var(--elevated);
}
.toolbar__menu--active {
  color: var(--accent-strong);
}
@media (max-width: 640px) {
  .toolbar__menu {
    display: grid;
  }
}

/* Custom hover tooltip (teleported to <body>, so it renders in this component's
   scope but is not clipped by the toolbar's overflow). Centered under its trigger
   via translateX(-50%); showTip() sets left/top. */
.tip {
  position: fixed;
  z-index: 1000;
  transform: translate(-50%, 0);
  display: flex;
  align-items: center;
  gap: 7px;
  max-width: 280px;
  padding: 5px 9px;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  background: var(--panel);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
  /* Never intercept the pointer — the tooltip is a passive readout. */
  pointer-events: none;
  white-space: nowrap;
  font-family: var(--font);
}
.tip__label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.2px;
  color: var(--text);
}
.tip__keys {
  display: inline-flex;
  gap: 3px;
}
/* Keycap: a small teal-tinted cap that teaches the button's shortcut — the one
   deliberate flourish, echoing the accent used across the viewer. */
.tip__key {
  min-width: 16px;
  padding: 1px 4px;
  border: 1px solid color-mix(in srgb, var(--accent-strong) 40%, var(--border));
  border-bottom-width: 2px;
  border-radius: 4px;
  background: var(--elevated);
  color: var(--accent-strong);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  font-weight: 600;
  line-height: 14px;
  text-align: center;
  text-transform: uppercase;
}
.tip-enter-active,
.tip-leave-active {
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
}
.tip-enter-from,
.tip-leave-to {
  opacity: 0;
  /* Starts tucked toward the button, then settles down into place. */
  transform: translate(-50%, -4px);
}
@media (prefers-reduced-motion: reduce) {
  .tip-enter-active,
  .tip-leave-active {
    transition: opacity 0.12s ease;
  }
  .tip-enter-from,
  .tip-leave-to {
    transform: translate(-50%, 0);
  }
}
</style>
