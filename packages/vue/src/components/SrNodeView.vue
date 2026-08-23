<template>
  <li class="srn">
    <div class="srn__row">
      <span v-if="heading" class="srn__concept">{{ heading }}</span>
      <span v-if="value" class="srn__value" :class="{ 'srn__value--muted': muted }">{{
        value
      }}</span>
    </div>
    <ul v-if="node.children.length" class="srn__children">
      <SrNodeView v-for="(child, i) in node.children" :key="i" :node="child" />
    </ul>
  </li>
</template>

<script setup lang="ts">
// Recursive renderer for one SR content node. Self-references by name (Vue 3
// resolves recursive components from the filename). All values are rendered via
// text interpolation (never v-html), so SR content can't inject markup.
import { computed } from "vue";
import type { SrNode } from "@orbidicom/core";
import { t } from "../i18n";

const props = defineProps<{ node: SrNode }>();

const heading = computed(() => props.node.conceptName?.meaning ?? "");
const muted = computed(() => !TEXTUAL.has(props.node.valueType));

const TEXTUAL = new Set([
  "TEXT",
  "NUM",
  "CODE",
  "DATE",
  "TIME",
  "DATETIME",
  "PNAME",
  "UIDREF",
  "CONTAINER",
]);

const value = computed(() => {
  const n = props.node;
  switch (n.valueType) {
    case "TEXT":
      return n.text ?? "";
    case "NUM":
      return n.num ? `${n.num.value}${n.num.unit?.meaning ? ` ${n.num.unit.meaning}` : ""}` : "";
    case "CODE":
      return n.code?.meaning ?? n.code?.value ?? "";
    case "DATE":
    case "TIME":
    case "DATETIME":
      return n.dateTime ?? "";
    case "PNAME":
      return n.personName ?? "";
    case "UIDREF":
      return n.uid ?? "";
    case "CONTAINER":
      return ""; // heading only; children carry the content
    default:
      // SCOORD / SCOORD3D / TCOORD / IMAGE / WAVEFORM / COMPOSITE / UNKNOWN are
      // not rendered as rich content in this version (placeholder).
      return t("srUnsupported");
  }
});
</script>

<style scoped>
.srn {
  list-style: none;
}
.srn__row {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  align-items: baseline;
  padding: 2px 0;
}
.srn__concept {
  font-weight: 600;
  color: var(--accent-strong);
}
.srn__value {
  color: var(--text);
  white-space: pre-wrap;
}
.srn__value--muted {
  color: var(--hush);
  font-style: italic;
}
.srn__children {
  list-style: none;
  margin: 0;
  padding-left: 14px;
  border-left: 1px solid var(--border);
}
</style>
