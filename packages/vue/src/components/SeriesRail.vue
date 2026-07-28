<template>
  <div class="rail">
    <template v-for="(g, gi) in groups" :key="g.uid || gi">
      <div v-if="grouped" class="rail__group">
        <button
          class="rail__group-toggle"
          type="button"
          :aria-expanded="isExpanded(g, gi)"
          @click="toggle(g, gi)"
        >
          <svg
            class="rail__group-chev"
            :class="{ 'rail__group-chev--open': isExpanded(g, gi) }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
          <span class="rail__group-lines">
            <span class="rail__group-title">{{ g.line1 }}</span>
            <span v-if="g.line2" class="rail__group-sub">{{ g.line2 }}</span>
          </span>
        </button>
        <span class="rail__group-count">{{ g.rows.length }}</span>
        <button
          class="rail__group-close"
          type="button"
          :aria-label="t('closeStudy')"
          :title="t('closeStudy')"
          @click="$emit('close-study', g.uid)"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.4"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <button
        v-for="(r, ri) in grouped && !isExpanded(g, gi) ? [] : g.rows"
        :key="r.s.seriesInstanceUID"
        class="rail__item"
        :class="{ 'rail__item--active': r.flat === active }"
        :title="label(r.s, ri)"
        @click="$emit('select', r.flat)"
      >
        <span :ref="(el) => bindThumb(el as Element | null, r.s)" class="rail__thumb">
          <img
            v-if="st(r.s).kind === 'image'"
            class="rail__img"
            :src="st(r.s).url!"
            alt=""
            decoding="async"
          />
          <svg
            v-else-if="st(r.s).kind === 'doc'"
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
            v-else-if="st(r.s).kind === 'none'"
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
          <span class="rail__ord">{{ ri + 1 }}</span>
        </span>
        <span class="rail__body">
          <span class="rail__name">{{ r.s.seriesDescription || r.s.modality || t("series") }}</span>
          <span class="rail__meta">{{ meta(r.s) }}</span>
        </span>
      </button>
    </template>
  </div>
</template>
<script setup lang="ts">
import { reactive, computed, onBeforeMount, onUnmounted, watch } from "vue";
import { isImageSeries } from "@orbidicom/core";
import type { SeriesSummary, ThumbnailProvider } from "@orbidicom/core";
import { t, formatDicomDate } from "../i18n";

const props = defineProps<{
  series: SeriesSummary[];
  active: number;
  /** Flat indices of every series currently shown in a cell. Defaults to [active]. */
  displayed?: number[];
  provider?: ThumbnailProvider;
}>();
defineEmits<{ select: [number]; "close-study": [string] }>();

/** A study's series, plus the flat index of each row so `select` stays flat. */
type Group = {
  uid: string;
  rows: { s: SeriesSummary; flat: number }[];
  line1: string;
  line2: string;
};

// Group only when the rail actually holds more than one study. A single study —
// or a local-file session where every studyInstanceUID is undefined — renders
// exactly as it always has: no headers, no collapse, no behavior change.
const grouped = computed(() => new Set(props.series.map((s) => s.studyInstanceUID ?? "")).size > 1);

// With several patients on screen, patient identity outranks the description:
// the mismatch must be visible at all times (it is never blocked or confirmed).
const multiPatient = computed(
  () => new Set(props.series.map((s) => s.study?.patientName ?? s.study?.patientId ?? "")).size > 1,
);

const groups = computed<Group[]>(() => {
  const byUid = new Map<string, { s: SeriesSummary; flat: number }[]>();
  props.series.forEach((s, flat) => {
    const uid = s.studyInstanceUID ?? "";
    const rows = byUid.get(uid);
    if (rows) rows.push({ s, flat });
    else byUid.set(uid, [{ s, flat }]);
  });
  return [...byUid.entries()].map(([uid, rows], i) => {
    const st = rows[0]?.s.study;
    const date = formatDicomDate(st?.studyDate);
    const desc = st?.studyDescription ?? "";
    const who = st?.patientName || st?.patientId || "";
    // Fallback chain, so a header is never blank and never shows a raw UID:
    // date → description → positional. A study UID is opaque and unreadable.
    const line1 = date || desc || t("studyN").replace("{n}", String(i + 1));
    const line2 = date ? (multiPatient.value ? who : desc) : "";
    return { uid, rows, line1, line2 };
  });
});

// Collapse state per study UID, owned by the rail and session-scoped. An entry is
// materialized once, the first time that study's group appears in `groups`, by the
// watcher below — and then never re-defaulted, so neither `displayed`/`active`
// moving on nor appending another study can reopen or reclose a group the user
// deliberately toggled. A study that closes and comes back has its UID pruned from
// `expanded`, so it starts fresh (default-computed again) rather than restoring
// whatever the user last left it at.
const expanded = reactive<Record<string, boolean>>({});

const displayedSet = computed(() => new Set(props.displayed ?? [props.active]));

