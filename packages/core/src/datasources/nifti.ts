import type { DataSource, SeriesSummary, DataSourceCapabilities } from "../datasource";

// Register the nifti image loader once. The package doesn't auto-register it, and
// core's genericMetadataProvider (which createNiftiImageIdsAndCacheMetadata populates)
// auto-registers itself on import, so we only need the image loader here.
let registered = false;
async function ensureNiftiLoader(): Promise<void> {
  if (registered) return;
  const [{ imageLoader }, nifti] = await Promise.all([
    import("@cornerstonejs/core"),
    import("@cornerstonejs/nifti-volume-loader"),
  ]);
  nifti.init();
  imageLoader.registerImageLoader("nifti", nifti.cornerstoneNiftiImageLoader);
  registered = true;
}

async function defaultLoadImageIds(file: File): Promise<string[]> {
  await ensureNiftiLoader();
  const { createNiftiImageIdsAndCacheMetadata } =
    await import("@cornerstonejs/nifti-volume-loader");
  // The loader fetches the volume from a URL; a blob URL serves the local file.
  const url = URL.createObjectURL(file);
  return createNiftiImageIdsAndCacheMetadata({ url });
}

export interface NiftiOptions {
  /** Override how a .nii/.nii.gz File becomes Cornerstone imageIds (tests). */
  loadImageIds?: (file: File) => Promise<string[]>;
}

/**
 * A {@link DataSource} for a single local NIfTI volume (`.nii` / `.nii.gz`).
 * The volume is exposed as one series of axial slices: `nifti:<url>?frame=N`
 * imageIds that the registered nifti image loader renders in a normal stack
 * viewport, so the existing viewer works unchanged.
 */
export class NiftiDataSource implements DataSource {
  readonly capabilities: DataSourceCapabilities = {
    downloadArchive: false,
    encapsulatedPdf: false,
    multiStudy: false,
  };
  private imageIds: string[] = [];
  private label = "NIfTI volume";
  private loadImageIds: (file: File) => Promise<string[]>;

  constructor(opts: NiftiOptions = {}) {
    this.loadImageIds = opts.loadImageIds ?? defaultLoadImageIds;
  }

  /** Load a .nii/.nii.gz file as an axial slice stack. Returns the slice count. */
  async addFile(file: File): Promise<number> {
    this.label = file.name;
    this.imageIds = await this.loadImageIds(file);
    return this.imageIds.length;
  }

  async getSeries(): Promise<SeriesSummary[]> {
    if (!this.imageIds.length) return [];
    return [
      {
        seriesInstanceUID: this.label,
        studyInstanceUID: "local",
        modality: "NIfTI",
        seriesDescription: this.label,
        numberOfFrames: this.imageIds.length,
        // NIfTI is inherently a 3D volume but has no DICOM modality, so flag it
        // explicitly to make it eligible for MPR / 3D reconstruction.
        volumetric: true,
      },
    ];
  }

  async getImageIds(): Promise<string[]> {
    return this.imageIds;
  }
}
