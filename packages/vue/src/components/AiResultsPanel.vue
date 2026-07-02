<script setup lang="ts">
import { computed } from "vue";
import type { AIResultSet, AIResult } from "@orbidicom/core";

const props = defineProps<{ resultSet: AIResultSet | null }>();
const emit = defineEmits<{
  accept: [string];
  reject: [string];
  toggle: [string];
  relabel: [string, string];
  importFile: [File];
  export: ["json" | "csv" | "ai-json"];
}>();

const groups = computed(() => {
  const r = props.resultSet?.results ?? [];
  return {
    segmentation: r.filter((x) => x.kind === "segmentation"),
    measurement: r.filter((x) => x.kind === "measurement"),
    finding: r.filter((x) => x.kind === "finding"),
  };
});

function statLine(r: AIResult): string {
  if (r.kind === "measurement") {
    const s = r.measurement.stats[0];
    return s ? `${s.value} ${s.unit}` : "";
  }
  if (r.kind === "segmentation") {
    const st = r.stats?.[0];
    return st?.volumeMm3 != null ? `${Math.round(st.volumeMm3)} mm³` : "";
  }
  return r.text ?? r.value ?? "";
}

function onImport(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) emit("importFile", file);
}
</script>

<template>
  <aside class="aipanel">
    <header class="aipanel__head">
      <span>AI &amp; Results</span>
      <label class="aipanel__import" data-test="import">
        <input type="file" accept=".json,application/json" hidden @change="onImport" />⤓
      </label>
    </header>

    <div v-if="resultSet" class="aipanel__prov">
      <span class="aipanel__badge">{{
        resultSet.provenance.source === "inference" ? "AI" : "Imported"
      }}</span>
      {{ resultSet.provenance.providerId ?? resultSet.provenance.format }} ·
      {{ resultSet.results.length }} results
    </div>

    <section v-for="(items, kind) in groups" v-show="items.length" :key="kind" class="aipanel__sec">
      <h4 class="aipanel__sech">
        {{
          kind === "segmentation"
            ? "Segmentations"
            : kind === "measurement"
              ? "Measurements"
              : "Findings"
        }}
        <span class="aipanel__count">{{ items.length }}</span>
      </h4>
      <div
        v-for="r in items"
        :key="r.id"
        class="aipanel__row"
        :class="{ 'aipanel__row--rejected': r.reviewStatus === 'rejected' }"
      >
        <button :data-test="`toggle-${r.id}`" class="aipanel__eye" @click="emit('toggle', r.id)">
          {{ r.visible ? "👁" : "🚫" }}
        </button>
        <span class="aipanel__name">{{ r.label }}</span>
        <span v-if="statLine(r)" class="aipanel__stat">{{ statLine(r) }}</span>
        <span class="aipanel__acts">
          <button :data-test="`accept-${r.id}`" class="aipanel__ok" @click="emit('accept', r.id)">
            ✓
          </button>
          <button :data-test="`reject-${r.id}`" class="aipanel__no" @click="emit('reject', r.id)">
            ✕
          </button>
        </span>
      </div>
    </section>

    <footer class="aipanel__foot">
      <button data-test="export-json" @click="emit('export', 'json')">JSON</button>
      <button data-test="export-csv" @click="emit('export', 'csv')">CSV</button>
      <button data-test="export-ai" @click="emit('export', 'ai-json')">AI-JSON</button>
    </footer>
  </aside>
</template>

<style scoped>
.aipanel {
  display: flex;
  flex-direction: column;
  width: 320px;
  border-left: 1px solid var(--od-border, #232a36);
  background: var(--od-panel, #12151c);
  color: var(--od-text, #c7cedb);
  overflow-y: auto;
}
.aipanel__head,
.aipanel__foot {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
}
.aipanel__head {
  font-weight: 600;
  border-bottom: 1px solid var(--od-border, #232a36);
}
.aipanel__import {
  margin-left: auto;
  cursor: pointer;
}
.aipanel__prov {
  padding: 7px 12px;
  font-size: 11px;
  opacity: 0.8;
}
.aipanel__badge {
  background: rgba(99, 102, 241, 0.18);
  color: #a5b4fc;
  border-radius: 10px;
  padding: 1px 8px;
  margin-right: 6px;
}
.aipanel__sech {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 8px 12px;
  font-size: 11px;
  text-transform: uppercase;
  opacity: 0.7;
}
.aipanel__count {
  margin-left: auto;
}
.aipanel__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
}
.aipanel__row--rejected {
  opacity: 0.45;
}
.aipanel__name {
  font-weight: 600;
}
.aipanel__stat {
  font-size: 11px;
  color: #93c5fd;
}
.aipanel__acts {
  margin-left: auto;
  display: flex;
  gap: 4px;
}
.aipanel__foot {
  border-top: 1px solid var(--od-border, #232a36);
}
.aipanel__eye,
.aipanel__ok,
.aipanel__no,
.aipanel__foot button {
  cursor: pointer;
  background: none;
  border: none;
  color: inherit;
}
</style>
