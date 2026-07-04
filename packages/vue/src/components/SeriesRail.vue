<template>
  <div class="rail">
    <button
      v-for="(s, i) in series"
      :key="s.seriesInstanceUID"
      class="rail__item"
      :class="{ 'rail__item--active': i === active }"
      :title="label(s, i)"
      @click="$emit('select', i)"
    >
      <span :ref="(el) => bindThumb(el as Element | null, s)" class="rail__thumb">
        <img
          v-if="st(s).kind === 'image'"
          class="rail__img"
          :src="st(s).url!"
          alt=""
          decoding="async"
        />
        <svg
          v-else-if="st(s).kind === 'doc'"
          class="rail__glyph rail__glyph--doc"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        >
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
        </svg>
        <svg
          v-else-if="st(s).kind === 'none'"
          class="rail__glyph rail__glyph--none"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        >
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M4 15l4-4 4 4 3-3 5 5" />
        </svg>
        <span v-else class="rail__spinner" aria-hidden="true"></span>
        <span class="rail__ord">{{ i + 1 }}</span>
      </span>
      <span class="rail__body">
        <span class="rail__name">{{ s.seriesDescription || s.modality || t("series") }}</span>
        <span class="rail__meta">{{ meta(s) }}</span>
      </span>
    </button>
  </div>
</template>
<script setup lang="ts">
import { reactive, onBeforeMount, onUnmounted, watch } from "vue";
import { isImageSeries } from "@orbidicom/core";
import type { SeriesSummary, ThumbnailProvider } from "@orbidicom/core";
import { t } from "../i18n";

const props = defineProps<{
  series: SeriesSummary[];
  active: number;
  provider?: ThumbnailProvider;
}>();
defineEmits<{ select: [number] }>();

// The image count is only meaningful for image series. Report/document series
// (e.g. an encapsulated PDF, modality DOC, 0 frames) show just the modality —
// "DOC · 0 img" reads like an error, so the count is dropped when there are none.
const meta = (s: SeriesSummary) => {
  const mod = s.modality ?? "";
  const n = s.numberOfFrames ?? 0;
  if (n <= 0) return mod;
  return mod ? `${mod} · ${n} img` : `${n} img`;
};
const label = (s: SeriesSummary, i: number) => {
  const m = meta(s);
  return `${i + 1}. ${s.seriesDescription || s.modality || t("series")}${m ? ` (${m})` : ""}`;
};

// --- Per-series preview state, filled in lazily as rows scroll into view. ---
type ThumbState = { kind: "loading" | "image" | "doc" | "none"; url: string | null };
const DEFAULT_ST: ThumbState = { kind: "loading", url: null };
const states = reactive<Record<string, ThumbState>>({});
const st = (s: SeriesSummary): ThumbState => states[s.seriesInstanceUID] ?? DEFAULT_ST;

const observed = new Set<string>();
const seriesByUid = new Map<string, SeriesSummary>();
const elToUid = new WeakMap<Element, string>();
let io: IntersectionObserver | null = null;

function load(uid: string) {
  const s = seriesByUid.get(uid);
  if (!s) return;
  // Mirror the provider's rule: a non-image modality (SR/DOC/KO/PR/AU) or an
  // explicit zero-or-fewer instance count is a report — show the document glyph
  // and never ask for a preview. An absent count (undefined) is "unknown", not a
  // report, so image series on a PACS that omits the count still get a thumbnail.
  const n = s.numberOfFrames;
  if (!isImageSeries(s) || (n != null && n <= 0)) {
    states[uid] = { kind: "doc", url: null };
    return;
  }
  states[uid] = { kind: "loading", url: null };
  if (!props.provider) {
    states[uid] = { kind: "none", url: null };
    return;
  }
  props.provider
    .get(s)
    .then((url) => {
      states[uid] = url ? { kind: "image", url } : { kind: "none", url: null };
    })
    .catch(() => {
      states[uid] = { kind: "none", url: null };
    });
}

// Function ref on each row's thumbnail: register it with the observer once. Vue
// re-invokes this on updates, so guard with `observed`.
function bindThumb(el: Element | null, s: SeriesSummary) {
  if (!el) return;
  const uid = s.seriesInstanceUID;
  seriesByUid.set(uid, s);
  if (observed.has(uid)) return;
  observed.add(uid);
  elToUid.set(el, uid);
  if (io) io.observe(el);
  else load(uid); // no IntersectionObserver (e.g. jsdom / SSR) → load eagerly
}

