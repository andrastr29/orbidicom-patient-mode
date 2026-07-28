<template>
  <div class="dock">
    <div class="dock__panel" :class="{ 'dock__panel--open': open }">
      <!-- Host actions (e.g. a "New study" button) injected by the app. -->
      <slot />
      <LangSwitcher />
      <p class="dock__hint">
        <svg
          class="dock__hint-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 5v14" />
          <path d="m8 9 4-4 4 4" />
          <path d="m8 15 4 4 4-4" />
        </svg>
        <span>{{ t("hint") }}</span>
      </p>
      <!-- About: which build of the viewer is running. Untranslated on purpose —
           the product name and a semver string read the same in every locale, and
           dir="ltr" keeps them in that order inside an RTL layout. -->
      <p class="dock__about" dir="ltr">
        <span class="dock__about-name">OrbiDICOM</span>
        <span class="dock__about-version">v{{ VERSION }}</span>
      </p>
    </div>
  </div>
</template>
<script setup lang="ts">
import LangSwitcher from "./LangSwitcher.vue";
import { t } from "../i18n";
import { VERSION } from "../version";

// `open` is parent-controlled: it only matters on phones, where the panel is a
// dropdown toggled by the header hamburger. On desktop the panel is always shown
// as a cluster pinned to the bottom of the left rail.
defineProps<{ open?: boolean }>();
</script>
<style scoped>
.dock {
  flex: none;
}
/* Desktop: a tidy cluster pinned to the bottom of the left rail. Every control
   shares one full-width, 36px-tall rhythm so the button and the language field
   line up exactly. */
.dock__panel {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding: 12px 10px;
  border-top: 1px solid var(--border);
  background: var(--panel);
}
/* Stretch slotted host actions and the language field to the same full width. */
.dock__panel :deep(.lang) {
  width: 100%;
}
.dock__panel :slotted(button) {
  width: 100%;
}
.dock__hint {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 2px 2px 0;
  font-family: var(--font);
  font-size: 11px;
  line-height: 1.35;
  color: var(--hush);
}
.dock__hint-icon {
  flex: none;
  width: 14px;
  height: 14px;
  opacity: 0.8;
}
/* Sits under a hairline at the very bottom of the cluster — present, but the
   quietest thing in the rail. */
.dock__about {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin: 4px 2px 0;
  padding-top: 8px;
  border-top: 1px solid var(--border);
  font-family: var(--font);
  font-size: 11px;
  line-height: 1.35;
  color: var(--hush);
}
.dock__about-name {
  letter-spacing: 0.02em;
}
.dock__about-version {
  font-family: var(--mono);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 640px) {
  /* Phones: a dropdown anchored under the header hamburger, toggled by `open`. */
  .dock__panel {
    position: fixed;
    left: calc(10px + env(safe-area-inset-left, 0px));
    top: calc(56px + env(safe-area-inset-top, 0px));
    z-index: 70;
    display: none;
    min-width: 220px;
    max-width: calc(100vw - 20px);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.55);
  }
  .dock__panel--open {
    display: flex;
  }
}
</style>