// Seed any group not yet in `expanded` with its default, and drop entries for
// studies that are no longer present. Must run as a watcher, not inside a computed
// or render-time function: writing reactive state during render is a side effect
// Vue explicitly warns against, and a computed re-deriving the default on every
// access (rather than writing it once) is exactly the bug this replaces — it would
// silently flip a group's visibility whenever `displayed`/`active` moved on.
watch(
  groups,
  (gs) => {
    const uids = new Set(gs.map((g) => g.uid));
    for (const uid of Object.keys(expanded)) {
      if (!uids.has(uid)) delete expanded[uid];
    }
    gs.forEach((g, gi) => {
      if (expanded[g.uid] === undefined) {
        // Expand it when it is the newest study (first group), or when any of its
        // series is on screen — a group that holds the row the user is looking at
        // must never start hidden.
        expanded[g.uid] = gi === 0 || g.rows.some((r) => displayedSet.value.has(r.flat));
      }
    });
  },
  { immediate: true },
);

function isExpanded(g: Group, gi: number): boolean {
  // The watcher runs `immediate`ly and synchronously seeds every group before the
  // first template render, so this fallback is only a defensive default (e.g. a
  // group added between the watcher's snapshot and a render in the same tick).
  const known = expanded[g.uid];
  if (known !== undefined) return known;
  return gi === 0 || g.rows.some((r) => displayedSet.value.has(r.flat));
}

function toggle(g: Group, gi: number) {
  expanded[g.uid] = !isExpanded(g, gi);
}

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
  const uid = s.seriesInstanceUID;
  if (!el) {
    // Vue calls the ref with null when the row unmounts — which happens every
    // time its study group collapses, not just on removal from props.series. A
    // row that was bound and observed but never intersected (states[uid] still
    // undefined) has no fetch in flight, so its `observed` entry must be cleared
    // here: otherwise `observed.has(uid)` stays true forever, and on re-expand
    // the guard below short-circuits before the new element is ever registered
    // with the observer — the thumbnail spins forever with no way to recover.
    // A row already mid-fetch (`kind: "loading"`) or resolved needs no action:
    // its promise (or its finished result) doesn't depend on the element, and
    // re-observing it would risk a duplicate `load()` call once it remounts.
    if (states[uid] === undefined) observed.delete(uid);
    return;
  }
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

// props.series changes identity on every study add/close and on reorder, so this
// can't assume a wholesale study swap any more. Diff by UID: forget preview state
// only for series that actually disappeared, and keep everything else so an
// append or reorder never refetches a thumbnail the user already has.
//
// The observer is still rebuilt whenever rows are removed — the long-lived
// singleton's onUnmounted never fires mid-session, so a stale observer would pin
// every detached offscreen element forever.
watch(
  () => props.series,
  () => {
    const live = new Set(props.series.map((s) => s.seriesInstanceUID));
    let removed = false;
    for (const uid of [...observed]) {
      if (live.has(uid)) continue;
      removed = true;
      observed.delete(uid);
      seriesByUid.delete(uid);
      delete states[uid];
    }
    if (removed) {
      io?.disconnect();
      io = createObserver();
      // Rows that survived must be re-observed against the new observer; their
      // `observed` entries are cleared so the function refs re-register them.
      for (const uid of [...observed]) {
        if (states[uid] === undefined) observed.delete(uid);
      }
    }
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

.rail__group {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 4px 5px;
  border-bottom: 1px solid var(--border);
  /* Sticky so the study a row belongs to stays on screen while scrolling. */
  position: sticky;
  top: -8px; /* cancels .rail's 8px padding */
  background: var(--panel);
  z-index: 1;
}
.rail__group-toggle {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: start;
  cursor: pointer;
}
.rail__group-chev {
  flex: none;
  width: 10px;
  height: 10px;
  color: var(--muted);
  transform: rotate(-90deg);
  transition: transform 0.12s;
}
.rail__group-chev--open {
  transform: rotate(0deg);
}
.rail__group-lines {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 1px;
}
.rail__group-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rail__group-sub {
  font-size: 10px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rail__group-count {
  margin-inline-start: auto;
  font-size: 10px;
  font-weight: 600;
  color: var(--muted);
}
.rail__group-close {
  flex: none;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.rail__group-close:hover {
  background: var(--elevated);
  color: var(--text);
}
.rail__group-close svg {
  width: 11px;
  height: 11px;
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

  /* A sticky row-header doesn't work once the rail is a horizontal strip: there's
     no "above the rows" to stick to, and the desktop -8px offset assumes the
     vertical layout's 8px padding (mobile uses 6px). Instead render each group
     header as its own narrow, non-shrinking tile in the flow, right before that
     study's rows — a vertical divider between studies rather than a banner. */
  .rail__group {
    flex: none;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    width: 84px;
    padding: 6px;
    border-bottom: 0;
    border-right: 1px solid var(--border);
    position: static;
    top: auto;
  }
  .rail__group-toggle {
    width: 100%;
  }
  .rail__group-lines {
    width: 100%;
  }
  .rail__group-title,
  .rail__group-sub {
    max-width: 100%;
  }
  .rail__group-count {
    margin-inline-start: 0;
    margin-top: 2px;
  }
  .rail__group-close {
    align-self: flex-end;
    margin-top: 2px;
  }
}
</style>
