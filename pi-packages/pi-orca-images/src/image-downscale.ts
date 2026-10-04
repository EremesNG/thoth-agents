import { createHash } from 'node:crypto';
import type { ResizedImage } from '@earendil-works/pi-coding-agent';
import * as codingAgent from '@earendil-works/pi-coding-agent';
import * as piTui from '@earendil-works/pi-tui';
import { requestLatestAltScreenRender } from './alt-screen-image-order.ts';
import { isOrcaImagesEnabled } from './environment.ts';

interface ImageDownscaleDependencies {
  env: NodeJS.ProcessEnv;
  imageClass: { prototype: object } | null | undefined;
  altScreenClass?: { prototype: object } | null;
  getCapabilities: typeof piTui.getCapabilities | null | undefined;
  getCellDimensions: typeof piTui.getCellDimensions | null | undefined;
  resizeImage: typeof codingAgent.resizeImage | null | undefined;
  now?: () => number;
}

export const IMAGE_DOWNSCALE_THRESHOLD = 256 * 1024;
export const IMAGE_DOWNSCALE_CACHE_ENTRIES = 32;
export const IMAGE_DOWNSCALE_CACHE_BYTES = 16 * 1024 * 1024;

// Independent of the TUI hooks and stable across native /reload.
const INSTALLED = Symbol.for('@thoth-agents/pi-orca-images.image-downscale');
type Dimensions = { widthPx: number; heightPx: number };
type ImageOptions = { maxWidthCells?: number; maxHeightCells?: number };
interface ImageInternals {
  [INSTALLED]?: boolean;
  base64Data: string;
  mimeType: string;
  dimensions: Dimensions;
  options: ImageOptions;
  pngData?: string;
  invalidate: () => void;
  render: (width: number) => string[];
}

interface DisplayState {
  pending: boolean;
  width: number;
  cells: Dimensions;
  rows: number;
}

function validDimensions(value: Dimensions | undefined): value is Dimensions {
  return (
    !!value &&
    Number.isFinite(value.widthPx) &&
    value.widthPx > 0 &&
    Number.isFinite(value.heightPx) &&
    value.heightPx > 0
  );
}

function accessibleFields(image: ImageInternals): boolean {
  return (
    typeof image.base64Data === 'string' &&
    validDimensions(image.dimensions) &&
    !!image.options &&
    typeof image.options === 'object' &&
    (image.options.maxWidthCells === undefined ||
      Number.isFinite(image.options.maxWidthCells)) &&
    (image.options.maxHeightCells === undefined ||
      Number.isFinite(image.options.maxHeightCells)) &&
    typeof image.invalidate === 'function' &&
    ['base64Data', 'dimensions', 'pngData'].every(
      (field) =>
        Object.getOwnPropertyDescriptor(image, field)?.writable === true,
    )
  );
}

function isResizedPng(result: ResizedImage | null): result is ResizedImage {
  return (
    !!result?.wasResized &&
    result.mimeType === 'image/png' &&
    typeof result.data === 'string' &&
    result.data.length > 0 &&
    validDimensions({ widthPx: result.width, heightPx: result.height })
  );
}

function lessDistortedCount(upper: number, ideal: number): number {
  if (upper <= 1) return upper;
  const lower = upper - 1;
  return Math.max(lower / ideal, ideal / lower) <
    Math.max(upper / ideal, ideal / upper)
    ? lower
    : upper;
}

function displaySize(
  dimensions: Dimensions,
  width: number,
  options: ImageOptions,
  cells: Dimensions,
) {
  // Mirror Image.render and Pi 1.0.1's non-exported calculateImageCellSize,
  // including Kitty's less-distorted rounding of the unconstrained axis.
  const widthLimit = Math.max(
    1,
    Math.min(width - 2, options.maxWidthCells ?? 60),
  );
  const defaultHeight = Math.max(
    1,
    Math.ceil((widthLimit * cells.widthPx) / cells.heightPx),
  );
  const maxWidth = Math.max(1, Math.floor(widthLimit));
  const maxHeight = Math.max(
    1,
    Math.floor(options.maxHeightCells ?? defaultHeight),
  );
  const imageWidth = Math.max(1, dimensions.widthPx);
  const imageHeight = Math.max(1, dimensions.heightPx);
  const widthScale = (maxWidth * cells.widthPx) / imageWidth;
  const heightScale = (maxHeight * cells.heightPx) / imageHeight;
  const scale = Math.min(widthScale, heightScale);
  let columns = Math.max(
    1,
    Math.min(maxWidth, Math.ceil((imageWidth * scale) / cells.widthPx)),
  );
  let rows = Math.max(
    1,
    Math.min(maxHeight, Math.ceil((imageHeight * scale) / cells.heightPx)),
  );
  if (widthScale <= heightScale) {
    rows = lessDistortedCount(
      rows,
      (columns * cells.widthPx * imageHeight) / (imageWidth * cells.heightPx),
    );
  } else {
    columns = lessDistortedCount(
      columns,
      (rows * cells.heightPx * imageWidth) / (imageHeight * cells.widthPx),
    );
  }
  return { columns, rows };
}

