import {
  init as coreInit,
  imageLoadPoolManager,
  Enums as csCoreEnums,
  utilities as csCoreUtils,
} from "@cornerstonejs/core";
// dicom-image-loader exposes init as a named export (also on the default object).
import { init as dicomImageLoaderInit } from "@cornerstonejs/dicom-image-loader";
import {
  init as toolsInit,
  addTool,
  Enums as csToolsEnums,
  ToolGroupManager,
  WindowLevelTool,
  ZoomTool,
  PanTool,
  StackScrollTool,
  LengthTool,
  AngleTool,
  EllipticalROITool,
  RectangleROITool,
  CircleROITool,
  ProbeTool,
  CrosshairsTool,
  TrackballRotateTool,
  ReferenceLinesTool,
} from "@cornerstonejs/tools";
import type { Types as CsToolsTypes } from "@cornerstonejs/tools";

export const TOOL_GROUP_ID = "orbidicom";
/** Base id for MPR tool groups; createMprView appends a per-instance suffix. */
export const MPR_TOOL_GROUP_ID = "orbidicom-mpr";
let started = false;

/**
 * Default frame request headers. Asks for frames in their ORIGINAL transfer
 * syntax (no server-side transcoding): many PACS (e.g. Orthanc) fail to
 * uncompress certain frames ("Cannot uncompress a DICOM image" -> HTTP 400);
 * returning the stored bytes and decoding them with the bundled WASM codecs
 * avoids that and offloads work from the PACS. Override via InitOptions.beforeSend
 * for servers that prefer transcoded frames.
 */
const DEFAULT_BEFORE_SEND = (headers: Record<string, string>): Record<string, string> => ({
  ...headers,
  Accept: 'multipart/related; type="application/octet-stream"; transfer-syntax=*',
});

export interface InitOptions {
  /**
   * Frame-decode worker count. Defaults to most of the device's cores
   * (`max(2, hardwareConcurrency - 1)`). The library's own default —
   * `floor(hardwareConcurrency / 2)` — is often 1–2 on a phone and serializes
   * WASM codec decoding, making large/compressed series crawl. Client-side CPU
   * only; adds no extra PACS load (still one frame per displayed slice).
   */
  maxWebWorkers?: number;
  /** Transform the default frame-request headers before each loader fetch. */
  beforeSend?: (headers: Record<string, string>) => Record<string, string>;
}

const ALL_TOOLS = [
  WindowLevelTool,
  ZoomTool,
  PanTool,
  StackScrollTool,
  LengthTool,
  AngleTool,
  EllipticalROITool,
  RectangleROITool,
  CircleROITool,
  ProbeTool,
];

/** The slice of a Probe annotation's cached stats the label needs. */
interface ProbeStats {
  value?: number | number[];
  modalityUnit?: string | string[];
}

/**
 * Probe label: the measured value, and nothing else.
 *
 * Cornerstone's default prints the voxel index `(i, j, k)` on the first line with
 * the value underneath. The index is a developer's coordinate, not a reading. What
 * a probe is FOR is the intensity at the point it marks (HU, signal, SUV), and the
 * index only crowds the image beside it. Measurement export never read it either
 * (see ./measurements.ts), so dropping the line loses nothing downstream.
 *
 * Also steadier than the default, which renders the whole label as nothing when
 * the index is missing. The value is the point, so show it either way.
 *
 * Exported so a host can wrap or replace it through the tool group's
 * `getTextLines` configuration.
 */
export function probeTextLines(
  data: { cachedStats?: Record<string, ProbeStats | undefined> },
  targetId: string,
): string[] | undefined {
  const stats = data?.cachedStats?.[targetId];
  const value = stats?.value;
  if (value === undefined || value === null) return undefined;
  const unit = stats?.modalityUnit;
  const unitAt = (i: number) => (Array.isArray(unit) ? unit[i] : unit);
  const line = (v: number, u?: string) => `${csCoreUtils.roundNumber(v)}${u ? ` ${u}` : ""}`;
  return Array.isArray(value) ? value.map((v, i) => line(v, unitAt(i))) : [line(value, unitAt(0))];
}

/**
 * Per-tool configuration applied when a tool joins the stack tool group. Tools
 * absent from the map join with their library defaults.
 *
 * - **Zoom** — `pinchToZoom:false` makes Zoom's touchDragCallback the plain
 *   vertical-drag zoom (same as the mouse), so a single finger zooms when Zoom is
 *   the active tool, matching every other one-finger tool. The default
 *   (`pinchToZoom:true`) only zooms on a two-finger pinch and ignores
 *   single-touch drags entirely.
 * - **CircleROI** — `calculateStats:false` turns the ROI into a plain circle
 *   *annotation*: the tool skips the statistics pass AND the linked measurement
 *   text box, drawing only the outline. That is the whole point of shipping it —
 *   EllipticalROI already covers "circle with numbers", so this is the
 *   draw-a-circle-and-say-nothing tool. See SHAPE_TOOLS in ./tool-names.
 * - **Probe** — `getTextLines` drops the voxel-index line; see {@link probeTextLines}.
 */
const TOOL_CONFIG: Record<string, Record<string, unknown>> = {
  [ZoomTool.toolName]: { pinchToZoom: false },
  [CircleROITool.toolName]: { calculateStats: false },
  [ProbeTool.toolName]: { getTextLines: probeTextLines },
};