// The callback closes over the `let io` variable, so after a reassignment it
// references the current observer; a disconnected old one won't fire.
function createObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === "undefined") return null;
  return new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const uid = elToUid.get(e.target);
        if (uid) {
          io!.unobserve(e.target);
          load(uid);
        }
      }
    },
    { root: null, rootMargin: "200px" },
  );
}

// Construct the observer in `onBeforeMount`, not `onMounted`: Vue invokes each
// row's function ref synchronously during the first DOM patch, which happens
// *before* `onMounted`. If `io` were still null then, every `bindThumb` would
// take the eager `else load(uid)` path and mark the row `observed`, so it would
// never be observed once `io` existed — the lazy path would be dead code.
onBeforeMount(() => {
  io = createObserver();
});

// A new study replaces props.series wholesale (identity change). In-place count
// reconciliation mutates existing objects and won't trip this. Reset preview
// state AND rebuild the observer so it stops referencing the old study's
// now-detached rows (the long-lived singleton's `onUnmounted` never fires
// mid-session, so a stale observer would pin every offscreen element forever).
watch(
  () => props.series,
  () => {
    io?.disconnect();
    io = createObserver();
    observed.clear();
    seriesByUid.clear();
    for (const k of Object.keys(states)) delete states[k];
  },
);

onUnmounted(() => io?.disconnect());
</script>
<style scoped>
.rail {
  width: 200px;
  flex: none;
  background: var(--panel);
  border-right: 1px solid var(--border);
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.rail__item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  text-align: left;
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-left: 3px solid transparent;
  border-radius: var(--r-sm);
  background: var(--panel-2);
  color: var(--text);
  cursor: pointer;
  transition:
    background 0.12s,
    border-color 0.12s;
}
.rail__item:hover {
  background: var(--elevated);
}
.rail__item--active {
  background: color-mix(in srgb, var(--accent) 28%, var(--panel-2));
  border-left-color: var(--highlight);
}
.rail__thumb {
  position: relative;
  flex: none;
  width: 46px;
  height: 46px;
  border-radius: 6px;
  overflow: hidden;
  /* Scans read on black regardless of the viewer theme. */
  background: #000;
  display: grid;
  place-items: center;
}
.rail__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
.rail__glyph {
  width: 22px;
  height: 22px;
  color: var(--muted);
  opacity: 0.7;
}
/* Loading: a small spinner centered on the black thumbnail. Modeled on the
   working viewport `.spinner`, with two iOS/WebKit guards:
   1. Solid rgba borders, never color-mix(…, transparent) — WebKit in in-app web
      views treats that as invalid and drops the whole `border` (width 0), so the
      spinner is invisible. The thumb is always #000, so white-alpha is
      theme-agnostic and always contrasts.
   2. `will-change: transform` promotes the spinner onto its own compositor layer.
      Its parent `.rail__thumb` has `overflow: hidden` + `border-radius`, and iOS
      Safari fails to repaint a rotating child under that rounded clip — the ring
      renders but sits frozen. Compositing it separately restores the spin.
   No `prefers-reduced-motion` guard: the viewport `.spinner` has none, and the
   rail is expected to match it. */
.rail__spinner {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.25);
  border-top-color: rgba(255, 255, 255, 0.85);
  animation: rail-spin 0.7s linear infinite;
  will-change: transform;
}
@keyframes rail-spin {
  to {
    transform: rotate(360deg);
  }
}
.rail__ord {
  position: absolute;
  left: 3px;
  bottom: 3px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  padding: 1px 4px;
  border-radius: 4px;
  color: #fff;
  background: rgba(0, 0, 0, 0.6);
}
.rail__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 1px;
}
.rail__name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rail__meta {
  font-size: 11px;
  color: var(--muted);
}

/* Mobile: horizontal strip; each item becomes a thumbnail-over-caption tile. */
@media (max-width: 640px) {
  .rail {
    width: 100%;
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
    border-right: 0;
    border-bottom: 1px solid var(--border);
    padding: 6px;
  }
  .rail__item {
    flex: none;
    flex-direction: column;
    align-items: stretch;
    width: 76px;
    padding: 6px;
    gap: 6px;
  }
  .rail__thumb {
    width: 64px;
    height: 64px;
  }
  .rail__spinner {
    width: 18px;
    height: 18px;
  }
  .rail__name {
    max-width: 64px;
  }
}
</style>
