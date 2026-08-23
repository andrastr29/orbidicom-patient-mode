<template>
  <!-- Absolute layer over the cell's canvas. The layer ignores pointer events so it
       never blocks drawing; only the (hover-revealed) buttons re-enable them. -->
  <div class="cs-annot-overlay">
    <button
      v-for="target in targets"
      :key="target.uid"
      class="cs-del-x"
      type="button"
      :title="t('deleteAnnotation')"
      :aria-label="t('deleteAnnotation')"
      :style="{ left: target.canvas.x + 'px', top: target.canvas.y + 'px' }"
      @pointerdown.stop
      @click.stop="emit('delete', target.uid)"
    >
      ×
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import {
  getAnnotationDeleteTargets,
  subscribeOverlayReposition,
  type DeleteTarget,
  type OverlayViewport,
} from "@orbidicom/core";
import { t } from "../i18n";

/** The cell's viewport: core's overlay-viewport shape plus its id (for event filtering). */
type OverlayViewportLike = OverlayViewport & { id: string };

const props = defineProps<{
  /** Lazily resolves this cell's Cornerstone viewport (null until the stack mounts). */
  getViewport: () => OverlayViewportLike | null;
  /** This cell's `.cs-viewport` element: the source of element-scoped render events. */
  element: HTMLElement | null;
  /** Bumped by the parent whenever annotation state changes, to force a recompute. */
  version: number;
}>();

const emit = defineEmits<{ (e: "delete", uid: string): void }>();

const targets = ref<DeleteTarget[]>([]);
function recompute() {
  const vp = props.getViewport();
  targets.value = vp ? getAnnotationDeleteTargets(vp) : [];
}
// Initial compute in setup so the first synchronous render already has targets.
recompute();

let teardown: (() => void) | null = null;
onMounted(() => {
  if (props.element) {
    teardown = subscribeOverlayReposition(props.element, () => props.getViewport()?.id, recompute);
  }
});
onUnmounted(() => {
  teardown?.();
  teardown = null;
});

watch(() => props.version, recompute);
</script>

<style scoped>
.cs-annot-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 5;
}
.cs-del-x {
  position: absolute;
  /* sit just to the right of the annotation's label anchor */
  transform: translate(6px, -50%);
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  /* hidden + inert by default; the parent cell reveals on hover (see Viewer.vue) */
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}
.cs-del-x:hover {
  background: #d33;
}
</style>
