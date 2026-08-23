import { registerWindowPreset, listWindowPresets, type WlPreset } from "./registry";

const CT: Omit<WlPreset, "modality">[] = [
  { name: "Soft Tissue", windowWidth: 400, windowCenter: 40 },
  { name: "Bone", windowWidth: 2000, windowCenter: 500 },
  { name: "Lung", windowWidth: 1500, windowCenter: -600 },
  { name: "Brain", windowWidth: 80, windowCenter: 40 },
  { name: "Abdomen", windowWidth: 350, windowCenter: 50 },
];

let seeded = false;

/** Register the built-in CT windows. Idempotent. */
export function seedDefaultPresets(): void {
  if (seeded) return;
  for (const p of CT) registerWindowPreset({ modality: "CT", ...p });
  seeded = true;
}

/**
 * Window presets registered for a modality, in registration order.
 *
 * Fixed W/L windows are only standardized for CT (Hounsfield units), so CT ships
 * with the five built-ins above and other modalities (MR, US, …) start empty:
 * their intensities are image-specific, so a fixed window is meaningless and the
 * toolbar hides the control (the W/L drag tool and Reset still apply).
 *
 * It is no longer CT-only, though: a host app can register its own protocol
 * windows for ANY modality via `registerWindowPreset({ modality, name,
 * windowWidth, windowCenter })` and they appear here (and in the toolbar) for
 * that modality. Matching is case-insensitive.
 */
export function windowPresetsFor(modality: string): readonly WlPreset[] {
  seedDefaultPresets();
  return modality ? listWindowPresets(modality) : [];
}
