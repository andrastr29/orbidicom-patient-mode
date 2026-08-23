import { describe, it, expect } from "vitest";
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import Toolbar from "../src/components/Toolbar.vue";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Toolbar", () => {
  it("shows W/L presets for CT and emits the chosen preset object", async () => {
    const w = mount(Toolbar, {
      props: { modality: "CT", activeTool: "WindowLevel", layout: 1 },
    });
    const opts = w.findAll(".wl__select option");
    expect(opts.length).toBeGreaterThan(1); // "Preset…" + CT windows
    await w.find(".wl__select").setValue("Lung");
    const preset = w.emitted("preset")?.[0]?.[0] as { windowWidth: number; windowCenter: number };
    expect(preset).toMatchObject({ windowWidth: 1500, windowCenter: -600 });
  });

  it("hides the W/L control for non-CT modalities", () => {
    const w = mount(Toolbar, {
      props: { modality: "MR", activeTool: "WindowLevel", layout: 1 },
    });
    expect(w.find(".wl__select").exists()).toBe(false);
  });

  it("renders the download button only when canDownload is true", () => {
    const without = mount(Toolbar, {
      props: { modality: "MR", activeTool: "WindowLevel", layout: 1 },
    });
    expect(without.find(".tbtn--download").exists()).toBe(false);
    const withDl = mount(Toolbar, {
      props: { modality: "MR", activeTool: "WindowLevel", layout: 1, canDownload: true },
    });
    expect(withDl.find(".tbtn--download").exists()).toBe(true);
  });

  it("renders the download-image button only when canDownloadImage is true, and emits", async () => {
    const without = mount(Toolbar, {
      props: { modality: "CT", activeTool: "WindowLevel", layout: 1 },
    });
    expect(without.find(".tbtn--download-image").exists()).toBe(false);

    const w = mount(Toolbar, {
      props: { modality: "CT", activeTool: "WindowLevel", layout: 1, canDownloadImage: true },
    });
    const btn = w.find(".tbtn--download-image");
    expect(btn.exists()).toBe(true);
    await btn.trigger("click");
    expect(w.emitted("downloadImage")).toBeTruthy();
  });

  it("shows the measurement-export buttons when canExportMeasurements and emits the format", async () => {
    const without = mount(Toolbar, {
      props: { modality: "CT", activeTool: "WindowLevel", layout: 1 },
    });
    expect(without.find(".tbtn--export-measurements").exists()).toBe(false);

    const w = mount(Toolbar, {
      props: { modality: "CT", activeTool: "WindowLevel", layout: 1, canExportMeasurements: true },
    });
    const buttons = w.find(".tbtn--export-measurements").findAll("button");
    expect(buttons).toHaveLength(2);
    await buttons[0].trigger("click");
    await buttons[1].trigger("click");
    expect(w.emitted("exportMeasurements")).toEqual([["json"], ["csv"]]);
  });

  it("emits undo/redo from their buttons, disabled until canUndo/canRedo", async () => {
    const off = mount(Toolbar, {
      props: { modality: "MR", activeTool: "WindowLevel", layout: 1 },
    });
    expect(off.find(".tbtn--undo").attributes("disabled")).toBeDefined();
    expect(off.find(".tbtn--redo").attributes("disabled")).toBeDefined();

    const w = mount(Toolbar, {
      props: { modality: "MR", activeTool: "WindowLevel", layout: 1, canUndo: true, canRedo: true },
    });
    expect(w.find(".tbtn--undo").attributes("disabled")).toBeUndefined();
    expect(w.find(".tbtn--redo").attributes("disabled")).toBeUndefined();
    await w.find(".tbtn--undo").trigger("click");
    await w.find(".tbtn--redo").trigger("click");
    expect(w.emitted("undo")).toBeTruthy();
    expect(w.emitted("redo")).toBeTruthy();
  });

  it("shows the key-image star only with an image stack, toggles active, and emits", async () => {
    const noImage = mount(Toolbar, {
      props: { modality: "MR", activeTool: "WindowLevel", layout: 1 },
    });
    expect(noImage.find(".tbtn--keyimage").exists()).toBe(false);

    const w = mount(Toolbar, {
      props: { modality: "CT", activeTool: "WindowLevel", layout: 1, canDownloadImage: true },
    });
    const star = w.find(".tbtn--keyimage");
    expect(star.exists()).toBe(true);
    expect(star.classes()).not.toContain("tbtn--active");
    await star.trigger("click");
    expect(w.emitted("toggleKeyImage")).toBeTruthy();

    const flagged = mount(Toolbar, {
      props: {
        modality: "CT",
        activeTool: "WindowLevel",
        layout: 1,
        canDownloadImage: true,
        isKeyImage: true,
      },
    });
    expect(flagged.find(".tbtn--keyimage").classes()).toContain("tbtn--active");
  });

  it("shows the key-image export button with a count and emits exportKeyImages", async () => {
    const none = mount(Toolbar, {
      props: { modality: "CT", activeTool: "WindowLevel", layout: 1, canDownloadImage: true },
    });
    expect(none.find(".tbtn--export-keyimages").exists()).toBe(false);

    const w = mount(Toolbar, {
      props: {
        modality: "CT",
        activeTool: "WindowLevel",
        layout: 1,
        canDownloadImage: true,
        keyImageCount: 3,
      },
    });
    const btn = w.find(".tbtn--export-keyimages");
    expect(btn.exists()).toBe(true);
    // The hover label (via v-tip -> data-tip) carries the flagged count.
    expect(btn.attributes("data-tip")).toContain("3");
    await btn.trigger("click");
    expect(w.emitted("exportKeyImages")).toBeTruthy();
  });

  it("shows the upload-SR button only when canUploadSr and emits uploadSr", async () => {
    const off = mount(Toolbar, {
      props: { modality: "CT", activeTool: "WindowLevel", layout: 1, canDownloadImage: true },
    });
    expect(off.find(".tbtn--upload-sr").exists()).toBe(false);

    const w = mount(Toolbar, {
      props: {
        modality: "CT",
        activeTool: "WindowLevel",
        layout: 1,
        canDownloadImage: true,
        canUploadSr: true,
      },
    });
    const btn = w.find(".tbtn--upload-sr");
    expect(btn.exists()).toBe(true);
    await btn.trigger("click");
    expect(w.emitted("uploadSr")).toBeTruthy();
  });

  it("emits tool when a tool button is clicked", async () => {
    const w = mount(Toolbar, {
      props: { modality: "MR", activeTool: "WindowLevel", layout: 1 },
    });
    await w.findAll(".tbtn")[0].trigger("click");
    expect(w.emitted("tool")).toBeTruthy();
  });

  it("offers the plain circle annotation next to the measuring ROIs", async () => {
    const w = mount(Toolbar, {
      props: { modality: "MR", activeTool: "WindowLevel", layout: 1 },
    });
    const circle = w
      .findAll("button.tbtn")
      .find((b) => b.attributes("data-tip") === "Circle (no measurements)")!;
    expect(circle).toBeTruthy();
    await circle.trigger("click");
    expect(w.emitted("tool")?.[0]).toEqual(["CircleROI"]);
  });

  it("emits toggleMenu from the header hamburger", async () => {
    const w = mount(Toolbar, {
      props: { modality: "MR", activeTool: "WindowLevel", layout: 1, menuOpen: false },
    });
    await w.find(".toolbar__menu").trigger("click");
    expect(w.emitted("toggleMenu")).toBeTruthy();
  });

  it("cycles the overlay/privacy mode from the info button", async () => {
    const w = mount(Toolbar, {
      props: { modality: "MR", activeTool: "WindowLevel", layout: 1, overlayMode: "full" },
    });
    await w.find(".tbtn--overlay").trigger("click");
    expect(w.emitted("cycleOverlay")).toBeTruthy();
  });

  it("offers grid layouts and emits setLayout with the chosen cell count", async () => {
    const w = mount(Toolbar, {
      props: { modality: "MR", activeTool: "WindowLevel", layout: 1 },
    });
    const opts = w.findAll(".layout__select option").map((o) => o.attributes("value"));
    expect(opts).toEqual(["1", "2", "2v", "4", "6", "8", "10", "mpr"]);
    await w.find(".layout__select").setValue("6");
    expect(w.emitted("setLayout")?.[0]).toEqual([6]);
  });

  it("offers a stacked 2×1 grid that emits the '2v' sentinel", async () => {
    const w = mount(Toolbar, {
      props: { modality: "MR", activeTool: "WindowLevel", layout: 1 },
    });
    const stacked = w
      .findAll(".layout__select option")
      .find((o) => o.attributes("value") === "2v")!;
    expect(stacked.text()).toBe("2×1");
    await w.find(".layout__select").setValue("2v");
    expect(w.emitted("setLayout")?.[0]).toEqual(["2v"]);
  });

  it("reflects the active 2×1 (stacked) variant in the selector value", () => {
    const w = mount(Toolbar, {
      props: { modality: "MR", activeTool: "WindowLevel", layout: 2, stacked: true },
    });
    expect((w.find(".layout__select").element as HTMLSelectElement).value).toBe("2v");
  });

  it("always lists the MPR / 3D option but disables it (with a tooltip) when not volume-capable", () => {
    const off = mount(Toolbar, {
      props: { modality: "US", activeTool: "WindowLevel", layout: 1, canMpr: false },
    });
    const mprOff = off
      .findAll(".layout__select option")
      .find((o) => o.attributes("value") === "mpr")!;
    expect(mprOff.attributes("disabled")).toBeDefined();
    expect(mprOff.attributes("title")).toBeTruthy(); // explains why it's unavailable

    const on = mount(Toolbar, {
      props: { modality: "CT", activeTool: "WindowLevel", layout: 1, canMpr: true },
    });
    const mprOn = on
      .findAll(".layout__select option")
      .find((o) => o.attributes("value") === "mpr")!;
    expect(mprOn.attributes("disabled")).toBeUndefined();
  });

  it("surfaces a themed hover tooltip inside .orbidicom with the shortcut keycap, and hides on leave", async () => {
    // Mount inside a .orbidicom host: the theme CSS vars are scoped to that
    // container, so the chip must teleport there (not <body>) to be styled.
    const host = document.createElement("div");
    host.className = "orbidicom";
    document.body.appendChild(host);
    const w = mount(Toolbar, {
      props: { modality: "CT", activeTool: "WindowLevel", layout: 1 },
      attachTo: host,
    });
    // v-tip mirrors the label into aria-label so icon-only buttons stay accessible.
    const zoom = w.findAll("button.tbtn").find((b) => b.attributes("data-tip") === "Zoom")!;
    expect(zoom).toBeTruthy();
    expect(zoom.attributes("aria-label")).toBe("Zoom");
    expect(zoom.attributes("data-tip-key")).toBe("Z");

    await zoom.trigger("pointerover", { pointerType: "mouse" });
    await wait(120); // showTip() debounces ~90ms before revealing the chip
    await nextTick();
    // The chip lives within the themed container, not loose in <body>.
    const tip = host.querySelector(".tip");
    expect(tip).toBeTruthy();
    expect(tip!.closest(".orbidicom")).toBe(host);
    expect(tip!.textContent).toContain("Zoom");
    expect(tip!.querySelector(".tip__key")?.textContent).toBe("Z");

    await zoom.trigger("pointerout", { pointerType: "mouse" });
    await nextTick();
    expect(host.querySelector(".tip")).toBeNull();
    w.unmount();
    host.remove();
  });

  it("never opens the tooltip for touch input", async () => {
    const host = document.createElement("div");
    host.className = "orbidicom";
    document.body.appendChild(host);
    const w = mount(Toolbar, {
      props: { modality: "CT", activeTool: "WindowLevel", layout: 1 },
      attachTo: host,
    });
    const zoom = w.findAll("button.tbtn").find((b) => b.attributes("data-tip") === "Zoom")!;
    await zoom.trigger("pointerover", { pointerType: "touch" });
    await wait(120);
    await nextTick();
    expect(host.querySelector(".tip")).toBeNull();
    w.unmount();
    host.remove();
  });
});
