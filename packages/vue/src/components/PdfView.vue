<template>
  <div ref="container" class="pdfview">
    <p v-if="error" class="pdfview__err">{{ t("pdfError") }}</p>
  </div>
</template>
<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from "vue";
// The worker is a tiny URL string; the heavy pdf.js library is lazy-imported in
// render() so consumers that never open a PDF report don't ship it.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { t } from "../i18n";

// We render the PDF to canvases ourselves so it works regardless of Chrome's
// refusal to display blob: PDFs inside an <iframe> ("blocked by Chrome").
const props = defineProps<{ src: string }>();
const container = ref<HTMLDivElement | null>(null);
const error = ref(false);
let token = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let doc: any = null;

async function render(url: string) {
  const mine = ++token;
  error.value = false;
  const el = container.value;
  if (!el || !url) return;
  el.querySelectorAll("canvas").forEach((c) => c.remove());
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    doc?.destroy?.();
    // pdfjs@6 dropped the bare-string overload; pass DocumentInitParameters.
    doc = await pdfjs.getDocument({ url }).promise;
    for (let n = 1; n <= doc.numPages; n++) {
      if (mine !== token) return;
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.className = "pdfview__page";
      el.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
    }
  } catch {
    if (mine === token) error.value = true;
  }
}

// Render on mount (the template ref is bound by now) and on later src changes.
// An { immediate: true } watch would fire during setup(), before `container`
// is bound, so render() would bail on a null element and never run again.
onMounted(() => props.src && render(props.src));
watch(
  () => props.src,
  (u) => u && render(u),
);
onUnmounted(() => {
  token++;
  doc?.destroy?.();
});
</script>
<style scoped>
.pdfview {
  position: absolute;
  inset: 0;
  overflow: auto;
  background: #525659;
  padding: 16px;
  text-align: center;
}
.pdfview__page {
  display: block;
  margin: 0 auto 12px;
  max-width: 100%;
  height: auto;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
  background: #fff;
}
.pdfview__err {
  color: #eee;
  font-family: var(--font);
  font-size: 13px;
  margin-top: 40px;
}
</style>
