// Adapter: WADO-RS DICOM-JSON instance metadata → normalized SrTree.
// The SR Content Sequence (0040,A730) is already inline in the metadata that
// DicomWebDataSource fetches, so this is parse-only, with no extra network round-trip.

import { SR_VALUE_TYPES, type SrTree, type SrNode, type SrValueType, type SrCode } from "./types";

type Ds = Record<string, unknown>;
type Elem = { vr?: string; Value?: unknown[] };

// SR content-item tags (DICOM-JSON keys are tag hex, uppercase, no parens).
const TAG = {
  RELATIONSHIP: "0040A010", // RelationshipType
  VALUE_TYPE: "0040A040", // ValueType
  CONCEPT_NAME: "0040A043", // ConceptNameCodeSequence
  CONTENT_SEQUENCE: "0040A730", // ContentSequence
  TEXT_VALUE: "0040A160", // TextValue
  CONCEPT_CODE: "0040A168", // ConceptCodeSequence (CODE value)
  MEASURED_VALUE: "0040A300", // MeasuredValueSequence (NUM)
  NUMERIC_VALUE: "0040A30A", // NumericValue
  MEASUREMENT_UNITS: "004008EA", // MeasurementUnitsCodeSequence
  DATETIME: "0040A120",
  DATE: "0040A121",
  TIME: "0040A122",
  PERSON_NAME: "0040A123",
  UID: "0040A124",
  CODE_VALUE: "00080100",
  CODING_SCHEME: "00080102",
  CODE_MEANING: "00080104",
} as const;

function val(ds: Ds, tag: string): unknown {
  return (ds[tag] as Elem | undefined)?.Value?.[0];
}
function str(ds: Ds, tag: string): string | undefined {
  const v = val(ds, tag);
  return v == null ? undefined : String(v);
}
function items(ds: Ds, tag: string): Ds[] {
  const v = (ds[tag] as Elem | undefined)?.Value;
  return Array.isArray(v) ? (v as Ds[]) : [];
}
function code(ds: Ds, tag: string): SrCode | undefined {
  const it = items(ds, tag)[0];
  if (!it) return undefined;
  return {
    value: str(it, TAG.CODE_VALUE),
    scheme: str(it, TAG.CODING_SCHEME),
    meaning: str(it, TAG.CODE_MEANING),
  };
}
function valueType(ds: Ds): SrValueType {
  const v = str(ds, TAG.VALUE_TYPE) as SrValueType | undefined;
  return v && SR_VALUE_TYPES.has(v) ? v : "UNKNOWN";
}
// DICOM-JSON person names are { Alphabetic, Ideographic, Phonetic } objects.
function personName(ds: Ds): string | undefined {
  const v = val(ds, TAG.PERSON_NAME);
  if (v && typeof v === "object") return (v as { Alphabetic?: string }).Alphabetic;
  return v == null ? undefined : String(v);
}

function node(ds: Ds): SrNode {
  const vt = valueType(ds);
  const n: SrNode = { valueType: vt, children: [] };
  const rel = str(ds, TAG.RELATIONSHIP);
  if (rel) n.relationship = rel;
  const cn = code(ds, TAG.CONCEPT_NAME);
  if (cn) n.conceptName = cn;

  switch (vt) {
    case "TEXT":
      n.text = str(ds, TAG.TEXT_VALUE);
      break;
    case "CODE":
      n.code = code(ds, TAG.CONCEPT_CODE);
      break;
    case "NUM": {
      const mv = items(ds, TAG.MEASURED_VALUE)[0];
      if (mv)
        n.num = {
          value: Number(val(mv, TAG.NUMERIC_VALUE)),
          unit: code(mv, TAG.MEASUREMENT_UNITS),
        };
      break;
    }
    case "DATETIME":
      n.dateTime = str(ds, TAG.DATETIME);
      break;
    case "DATE":
      n.dateTime = str(ds, TAG.DATE);
      break;
    case "TIME":
      n.dateTime = str(ds, TAG.TIME);
      break;
    case "PNAME":
      n.personName = personName(ds);
      break;
    case "UIDREF":
      n.uid = str(ds, TAG.UID);
      break;
    default:
      break;
  }

  for (const child of items(ds, TAG.CONTENT_SEQUENCE)) n.children.push(node(child));
  return n;
}

/** Parse a WADO-RS SR instance's DICOM-JSON metadata into a normalized SrTree. */
export function srTreeFromJson(meta: Ds): SrTree {
  const root = node(meta);
  return { title: root.conceptName?.meaning, root };
}