export async function initCornerstone(opts: InitOptions = {}): Promise<void> {
  if (started) return;
  await coreInit();
  const beforeSend = opts.beforeSend ?? DEFAULT_BEFORE_SEND;
  dicomImageLoaderInit({
    // `globalThis.navigator?.` (not bare `navigator`): navigator is a browser
    // global and only became a Node global in v21 — bare access throws
    // ReferenceError under Node 20 (CI / SSR). Optional chaining falls back to 4.
    maxWebWorkers:
      opts.maxWebWorkers ?? Math.max(2, (globalThis.navigator?.hardwareConcurrency || 4) - 1),
    beforeSend: (_xhr: unknown, _imageId: string, defaultHeaders: Record<string, string>) =>
      beforeSend(defaultHeaders),
    // Use the classic file-parsing loaders for wadouri/dicomfile + the
    // metaDataManager-based wadors provider. cornerstone 5.x otherwise defaults
    // to a metadata-first loader that needs naturalized metadata pre-populated,
    // which local .dcm files (dicomfile:) don't have — so it can't find pixel
    // data ("no COMPRESSED_FRAME_DATA"). This also matches how our data sources
    // register metadata (DicomWebDataSource uses wadors.metaDataManager.add).
    useLegacyMetadataProvider: true,
  });
  // Raise concurrent in-flight requests above Cornerstone's 6/5 defaults; over
  // HTTP/2 we can keep many more frames in flight. Prefetch is LOWER priority
  // than Interaction, so the active slice always jumps the queue.
  imageLoadPoolManager.setMaxSimultaneousRequests(csCoreEnums.RequestType.Interaction, 12);
  imageLoadPoolManager.setMaxSimultaneousRequests(csCoreEnums.RequestType.Prefetch, 10);

  await toolsInit();
  for (const t of ALL_TOOLS) addTool(t);
  // CrosshairsTool + TrackballRotateTool are registered globally but only added
  // to the per-session MPR tool groups (createMprView), never to the stack group
  // below: crosshairs reslice the orthographic planes, trackball rotates the 3D pane.
  addTool(CrosshairsTool);
  addTool(TrackballRotateTool);
  // ReferenceLinesTool joins the stack group (below) but stays Disabled until the
  // UI names a source viewport — see cornerstone/reference-lines.ts.
  addTool(ReferenceLinesTool);

  const tg = ToolGroupManager.createToolGroup(TOOL_GROUP_ID)!;
  for (const name of ALL_TOOLS.map((t) => t.toolName)) {
    tg.addTool(name, TOOL_CONFIG[name]);
  }
  // A display-only tool: no bindings, and Disabled until reference-lines.ts turns
  // it on. Added here so the group owns every tool it can ever show.
  tg.addTool(ReferenceLinesTool.toolName);

  // Mouse: left=W/L, right=pan, left+right=zoom, wheel + middle-drag=scroll.
  // Touch: one finger drives the active tool (W/L by default), two fingers pan.
  const { MouseBindings } = csToolsEnums;
  tg.setToolActive(WindowLevelTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }, { numTouchPoints: 1 }],
  });
  tg.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Secondary }, { numTouchPoints: 2 }],
  });
  tg.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary_And_Secondary }],
  });
  tg.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }, { mouseButton: MouseBindings.Auxiliary }],
  });
  started = true;
}

/** Tools selectable on the left mouse button (one active at a time). */
export const TOOLS = {
  WindowLevel: WindowLevelTool.toolName,
  Pan: PanTool.toolName,
  Zoom: ZoomTool.toolName,
  Length: LengthTool.toolName,
  Angle: AngleTool.toolName,
  Rectangle: RectangleROITool.toolName,
  Ellipse: EllipticalROITool.toolName,
  /** A plain circle with no measurements — see TOOL_CONFIG above. */
  Circle: CircleROITool.toolName,
  Probe: ProbeTool.toolName,
} as const;

const PRIMARY_TOOLS = Object.values(TOOLS);

/**
 * Switch the active left-button tool. Pan always keeps right-click and Zoom
 * keeps left+right; selecting Pan/Zoom just *adds* the left button to them.
 * Re-applied wholesale each call so bindings can't drift.
 *
 * `removeAllBindings: true` is REQUIRED. A bare setToolPassive(name) only strips
 * the tool's primary mouse binding and LEAVES THE TOOL ACTIVE, which left W/L
 * active on one-finger touch forever. Clearing all bindings fully deactivates
 * each tool before we re-bind below.
 */
export function setPrimaryTool(toolName: string): void {
  const tg = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
  if (!tg) return;
  const { MouseBindings } = csToolsEnums;
  for (const name of PRIMARY_TOOLS) tg.setToolPassive(name, { removeAllBindings: true });

  const panBindings: CsToolsTypes.IToolBinding[] = [{ mouseButton: MouseBindings.Secondary }];
  const zoomBindings: CsToolsTypes.IToolBinding[] = [
    { mouseButton: MouseBindings.Primary_And_Secondary },
  ];
  const primaryTouch: CsToolsTypes.IToolBinding[] = [
    { mouseButton: MouseBindings.Primary },
    { numTouchPoints: 1 },
  ];
  // Two-finger gesture: pinch-zoom when Zoom is active, otherwise pan.
  const pinch: CsToolsTypes.IToolBinding = { numTouchPoints: 2 };
  if (toolName === TOOLS.Pan) panBindings.push(...primaryTouch, pinch);
  else if (toolName === TOOLS.Zoom) zoomBindings.push(...primaryTouch, pinch);
  else {
    tg.setToolActive(toolName, { bindings: primaryTouch });
    panBindings.push(pinch);
  }

  tg.setToolActive(TOOLS.Pan, { bindings: panBindings });
  tg.setToolActive(TOOLS.Zoom, { bindings: zoomBindings });
}
