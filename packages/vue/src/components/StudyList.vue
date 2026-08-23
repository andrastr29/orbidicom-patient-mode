<template>
  <div class="studylist orbidicom" :dir="layoutDir">
    <div class="studylist__title">{{ t("worklist") }}</div>
    <form class="studylist__filters" @submit.prevent="run">
      <input
        v-model.trim="q.patientName"
        class="studylist__f studylist__f--name"
        :placeholder="t('groupPatient')"
        :aria-label="t('groupPatient')"
      />
      <input
        v-model.trim="q.patientId"
        class="studylist__f studylist__f--id"
        :placeholder="t('wlPatientId')"
        :aria-label="t('wlPatientId')"
      />
      <input
        v-model.trim="q.accessionNumber"
        class="studylist__f studylist__f--acc"
        :placeholder="t('wlAccession')"
        :aria-label="t('wlAccession')"
      />
      <input
        v-model.trim="q.modality"
        class="studylist__f studylist__f--mod"
        :placeholder="t('wlModality')"
        :aria-label="t('wlModality')"
      />
      <button class="studylist__search" type="submit" :disabled="!canSearch">
        {{ t("wlSearch") }}
      </button>
    </form>

    <div v-if="loading" class="studylist__status">{{ t("wlSearching") }}</div>
    <table v-else-if="studies.length" class="studylist__table">
      <thead>
        <tr>
          <th>{{ t("groupPatient") }}</th>
          <th>{{ t("wlStudyDate") }}</th>
          <th>{{ t("wlDescription") }}</th>
          <th>{{ t("wlModality") }}</th>
          <th class="studylist__num">{{ t("series") }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="s in studies"
          :key="s.studyInstanceUID"
          class="studylist__row"
          :class="{ 'studylist__row--open': isOpen(s.studyInstanceUID) }"
          :tabindex="isOpen(s.studyInstanceUID) ? -1 : 0"
          @click="!isOpen(s.studyInstanceUID) && $emit('open', s.studyInstanceUID)"
          @keydown.enter="!isOpen(s.studyInstanceUID) && $emit('open', s.studyInstanceUID)"
        >
          <td>{{ s.patientName }}</td>
          <td>{{ s.studyDate }}</td>
          <td>{{ s.studyDescription }}</td>
          <td>{{ (s.modalitiesInStudy || []).join(", ") }}</td>
          <td class="studylist__num">{{ s.numberOfSeries }}</td>
        </tr>
      </tbody>
    </table>
    <div v-else-if="searched" class="studylist__status studylist__empty">
      {{ t("wlNoResults") }}
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import type { DataSource, StudyQuery, StudySummary } from "@orbidicom/core";
import { t, dir, getLang } from "../i18n";

const props = defineProps<{ source: DataSource; openUids?: string[] }>();
defineEmits<{ open: [studyInstanceUID: string] }>();

const layoutDir = computed(() => dir(getLang()));
const q = reactive<StudyQuery>({});
const studies = ref<StudySummary[]>([]);
const loading = ref(false);
const searched = ref(false);

// The UI never branches on backend type; it just honors the advertised capability.
const canSearch = computed(
  () =>
    !!props.source.capabilities?.studySearch && typeof props.source.searchStudies === "function",
);

const isOpen = (uid: string) => !!props.openUids?.includes(uid);

/** Only forward the filters the user actually filled in (empty strings dropped). */
function cleanQuery(): StudyQuery {
  const out: StudyQuery = {};
  if (q.patientName) out.patientName = q.patientName;
  if (q.patientId) out.patientId = q.patientId;
  if (q.accessionNumber) out.accessionNumber = q.accessionNumber;
  if (q.modality) out.modality = q.modality;
  return out;
}

async function run() {
  if (!canSearch.value) return;
  loading.value = true;
  searched.value = true;
  try {
    studies.value = await props.source.searchStudies!(cleanQuery());
  } finally {
    loading.value = false;
  }
}
</script>
<style scoped>
.studylist {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  background: var(--panel);
  color: var(--text);
  border-radius: var(--r-md);
  font-family: var(--font);
}
.studylist__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.studylist__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.studylist__f {
  flex: 1 1 140px;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border-radius: var(--r-sm);
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  font: inherit;
  font-size: 13px;
}
.studylist__f:focus-visible {
  outline: 2px solid var(--accent-strong);
  outline-offset: 1px;
  border-color: var(--accent-strong);
}
.studylist__search {
  flex: 0 0 auto;
  height: 34px;
  padding: 0 16px;
  border-radius: var(--r-sm);
  background: var(--accent);
  color: var(--text);
  border: 1px solid color-mix(in srgb, var(--accent-strong) 60%, var(--border));
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s;
}
.studylist__search:hover:not(:disabled) {
  background: var(--accent-strong);
}
.studylist__search:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.studylist__status {
  padding: 16px 8px;
  color: var(--muted);
  font-size: 13px;
  text-align: center;
}
.studylist__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.studylist__table th {
  text-align: start;
  padding: 6px 10px;
  color: var(--muted);
  font-weight: 600;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
.studylist__num {
  text-align: end;
}
.studylist__row {
  cursor: pointer;
  transition: background 0.1s;
}
.studylist__row td {
  padding: 8px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
}
.studylist__row:hover,
.studylist__row:focus-visible {
  background: color-mix(in srgb, var(--accent-strong) 16%, transparent);
  outline: none;
}
.studylist__row--open {
  opacity: 0.45;
  cursor: default;
}
.studylist__row--open:hover {
  background: transparent;
}
</style>
