/**
 * Shared viewport-capture helpers used by both the stack viewer and MPR. Internal
 * to the package (not re-exported from the barrel): pure DOM, no Cornerstone.
 */

export interface WindowLevel {
  ww: number;
  wc: number;
}

/** Convert a Cornerstone VOI range to a window width/center. */
export function voiToWl(voi: { lower: number; upper: number } | undefined): WindowLevel | null {
  if (!voi) return null;
  return { ww: Math.round(voi.upper - voi.lower), wc: Math.round((voi.upper + voi.lower) / 2) };
}

export const SVG_NS = "http://www.w3.org/2000/svg";

/** Resolve after the next animation frame (so a deferred render() has flushed),
 *  falling back to a macrotask where rAF isn't available (Node test env). */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("svg rasterization failed"));
    img.src = src;
  });
}

/**
 * Composite a viewport's rendered image canvas with its annotation SVG overlay
 * into one opaque JPEG Blob. Pure DOM APIs; the built-in tools' SVG is procedural
 * shapes + text with no external resources, so the output canvas isn't tainted.
 * The metadata text overlay lives in a separate DOM layer and is never included.
 */
export async function compositeSliceJpeg(
  element: HTMLDivElement,
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob | null> {
  const w = canvas.width;
  const h = canvas.height;
  if (!w || !h) return null;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d", { alpha: false });
  if (!ctx) return null;

  // JPEG has no alpha, so fill the viewport's black background first.
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
  // Layer 1: the rendered medical image (same-origin 2D canvas, safe to read).
  ctx.drawImage(canvas, 0, 0, w, h);

  // Layer 2: the measurement/annotation SVG overlay (a sibling of the canvas).
  const svg = element.querySelector<SVGSVGElement>(".viewport-element > .svg-layer");
  if (svg) {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", SVG_NS);
    // The svg-layer is CSS-sized (CSS px); pin explicit dimensions so the data
    // URL rasterizes at a known size, then scale it to the device-pixel canvas
    // (this is exactly the devicePixelRatio factor, so annotations stay aligned).
    const cssW = svg.clientWidth || w;
    const cssH = svg.clientHeight || h;
    clone.setAttribute("width", String(cssW));
    clone.setAttribute("height", String(cssH));
    const svgString = new XMLSerializer().serializeToString(clone);
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
    try {
      const img = await loadImage(url);
      ctx.drawImage(img, 0, 0, w, h);
    } catch {
      /* overlay failed to rasterize; still export the image layer */
    }
  }

  return new Promise<Blob | null>((resolve) =>
    out.toBlob((b) => resolve(b), "image/jpeg", quality),
  );
}
