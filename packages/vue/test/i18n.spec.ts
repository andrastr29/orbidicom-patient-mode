import { describe, it, expect, beforeEach } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import {
  t,
  setLang,
  getLang,
  LOCALES,
  STRINGS,
  localeName,
  isRtl,
  dir,
  formatDicomDate,
} from "../src/i18n";

describe("i18n", () => {
  beforeEach(() => setLang("en"));

  it("every locale defines the same key set as English (no silent gaps)", () => {
    // The non-English locales are independent literals, not constrained by the
    // I18nKey type, so a missing key would only surface as a silent English
    // fallback at runtime. Assert key-set parity to catch it.
    const enKeys = Object.keys(STRINGS.en).sort();
    expect(enKeys.length).toBeGreaterThan(0);
    for (const [code, table] of Object.entries(STRINGS)) {
      expect(Object.keys(table).sort(), `locale "${code}"`).toEqual(enKeys);
    }
  });

  it("ships the twenty built-in locales", () => {
    expect(LOCALES.map((l) => l.code)).toEqual([
      "en",
      "tr",
      "de",
      "es",
      "fr",
      "it",
      "pt",
      "ru",
      "zh",
      "ja",
      "ko",
      "hi",
      "id",
      "nl",
      "pl",
      "ar",
      "fa",
      "bn",
      "vi",
      "uk",
    ]);
  });

  it("translates a key in each shipped locale (not just falling back to English)", () => {
    const samples: Record<string, string> = {
      fr: "Chargement…",
      it: "Caricamento…",
      pt: "Carregando…",
      ru: "Загрузка…",
      zh: "加载中…",
      ja: "読み込み中…",
      ko: "로딩 중…",
      hi: "लोड हो रहा है…",
      id: "Memuat…",
      nl: "Laden…",
      pl: "Ładowanie…",
      ar: "جارٍ التحميل…",
      fa: "در حال بارگذاری…",
      bn: "লোড হচ্ছে…",
      vi: "Đang tải…",
      uk: "Завантаження…",
    };
    for (const [code, expected] of Object.entries(samples)) {
      setLang(code);
      expect(t("loading")).toBe(expected);
    }
  });

  it("flags right-to-left languages (Arabic, Persian) and resolves a dir attribute value", () => {
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("fa")).toBe(true);
    expect(isRtl("en")).toBe(false);
    expect(isRtl("uk")).toBe(false);
    expect(dir("ar")).toBe("rtl");
    expect(dir("en")).toBe("ltr");
    // Without an explicit code, dir() follows the active language.
    setLang("ar");
    expect(dir()).toBe("rtl");
    expect(isRtl()).toBe(true);
    setLang("en");
    expect(dir()).toBe("ltr");
  });

  it("returns strings for the active language", () => {
    setLang("tr");
    expect(t("loading")).toBe("Yükleniyor…");
  });

  it("renders language names as exonyms in the active language (Intl.DisplayNames)", () => {
    expect(localeName("ko", "en")).toBe("Korean");
    expect(localeName("ko", "tr")).toBe("Korece"); // Korean, in Turkish
    expect(localeName("de", "tr")).toBe("Almanca"); // German, in Turkish
    // Reading without an explicit lang follows the active language.
    setLang("tr");
    expect(localeName("ja")).toBe("Japonca");
    // Unknown display locale → resolves gracefully to a non-empty name (never the
    // bare code); the endonym is the final fallback if Intl.DisplayNames is absent.
    expect(localeName("ko", "zz")).toBeTruthy();
    expect(localeName("ko", "zz")).not.toBe("ko");
  });

  it("falls back to English for an unknown language", () => {
    setLang("xx");
    expect(t("loading")).toBe("Loading…");
    expect(getLang()).toBe("en"); // unknown language normalizes to en
  });

  it("re-renders translations reactively when the language changes", async () => {
    const Probe = defineComponent({ setup: () => () => h("span", t("cancel")) });
    const w = mount(Probe);
    expect(w.text()).toBe("Cancel");
    setLang("de");
    await nextTick();
    expect(w.text()).toBe("Abbrechen");
  });
});

describe("formatDicomDate", () => {
  it("formats a DICOM DA string for the active locale", () => {
    setLang("en");
    const out = formatDicomDate("20260314");
    expect(out).not.toBe("20260314"); // not the raw DA string
    expect(out).toMatch(/2026/);
  });

  it("renders the same instant differently in a different locale", () => {
    expect(formatDicomDate("20260314", "en")).not.toBe(formatDicomDate("20260314", "ja"));
  });

  it("falls back to the ISO string when the value is not a DICOM date", () => {
    expect(formatDicomDate("not-a-date")).toBe("not-a-date");
  });

  it("returns an empty string for a missing date", () => {
    expect(formatDicomDate(undefined)).toBe("");
    expect(formatDicomDate("")).toBe("");
  });
});
