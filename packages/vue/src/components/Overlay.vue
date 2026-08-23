<template>
  <div class="ovlroot">
    <!-- Top-left: patient identity. Blurred in privacy mode (demos/screenshots). -->
    <div
      v-if="m && (m.patientName || m.patientId)"
      class="ovl ovl--tl"
      :class="{ 'ovl--blur': privacy }"
    >
      <div v-if="m.patientName" class="ovl__name">{{ m.patientName }}</div>
      <div v-if="idLine" class="ovl__line">{{ idLine }}</div>
    </div>

    <!-- Top-right: study / series, right-aligned. -->
    <div class="ovl ovl--tr">
      <div v-if="studyText" class="ovl__study">{{ studyText }}</div>
      <div v-if="seriesText" class="ovl__line">{{ seriesText }}</div>
      <div v-if="dateText" class="ovl__line">{{ dateText }}</div>
    </div>

    <!-- Bottom-left: position within the series. -->
    <div class="ovl ovl--bl">
      <span class="ovl__img">{{ t("img") }} {{ index + 1 }} / {{ count }}</span>
      <!-- Only show the DICOM InstanceNumber when it adds info, i.e. it differs
           from the 1-based image position already shown above. -->
      <span v-if="m && m.instanceNumber != null && m.instanceNumber !== index + 1" class="ovl__inst"
        >#{{ m.instanceNumber }}</span
      >
      <span v-if="m && m.sliceLocation != null">{{ t("loc") }} {{ fmt(m.sliceLocation) }}</span>
    </div>

    <!-- Bottom-right: rendering + geometry. -->
    <div class="ovl ovl--br">
      <span v-if="wl">W {{ wl.ww }} · L {{ wl.wc }}</span>
      <span v-if="m && m.columns && m.rows">{{ m.columns }}×{{ m.rows }}</span>
      <span v-if="m && m.sliceThickness != null">{{ fmt(m.sliceThickness) }} mm</span>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from "vue";
import type { ImageMetadata, WindowLevel } from "@orbidicom/core";
import { t } from "../i18n";

const props = defineProps<{
  meta: ImageMetadata | null;
  wl: WindowLevel | null;
  index: number;
  count: number;
  seriesLabel: string;
  /** Blur patient identifiers (name / ID / DOB) for demos and screenshots. */
  privacy?: boolean;
}>();

const m = computed(() => props.meta);

const idLine = computed(() => {
  const x = m.value;
  if (!x) return "";
  return [x.patientId, x.patientSex, x.patientBirthDate].filter(Boolean).join(" · ");
});

const studyText = computed(() => m.value?.studyDescription || props.seriesLabel || "");
const seriesText = computed(() => {
  const x = m.value;
  if (!x?.seriesDescription) return "";
  return x.seriesNumber != null
    ? `${x.seriesDescription} · #${x.seriesNumber}`
    : x.seriesDescription;
});
const dateText = computed(() => [m.value?.studyDate, m.value?.studyTime].filter(Boolean).join(" "));

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
</script>
<style scoped>
.ovlroot {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.ovl {
  position: absolute;
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.35;
  color: var(--text);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.95);
  padding: 7px 9px;
  max-width: 60%;
}
.ovl--tl {
  top: 0;
  left: 0;
}
/* Privacy mode: blur patient identifiers for demos and screenshots. */
.ovl--blur {
  filter: blur(6px);
}
.ovl--tr {
  top: 0;
  right: 0;
  text-align: right;
}
.ovl--bl {
  left: 0;
  bottom: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 1px 12px;
}
.ovl--br {
  right: 0;
  bottom: 0;
  text-align: right;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
}
.ovl__name {
  font-weight: 600;
  color: var(--accent-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ovl__study {
  font-weight: 600;
  color: var(--accent-strong);
}
.ovl__line {
  color: var(--muted);
}
.ovl__img {
  color: var(--text);
}
@media (max-width: 640px) {
  .ovl {
    font-size: 11px;
    padding: 5px 7px;
  }
}
</style>
