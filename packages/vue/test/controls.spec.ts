import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import Controls from "../src/components/Controls.vue";
import { VERSION } from "../src/version";
import pkg from "../package.json";

describe("Controls", () => {
  it("renders host slot actions, the language switcher, and the scroll hint", () => {
    const w = mount(Controls, {
      props: { open: false },
      slots: { default: '<button class="host-action">New study</button>' },
    });
    expect(w.find(".host-action").exists()).toBe(true);
    expect(w.find(".lang__button").exists()).toBe(true);
    expect(w.find(".dock__hint").exists()).toBe(true);
  });

  it("shows the running package version in the about row", () => {
    const w = mount(Controls, { props: { open: false } });
    const about = w.find(".dock__about");
    expect(about.exists()).toBe(true);
    expect(about.text()).toContain("OrbiDICOM");
    expect(about.find(".dock__about-version").text()).toBe(`v${pkg.version}`);
    // The About row lives in the dock, so it inherits the dock's placement:
    // bottom of the left rail on desktop, the hamburger dropdown on phones.
    expect(w.find(".dock__panel").element.contains(about.element)).toBe(true);
  });

  it("keeps VERSION in lockstep with package.json (bumps must not drift)", () => {
    expect(VERSION).toBe(pkg.version);
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("reflects the parent-controlled open state on the panel (mobile dropdown)", () => {
    const closed = mount(Controls, { props: { open: false } });
    expect(closed.find(".dock__panel--open").exists()).toBe(false);
    const open = mount(Controls, { props: { open: true } });
    expect(open.find(".dock__panel--open").exists()).toBe(true);
  });
});
