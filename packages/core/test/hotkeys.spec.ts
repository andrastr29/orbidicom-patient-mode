import { describe, it, expect } from "vitest";
import { resolveHotkey, resolveEditCommand, normalizeKey, DEFAULT_KEYMAP } from "../src/hotkeys";

describe("resolveHotkey", () => {
  it("maps tool letters to tool commands (case-insensitive)", () => {
    expect(resolveHotkey({ key: "z" })).toEqual({ kind: "tool", tool: "Zoom" });
    expect(resolveHotkey({ key: "W" })).toEqual({ kind: "tool", tool: "WindowLevel" });
    expect(resolveHotkey({ key: "b" })).toEqual({ kind: "tool", tool: "Rectangle" });
    expect(resolveHotkey({ key: "c" })).toEqual({ kind: "tool", tool: "Circle" });
  });

  it("maps view-transform keys", () => {
    expect(resolveHotkey({ key: "i" })).toEqual({ kind: "invert" });
    expect(resolveHotkey({ key: "r" })).toEqual({ kind: "rotate" });
    expect(resolveHotkey({ key: "f" })).toEqual({ kind: "flipH" });
    expect(resolveHotkey({ key: "0" })).toEqual({ kind: "reset" });
  });

  it("maps 'k' to toggling the current slice as a key image", () => {
    expect(resolveHotkey({ key: "k" })).toEqual({ kind: "keyImage" });
    expect(resolveHotkey({ key: "K" })).toEqual({ kind: "keyImage" });
  });

  it("maps space to cine and arrows to slice scrolling", () => {
    expect(resolveHotkey({ key: " " })).toEqual({ kind: "cine" });
    expect(resolveHotkey({ key: "ArrowRight" })).toEqual({ kind: "scroll", delta: 1 });
    expect(resolveHotkey({ key: "ArrowDown" })).toEqual({ kind: "scroll", delta: 1 });
    expect(resolveHotkey({ key: "ArrowLeft" })).toEqual({ kind: "scroll", delta: -1 });
    expect(resolveHotkey({ key: "ArrowUp" })).toEqual({ kind: "scroll", delta: -1 });
  });

  it("maps digit keys to 0-based preset indices", () => {
    expect(resolveHotkey({ key: "1" })).toEqual({ kind: "preset", index: 0 });
    expect(resolveHotkey({ key: "5" })).toEqual({ kind: "preset", index: 4 });
    expect(resolveHotkey({ key: "9" })).toEqual({ kind: "preset", index: 8 });
  });

  it("returns null for unbound keys", () => {
    expect(resolveHotkey({ key: "q" })).toBeNull();
    expect(resolveHotkey({ key: "Enter" })).toBeNull();
  });

  it("ignores keys held with Ctrl/Cmd/Alt so browser & OS shortcuts pass through", () => {
    expect(resolveHotkey({ key: "w", ctrlKey: true })).toBeNull();
    expect(resolveHotkey({ key: "r", metaKey: true })).toBeNull();
    expect(resolveHotkey({ key: "z", altKey: true })).toBeNull();
    // Shift is fine; it doesn't change our single-key bindings.
    expect(resolveHotkey({ key: "Z" })).toEqual({ kind: "tool", tool: "Zoom" });
  });

  it("honors a custom keymap (remap / disable)", () => {
    const map = { x: DEFAULT_KEYMAP.z };
    expect(resolveHotkey({ key: "x" }, map)).toEqual({ kind: "tool", tool: "Zoom" });
    expect(resolveHotkey({ key: "z" }, map)).toBeNull();
  });

  it("normalizeKey lower-cases single chars but keeps named keys verbatim", () => {
    expect(normalizeKey("A")).toBe("a");
    expect(normalizeKey("ArrowLeft")).toBe("ArrowLeft");
    expect(normalizeKey(" ")).toBe(" ");
  });
});

describe("resolveEditCommand", () => {
  it("maps Ctrl/Cmd+Z (no Shift) to undo", () => {
    expect(resolveEditCommand({ key: "z", ctrlKey: true })).toEqual({ kind: "undo" });
    expect(resolveEditCommand({ key: "Z", metaKey: true })).toEqual({ kind: "undo" });
  });

  it("maps Ctrl/Cmd+Shift+Z to redo", () => {
    expect(resolveEditCommand({ key: "z", ctrlKey: true, shiftKey: true })).toEqual({
      kind: "redo",
    });
    expect(resolveEditCommand({ key: "Z", metaKey: true, shiftKey: true })).toEqual({
      kind: "redo",
    });
  });

  it("maps Ctrl/Cmd+Y to redo", () => {
    expect(resolveEditCommand({ key: "y", ctrlKey: true })).toEqual({ kind: "redo" });
    expect(resolveEditCommand({ key: "Y", metaKey: true })).toEqual({ kind: "redo" });
  });

  it("returns null without a Ctrl/Cmd modifier", () => {
    expect(resolveEditCommand({ key: "z" })).toBeNull();
    expect(resolveEditCommand({ key: "y" })).toBeNull();
  });

  it("returns null for unrelated Ctrl/Cmd combos (e.g. copy/cut)", () => {
    expect(resolveEditCommand({ key: "c", ctrlKey: true })).toBeNull();
    expect(resolveEditCommand({ key: "x", metaKey: true })).toBeNull();
  });

  it("does not collide with resolveHotkey, which ignores Ctrl/Cmd combos", () => {
    expect(resolveHotkey({ key: "z", ctrlKey: true })).toBeNull();
    expect(resolveHotkey({ key: "y", metaKey: true })).toBeNull();
  });
});
