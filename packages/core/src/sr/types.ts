// Normalized DICOM Structured Report (SR) tree. Both source adapters (DICOMweb
// DICOM-JSON and local dicom-parser) emit this shape, so the UI renders SR
// source-agnostically; it never branches on backend type.

export type SrValueType =
  | "CONTAINER"
  | "TEXT"
  | "NUM"
  | "CODE"
  | "DATE"
  | "TIME"
  | "DATETIME"
  | "PNAME"
  | "UIDREF"
  | "SCOORD"
  | "SCOORD3D"
  | "TCOORD"
  | "IMAGE"
  | "WAVEFORM"
  | "COMPOSITE"
  | "UNKNOWN";

/** Recognized SR value types (anything else normalizes to "UNKNOWN"). */
export const SR_VALUE_TYPES: ReadonlySet<SrValueType> = new Set<SrValueType>([
  "CONTAINER",
  "TEXT",
  "NUM",
  "CODE",
  "DATE",
  "TIME",
  "DATETIME",
  "PNAME",
  "UIDREF",
  "SCOORD",
  "SCOORD3D",
  "TCOORD",
  "IMAGE",
  "WAVEFORM",
  "COMPOSITE",
]);

/** A coded concept (Code Value / Coding Scheme / Code Meaning). */
export interface SrCode {
  value?: string;
  scheme?: string;
  meaning?: string;
}

/** A reference to another SOP instance (IMAGE / COMPOSITE / WAVEFORM, SCOORD's image). */
export interface SrRef {
  sopClassUid?: string;
  sopInstanceUid?: string;
  frames?: number[];
}

/** One node of the SR content tree. */
export interface SrNode {
  valueType: SrValueType;
  /** Relationship to the parent (CONTAINS, HAS PROPERTIES, …); absent on the root. */
  relationship?: string;
  conceptName?: SrCode;
  text?: string;
  num?: { value: number; unit?: SrCode };
  code?: SrCode;
  dateTime?: string;
  personName?: string;
  uid?: string;
  ref?: SrRef;
  children: SrNode[];
}

export interface SrTree {
  title?: string;
  root: SrNode;
}
