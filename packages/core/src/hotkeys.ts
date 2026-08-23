/**
 * Keyboard shortcuts: a framework-agnostic keymap + resolver. This module is
 * pure data and pure functions (no DOM, no Vue, no Cornerstone): the UI layer
 * listens for keydown, calls {@link resolveHotkey}, and dispatches the returned
 * command. Hosts can pass their own {@link Keymap} to remap or disable keys.
 */

/** Logical tool name: a key of the `TOOLS` map exported from `cornerstone/init`. */
export type ToolKey =
  | "WindowLevel"
  | "Pan"
  | "Zoom"
  | "Length"
  | "Angle"
  | "Rectangle"
  | "Ellipse"
  | "Circle"
  | "Probe";

/** A resolved shortcut: what the UI should do for a pressed key. */
export type HotkeyCommand =
  | { kind: "tool"; tool: ToolKey }
  | { kind: "invert" }
  | { kind: "rotate" }
  | { kind: "flipH" }
  | { kind: "reset" }
  | { kind: "cine" }
  /** Toggle the active cell's current slice as a key image. */
  | { kind: "keyImage" }
  | { kind: "scroll"; delta: number }
  /** Apply the Nth (0-based) window preset registered for the active modality. */
  | { kind: "preset"; index: number };

/** Map of a normalized key string (see {@link resolveHotkey}) to its command. */
export type Keymap = Record<string, HotkeyCommand>;

/**
 * Built-in shortcuts. Single letters are conventional radiology-viewer keys;
 * digits 1–9 apply window presets; arrows page through slices. Keys are matched
 * after normalization: single-character keys are lower-cased, named keys
 * (`ArrowLeft`, ` `) are used verbatim.
 */
export const DEFAULT_KEYMAP: Keymap = {
  // Left-button tools.
  w: { kind: "tool", tool: "WindowLevel" },
  p: { kind: "tool", tool: "Pan" },
  z: { kind: "tool", tool: "Zoom" },
  l: { kind: "tool", tool: "Length" },
  a: { kind: "tool", tool: "Angle" },
  b: { kind: "tool", tool: "Rectangle" },
  e: { kind: "tool", tool: "Ellipse" },
  c: { kind: "tool", tool: "Circle" },
  d: { kind: "tool", tool: "Probe" },
  // View transforms.
  i: { kind: "invert" },
  r: { kind: "rotate" },
  f: { kind: "flipH" },
  "0": { kind: "reset" },
  // Key-image flag toggle.
  k: { kind: "keyImage" },
  // Cine play/pause.
  " ": { kind: "cine" },
  // Slice navigation.
  ArrowRight: { kind: "scroll", delta: 1 },
  ArrowDown: { kind: "scroll", delta: 1 },
  ArrowLeft: { kind: "scroll", delta: -1 },
  ArrowUp: { kind: "scroll", delta: -1 },
  // Window presets (1 = first registered preset for the modality, …).
  "1": { kind: "preset", index: 0 },
  "2": { kind: "preset", index: 1 },
  "3": { kind: "preset", index: 2 },
  "4": { kind: "preset", index: 3 },
  "5": { kind: "preset", index: 4 },
  "6": { kind: "preset", index: 5 },
  "7": { kind: "preset", index: 6 },
  "8": { kind: "preset", index: 7 },
  "9": { kind: "preset", index: 8 },
};

/** The subset of `KeyboardEvent` {@link resolveHotkey} needs (so it's testable). */
export interface KeyEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

/** An undo/redo intent resolved from a Ctrl/Cmd-modified keydown. */
export type EditCommand = { kind: "undo" } | { kind: "redo" };

/** Normalize an event key the way {@link DEFAULT_KEYMAP} is keyed. */
export function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

/**
 * Resolve a keydown to a command, or `null` if the key isn't bound. Returns
 * `null` when Ctrl/Cmd/Alt is held so browser and OS shortcuts (Ctrl+W, Cmd+R,
 * …) are never hijacked. Shift is allowed (it doesn't change our single-key/
 * digit bindings).
 */
export function resolveHotkey(e: KeyEventLike, map: Keymap = DEFAULT_KEYMAP): HotkeyCommand | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  return map[normalizeKey(e.key)] ?? null;
}

/**
 * Resolve an editor-style undo/redo shortcut, or `null` if the keydown isn't one.
 * Requires a Ctrl/Cmd modifier (so it's complementary to {@link resolveHotkey},
 * which deliberately ignores Ctrl/Cmd): Ctrl/Cmd+Z is undo, Ctrl/Cmd+Shift+Z and
 * Ctrl/Cmd+Y are redo. The UI calls this first and `preventDefault`s on a match.
 */
export function resolveEditCommand(e: KeyEventLike): EditCommand | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const key = normalizeKey(e.key);
  if (key === "z") return e.shiftKey ? { kind: "redo" } : { kind: "undo" };
  if (key === "y") return { kind: "redo" };
  return null;
}
