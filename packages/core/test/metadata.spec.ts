import { describe, it, expect } from "vitest";
import {
  readImageMetadata,
  readMetadataGroups,
  dicomDate,
  type MetaGet,
  type MetaGroup,
} from "../src/metadata";

// A fake Cornerstone metaData.get keyed by module name, ignoring the imageId.
function getter(modules: Record<string, unknown>): MetaGet {
  return (module: string) => modules[module];
}

describe("readImageMetadata", () => {
  it("maps Cornerstone modules to normalized overlay fields", async () => {
    const get = getter({
      patientModule: {
        patientName: "DOE^JANE",
        patientId: "PID-42",
        patientSex: "F",
        patientBirthDate: "19850320",
      },
      generalStudyModule: {
        studyDescription: "CHEST CT",
        studyDate: "20240115",
        studyTime: "143025",
        accessionNumber: "ACC-7",
      },
      generalSeriesModule: {
        modality: "CT",
        seriesNumber: "3",
        seriesDescription: "Axial 1mm",
      },
      generalImageModule: { instanceNumber: "57" },
      imagePixelModule: { rows: 512, columns: 512 },
      imagePlaneModule: {
        sliceThickness: "1.5",
        sliceLocation: "-120.5",
        pixelSpacing: ["0.7", "0.7"],
      },
    });

    const m = await readImageMetadata("dicomfile:0", get);

    expect(m).toMatchObject({
      patientName: "DOE JANE", // "^" component separators collapsed to spaces
      patientId: "PID-42",
      patientSex: "F",
      patientBirthDate: "1985-03-20", // YYYYMMDD -> YYYY-MM-DD
      studyDescription: "CHEST CT",
      studyDate: "2024-01-15",
      studyTime: "14:30:25", // HHMMSS -> HH:MM:SS
      accessionNumber: "ACC-7",
      modality: "CT",
      seriesNumber: 3,
      seriesDescription: "Axial 1mm",
      instanceNumber: 57,
      rows: 512,
      columns: 512,
      sliceThickness: 1.5,
      sliceLocation: -120.5,
      pixelSpacing: [0.7, 0.7],
    });
  });

  it("parses wadouri parsed date/time objects and patientStudyModule/patientID shapes", async () => {
    // The local (wadouri) provider returns dates as parsed objects and puts the
    // patient ID under `patientID` (capital D) + sex under patientStudyModule.
    const get = getter({
      patientModule: { patientName: "ROSSI^MARIO", patientID: "ID-9" },
      patientStudyModule: { patientSex: "M", patientAge: "045Y" },
      generalStudyModule: {
        studyDescription: "ADDOME INFERIORE",
        studyDate: { year: 2024, month: 3, day: 7 },
        studyTime: { hours: 9, minutes: 5, seconds: 2 },
      },
      generalSeriesModule: { modality: "MR", seriesNumber: 4, seriesDescription: "t2_tse" },
    });
    const m = await readImageMetadata("dicomfile:0", get);
    expect(m).toMatchObject({
      patientName: "ROSSI MARIO",
      patientId: "ID-9", // patientID -> patientId
      patientSex: "M", // sourced from patientStudyModule
      studyDescription: "ADDOME INFERIORE",
      studyDate: "2024-03-07", // { year, month, day } -> YYYY-MM-DD
      studyTime: "09:05:02", // { hours, minutes, seconds } -> HH:MM:SS
      modality: "MR",
      seriesNumber: 4,
    });
  });

  it("normalizes a WADO-RS patient name object ({ Alphabetic })", async () => {
    const get = getter({ patientModule: { patientName: { Alphabetic: "SMITH^JOHN^Q" } } });
    const m = await readImageMetadata("wadors:img", get);
    expect(m.patientName).toBe("SMITH JOHN Q");
  });

  it("omits fields whose modules are absent (e.g. NIfTI has no patient/study tags)", async () => {
    const get = getter({
      imagePixelModule: { rows: 256, columns: 256 },
      generalSeriesModule: { modality: "NIfTI" },
    });
    const m = await readImageMetadata("nifti:blob:x?frame=0", get);
    expect(m).toEqual({ modality: "NIfTI", rows: 256, columns: 256 });
  });

  it("exports dicomDate, handling the raw DA string and the pre-parsed object", () => {
    expect(dicomDate("20240115")).toBe("2024-01-15");
    expect(dicomDate({ year: 2024, month: 1, day: 5 })).toBe("2024-01-05");
    expect(dicomDate("")).toBeUndefined();
    expect(dicomDate(null)).toBeUndefined();
  });
});

function row(groups: MetaGroup[], label: string): string | undefined {
  for (const g of groups) for (const r of g.rows) if (r.label === label) return r.value;
  return undefined;
}

describe("readMetadataGroups", () => {
  it("groups DICOM fields into Patient / Study / Series / Image / Equipment sections", async () => {
    const get = getter({
      patientModule: { patientName: "DOE^JANE", patientID: "PID-42" },
      patientStudyModule: { patientSex: "F", patientAge: "039Y" },
      generalStudyModule: {
        studyDescription: "CHEST CT",
        studyDate: "20240115",
        accessionNumber: "ACC-7",
        studyInstanceUID: "1.2.3",
      },
      generalSeriesModule: { modality: "CT", seriesNumber: "3", seriesDescription: "Axial 1mm" },
      generalImageModule: { instanceNumber: "57" },
      imagePixelModule: { rows: 512, columns: 512 },
      imagePlaneModule: { sliceThickness: "1.5", pixelSpacing: ["0.7", "0.7"] },
      generalEquipmentModule: { manufacturer: "ACME", manufacturerModelName: "Scan9000" },
    });

    const groups = await readMetadataGroups("dicomfile:0", get);
    expect(groups.map((g) => g.id)).toEqual(["patient", "study", "series", "image", "equipment"]);
    expect(row(groups, "Patient Name")).toBe("DOE JANE");
    expect(row(groups, "Patient ID")).toBe("PID-42"); // patientID alt key
    expect(row(groups, "Sex")).toBe("F"); // patientStudyModule
    expect(row(groups, "Study Date")).toBe("2024-01-15");
    expect(row(groups, "Accession #")).toBe("ACC-7");
    expect(row(groups, "Modality")).toBe("CT");
    expect(row(groups, "Instance #")).toBe("57");
    expect(row(groups, "Matrix")).toBe("512 × 512");
    expect(row(groups, "Pixel Spacing")).toBe("0.7 × 0.7 mm");
    expect(row(groups, "Slice Thickness")).toBe("1.5 mm");
    expect(row(groups, "Manufacturer")).toBe("ACME");
  });

  it("drops empty rows and whole empty groups (NIfTI has only image fields)", async () => {
    const get = getter({
      imagePixelModule: { rows: 256, columns: 256 },
      generalSeriesModule: { modality: "NIfTI" },
    });
    const groups = await readMetadataGroups("nifti:x", get);
    expect(groups.find((g) => g.id === "patient")).toBeUndefined();
    expect(groups.find((g) => g.id === "study")).toBeUndefined();
    expect(row(groups, "Matrix")).toBe("256 × 256");
    expect(row(groups, "Modality")).toBe("NIfTI");
  });
});