export function installImageDownscale(
  {
    env,
    imageClass,
    altScreenClass,
    getCapabilities: capabilityReader,
    getCellDimensions: readCells,
    resizeImage: resizeFunction,
    now = () => performance.now(),
  }: ImageDownscaleDependencies = {
    env: process.env,
    imageClass: piTui.Image,
    getCapabilities: piTui.getCapabilities,
    getCellDimensions: piTui.getCellDimensions,
    resizeImage: codingAgent.resizeImage,
  },
): void {
  if (
    !isOrcaImagesEnabled(env) ||
    !imageClass?.prototype ||
    typeof resizeFunction !== 'function' ||
    typeof readCells !== 'function' ||
    typeof capabilityReader !== 'function'
  )
    return;
  const readCapabilities = capabilityReader;
  const resize = resizeFunction;
  const proto = imageClass.prototype as ImageInternals;
  if (
    proto[INSTALLED] ||
    typeof proto.render !== 'function' ||
    !Object.isExtensible(proto) ||
    Object.getOwnPropertyDescriptor(proto, 'render')?.writable === false
  )
    return;
  const original = proto.render;
  const states = new WeakMap<ImageInternals, DisplayState>();
  const cache = new Map<string, { result: ResizedImage; lastUsed: number }>();
  let cachedBytes = 0;
  const inFlight = new Map<string, Promise<ResizedImage | null>>();

  function cacheResult(digest: string, result: ResizedImage) {
    if (result.data.length > IMAGE_DOWNSCALE_CACHE_BYTES) return;
    cachedBytes -= cache.get(digest)?.result.data.length ?? 0;
    cache.set(digest, { result, lastUsed: now() });
    cachedBytes += result.data.length;
    while (
      cache.size > IMAGE_DOWNSCALE_CACHE_ENTRIES ||
      cachedBytes > IMAGE_DOWNSCALE_CACHE_BYTES
    ) {
      let oldest: string | undefined;
      let oldestTime = Infinity;
      for (const [key, entry] of cache) {
        if (entry.lastUsed < oldestTime) {
          oldest = key;
          oldestTime = entry.lastUsed;
        }
      }
      if (oldest === undefined) break;
      cachedBytes -= cache.get(oldest)?.result.data.length ?? 0;
      cache.delete(oldest);
    }
  }

  function applyResult(
    image: ImageInternals,
    result: ResizedImage | null,
    display: DisplayState,
    source: string,
  ) {
    if (
      !isOrcaImagesEnabled(env) ||
      readCapabilities().images !== 'kitty' ||
      !isResizedPng(result) ||
      image.base64Data !== source ||
      image.mimeType !== 'image/png' ||
      !accessibleFields(image)
    )
      return;
    const dimensions = { widthPx: result.width, heightPx: result.height };
    const rows = displaySize(
      dimensions,
      display.width,
      image.options,
      display.cells,
    ).rows;
    if (Math.abs(rows - display.rows) > 1) return;
    // These strings belong to the display component, not its tool-result block.
    image.base64Data = result.data;
    image.dimensions = dimensions;
    image.pngData = undefined;
  }

  function resizeSource(
    digest: string,
    bytes: Buffer,
    maxWidth: number,
    maxHeight: number,
  ): Promise<ResizedImage | null> {
    const pending = inFlight.get(digest);
    if (pending) return pending;
    const work = (async () => {
      try {
        const result = await resize(bytes, 'image/png', {
          maxWidth,
          maxHeight,
          maxBytes: bytes.length,
        });
        if (isResizedPng(result)) cacheResult(digest, result);
        return result;
      } catch {
        return null;
      }
    })().finally(() => inFlight.delete(digest));
    inFlight.set(digest, work);
    return work;
  }

  proto.render = function (this: ImageInternals, width) {
    const state = states.get(this);
    if (state && !state.pending) return original.call(this, width);
    let cells: Dimensions | undefined;
    let size: ReturnType<typeof displaySize> | undefined;
    try {
      if (
        isOrcaImagesEnabled(env) &&
        readCapabilities().images === 'kitty' &&
        this.mimeType === 'image/png' &&
        accessibleFields(this) &&
        this.base64Data.length > IMAGE_DOWNSCALE_THRESHOLD
      ) {
        cells = readCells();
        if (validDimensions(cells) && Number.isFinite(width))
          size = displaySize(this.dimensions, width, this.options, cells);
      }
    } catch {
      // Unreachable component fields or Pi helpers leave native behavior intact.
    }
    if (!size || !cells) return original.call(this, width);
    if (state) {
      state.width = width;
      state.cells = cells;
      state.rows = size.rows;
      return Array(size.rows).fill('');
    }
    const display: DisplayState = {
      pending: true,
      width,
      cells,
      rows: size.rows,
    };
    states.set(this, display);
    const source = this.base64Data;
    const bytes = Buffer.from(source, 'base64');
    const digest = createHash('sha256').update(bytes).digest('hex');
    const cached = cache.get(digest);
    if (cached) {
      display.pending = false;
      cached.lastUsed = now();
      applyResult(this, cached.result, display, source);
      this.invalidate();
      return original.call(this, width);
    }
    const work = resizeSource(
      digest,
      bytes,
      size.columns * cells.widthPx,
      size.rows * cells.heightPx,
    );
    void (async () => {
      try {
        applyResult(this, await work, display, source);
      } catch {
        // Keep Pi's original display data once; worker failures never retry.
      } finally {
        display.pending = false;
        try {
          this.invalidate();
          if (isOrcaImagesEnabled(env) && readCapabilities().images === 'kitty')
            requestLatestAltScreenRender(altScreenClass);
        } catch {
          // Pi's internals may have disappeared while resizing.
        }
      }
    })();
    return Array(size.rows).fill('');
  };
  Object.defineProperty(proto, INSTALLED, { value: true, configurable: true });
}
