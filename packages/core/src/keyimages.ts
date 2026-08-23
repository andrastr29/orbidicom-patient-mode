/**
 * Key-image flagging: the user marks notable slices (a "key image"). The flag
 * set itself is session state owned by the UI; this module is the pure, testable
 * serializer (mirroring `cornerstone/measurements.ts`) plus the shared shape.
 */

/** One flagged slice, captured at flag time so export doesn't depend on what's loaded. */
export interface KeyImage {
  imageId: string;
  seriesInstanceUID: string;
  seriesDescription: string;
  modality: string;
  /** 0-based slice index within its series. */
  sliceIndex: number;
  /** DICOM InstanceNumber when known. */
  instanceNumber?: number;
}

/** Serialize key images to a JSON document with provenance. `now` is injectable. */
export function keyImagesToJson(
  items: KeyImage[],
  now: () => string = () => new Date().toISOString(),
): string {
  return JSON.stringify(
    {
      schema: "orbidicom.keyimages/v1",
      exportedAt: now(),
      count: items.length,
      keyImages: items,
    },
    null,
    2,
  );
}
