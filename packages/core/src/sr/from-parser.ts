// Adapter: a dicom-parser DataSet (local files) → normalized SrTree. Mirrors
// from-json.ts but walks dicom-parser's shape: scalars via `string(tag)`, nested
// sequences via `elements[tag].items[].dataSet`. Tag keys are lowercase hex with an
// "x" prefix and no comma (e.g. ContentSequence 0040,A730 → "x0040a730").

import { SR_VALUE_TYPES, type SrTree, type SrNode, type SrValueType, type SrCode } from "./types";

export interface ParserDataSet {
  string(tag: string): string | undefined;
  elements?: Record<string, { items?: { dataSet: ParserDataSet }[] } | undefined>;
}

const TAG = {
  RELATIONSHIP: "x0040a010",
  VALUE_TYPE: "x0040a040",
  CONCEPT_NAME: "x0040a043",
  CONTENT_SEQUENCE: "x0040a730",
  TEXT_VALUE: "x0040a160",
  CONCEPT_CODE: "x0040a168",
  MEASURED_VALUE: "x0040a300",
  NUMERIC_VALUE: "x0040a30a",
  MEASUREMENT_UNITS: "x004008ea",
  DATETIME: "x0040a120",
  DATE: "x0040a121",
  TIME: "x0040a122",
  PERSON_NAME: "x0040a123",
  UID: "x0040a124",
  CODE_VALUE: "x00080100",
  CODING_SCHEME: "x00080102",
  CODE_MEANING: "x00080104",
} as const;

function items(ds: ParserDataSet, tag: string): ParserDataSet[] {
  return (ds.elements?.[tag]?.items ?? []).map((it) => it.dataSet);
}
function code(ds: ParserDataSet, tag: string): SrCode | undefined {
  const it = items(ds, tag)[0];
  if (!it) return undefined;
  return {
    value: it.string(TAG.CODE_VALUE),
    scheme: it.string(TAG.CODING_SCHEME),
    meaning: it.string(TAG.CODE_MEANING),
  };
}
function valueType(ds: ParserDataSet): SrValueType {
  const v = ds.string(TAG.VALUE_TYPE) as SrValueType | undefined;
  return v && SR_VALUE_TYPES.has(v) ? v : "UNKNOWN";
}

function node(ds: ParserDataSet): SrNode {
  const vt = valueType(ds);
  const n: SrNode = { valueType: vt, children: [] };
  const rel = ds.string(TAG.RELATIONSHIP);
  if (rel) n.relationship = rel;
  const cn = code(ds, TAG.CONCEPT_NAME);
  if (cn) n.conceptName = cn;

  switch (vt) {
    case "TEXT":
      n.text = ds.string(TAG.TEXT_VALUE);
      break;
    case "CODE":
      n.code = code(ds, TAG.CONCEPT_CODE);
      break;
    case "NUM": {
      const mv = items(ds, TAG.MEASURED_VALUE)[0];
      if (mv)
        n.num = {
          value: Number(mv.string(TAG.NUMERIC_VALUE)),
          unit: code(mv, TAG.MEASUREMENT_UNITS),
        };
      break;
    }
    case "DATETIME":
      n.dateTime = ds.string(TAG.DATETIME);
      break;
    case "DATE":
      n.dateTime = ds.string(TAG.DATE);
      break;
    case "TIME":
      n.dateTime = ds.string(TAG.TIME);
      break;
    case "PNAME":
      n.personName = ds.string(TAG.PERSON_NAME);
      break;
    case "UIDREF":
      n.uid = ds.string(TAG.UID);
      break;
    default:
      break;
  }

  for (const child of items(ds, TAG.CONTENT_SEQUENCE)) n.children.push(node(child));
  return n;
}

/** Parse a dicom-parser SR DataSet into a normalized SrTree. */
export function srTreeFromParser(ds: ParserDataSet): SrTree {
  const root = node(ds);
  return { title: root.conceptName?.meaning, root };
}
