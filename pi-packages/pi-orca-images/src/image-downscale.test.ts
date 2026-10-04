import { deflateSync } from 'node:zlib';
import {
  type ExtensionAPI,
  type ResizedImage,
  resizeImage,
} from '@earendil-works/pi-coding-agent';
import {
  getCapabilities,
  getCellDimensions,
  Image,
  resetCapabilitiesCache,
  setCapabilities,
  setCellDimensions,
  setImageTranscoder,
  type Terminal,
  TuiAltScreen,
} from '@earendil-works/pi-tui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installAltScreenImageOrder } from './alt-screen-image-order.ts';
import {
  IMAGE_DOWNSCALE_CACHE_BYTES,
  IMAGE_DOWNSCALE_CACHE_ENTRIES,
  IMAGE_DOWNSCALE_THRESHOLD,
  installImageDownscale,
} from './image-downscale.ts';
import orcaImages from './index.ts';

const originalImagePrototype = Object.getOwnPropertyDescriptors(
  Image.prototype,
);
const originalImageKeys = new Set(Reflect.ownKeys(Image.prototype));
const originalCellDimensions = getCellDimensions();
const originalTuiPrototype = Object.getOwnPropertyDescriptors(
  TuiAltScreen.prototype,
);
const originalTuiKeys = new Set(Reflect.ownKeys(TuiAltScreen.prototype));
const activeTuis: TuiAltScreen[] = [];

function deferredResize() {
  let resolve!: (result: ResizedImage | null) => void;
  const promise = new Promise<ResizedImage | null>((done) => {
    resolve = done;
  });
  return { resizeImage: vi.fn<typeof resizeImage>(() => promise), resolve };
}

function pngFixture(width: number, height: number, seed = 0, alpha = false) {
  function chunk(type: string, data: Buffer) {
    const body = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const header = Buffer.alloc(4);
    header.writeUInt32BE(data.length);
    const trailer = Buffer.alloc(4);
    trailer.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([header, body, trailer]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = alpha ? 6 : 2;
  const channels = alpha ? 4 : 3;
  const stride = width * channels + 1;
  const pixels = Buffer.alloc(stride * height);
  let random = seed;
  for (let row = 0; row < height; row++) {
    for (let column = 1; column < stride; column++) {
      random ^= random << 13;
      random ^= random >>> 17;
      random ^= random << 5;
      pixels[row * stride + column] = random & 255;
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

function resizedPng(width = 360, height = 540): ResizedImage {
  return {
    data: pngFixture(width, height),
    mimeType: 'image/png',
    width,
    height,
    originalWidth: 1024,
    originalHeight: 1536,
    wasResized: true,
  };
}

async function drainCompletion() {
  await new Promise<void>((resolve) => process.nextTick(resolve));
}

function screenClass() {
  return class Screen {
    stopped = false;
    altScreenActive = true;
    imageProtocol = 'kitty';
    redraws: boolean[] = [];
    applyLineResets(lines: string[]) {
      return lines;
    }
    doRender() {}
    requestRender(force: boolean) {
      this.redraws.push(force);
    }
  };
}

function nativeImageClass() {
  return class NativeImage {
    base64Data = Buffer.alloc(200_000).toString('base64');
    mimeType = 'image/png';
    dimensions = { widthPx: 1024, heightPx: 1536 };
    options = {};
    pngData = undefined;
    invalidate() {}
    render(_width: number) {
      return ['native'];
    }
  };
}

function largeImage(seed = 42) {
  return new Image(
    Buffer.alloc(200_000, seed).toString('base64'),
    'image/png',
    { fallbackColor: (text) => text },
    {},
    { widthPx: 1024, heightPx: 1536 },
  );
}

afterEach(() => {
  for (const tui of activeTuis.splice(0)) tui.stop({ preserveScreen: true });
  for (const key of Reflect.ownKeys(TuiAltScreen.prototype)) {
    if (!originalTuiKeys.has(key))
      Reflect.deleteProperty(TuiAltScreen.prototype, key);
  }
  Object.defineProperties(TuiAltScreen.prototype, originalTuiPrototype);
  vi.unstubAllEnvs();
  for (const key of Reflect.ownKeys(Image.prototype)) {
    if (!originalImageKeys.has(key))
      Reflect.deleteProperty(Image.prototype, key);
  }
  Object.defineProperties(Image.prototype, originalImagePrototype);
  setCellDimensions(originalCellDimensions);
  setImageTranscoder(undefined);
  resetCapabilitiesCache();
});

describe('Orca display image downscaling', () => {
  it('reserves the original 30 rows without Kitty output while one resize targets the displayed 360×540 pixel box', () => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    setCellDimensions({ widthPx: 9, heightPx: 18 });
    const pending = deferredResize();
    const image = largeImage();
    installImageDownscale({
      env: { TERM_PROGRAM: 'Orca' },
      imageClass: Image,
      getCapabilities,
      getCellDimensions,
      resizeImage: pending.resizeImage,
    });

    expect(image.render(80)).toEqual(Array(30).fill(''));
    expect(image.render(80)).toEqual(Array(30).fill(''));
    expect(pending.resizeImage).toHaveBeenCalledExactlyOnceWith(
      Buffer.alloc(200_000, 42),
      'image/png',
      { maxWidth: 360, maxHeight: 540, maxBytes: 200_000 },
    );
  });

  it('swaps only the display data and encoded dimensions after completion, clears converted data and ordinarily renders the latest screen', async () => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    setCellDimensions({ widthPx: 9, heightPx: 18 });
    const pending = deferredResize();
    const altScreenClass = screenClass();
    const env = { TERM_PROGRAM: 'Orca' };
    installAltScreenImageOrder({ env, altScreenClass, getCapabilities });
    const first = new altScreenClass();
    first.doRender();
    const latest = new altScreenClass();
    latest.doRender();
    const image = largeImage();
    Object.defineProperty(image, 'pngData', { value: 'stale', writable: true });
    // Even a previously cached frame must become a placeholder and later refresh.
    image.render(80);
    installImageDownscale({
      env,
      imageClass: Image,
      altScreenClass,
      getCapabilities,
      getCellDimensions,
      resizeImage: pending.resizeImage,
    });
    expect(image.render(80)).toEqual(Array(30).fill(''));
    const result = resizedPng();

    pending.resolve(result);
    await drainCompletion();

    expect(image.render(80)[0]).toContain(result.data);
    expect(image.render(80)).toHaveLength(30);
    expect(Reflect.get(image, 'dimensions')).toEqual({
      widthPx: 360,
      heightPx: 540,
    });
    expect(Reflect.get(image, 'pngData')).toBeUndefined();
    expect(first.redraws).toEqual([]);
    expect(latest.redraws).toEqual([false]);
    expect(pending.resizeImage).toHaveBeenCalledTimes(1);
  });

  it.each([
    { reason: 'not resized', result: { ...resizedPng(), wasResized: false } },
    {
      reason: 'non-PNG output',
      result: { ...resizedPng(), mimeType: 'image/jpeg' },
    },
    { reason: 'null', result: null },
    { reason: 'geometry jump beyond one row', result: resizedPng(540, 360) },
    { reason: 'rejection', failure: 'reject' },
    { reason: 'synchronous error', failure: 'throw' },
  ])('keeps the original PNG once with no retry after $reason', async ({
    result,
    failure,
  }) => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    setCellDimensions({ widthPx: 9, heightPx: 18 });
    const resize = vi.fn(() => {
      if (failure === 'throw') throw new Error('resize unavailable');
      if (failure === 'reject')
        return Promise.reject(new Error('worker failed'));
      return Promise.resolve(result ?? null);
    });
    const image = largeImage();
    const original = Reflect.get(image, 'base64Data');
    installImageDownscale({
      env: { TERM_PROGRAM: 'Orca' },
      imageClass: Image,
      getCapabilities,
      getCellDimensions,
      resizeImage: resize,
    });

    expect(() => image.render(80)).not.toThrow();
    await drainCompletion();

    expect(Reflect.get(image, 'base64Data') === original).toBe(true);
    expect(Reflect.get(image, 'dimensions')).toEqual({
      widthPx: 1024,
      heightPx: 1536,
    });
    expect(image.render(80)[0].startsWith('\x1b_Ga=T')).toBe(true);
    image.invalidate();
    image.render(80);
    expect(resize).toHaveBeenCalledTimes(1);
  });

  it.each([
    { guard: 'non-Orca', TERM_PROGRAM: 'unknown' },
    { guard: 'missing terminal', TERM_PROGRAM: undefined },
    { guard: 'tmux', TERM_PROGRAM: 'Orca', TMUX: '/tmp/tmux,123,0' },
    { guard: 'empty TMUX', TERM_PROGRAM: 'Orca', TMUX: '' },
    {
      guard: 'off switch none',
      TERM_PROGRAM: 'Orca',
      PI_IMAGE_PROTOCOL: 'nOnE',
    },
    { guard: 'off switch 0', TERM_PROGRAM: 'Orca', PI_IMAGE_PROTOCOL: '0' },
  ])('preserves native rendering and does not install for $guard', ({
    guard: _guard,
    ...env
  }) => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const image = largeImage();
    const nativeRender = Image.prototype.render;
    const native = image.render(80);
    const resize = vi.fn(async () => resizedPng());
    installImageDownscale({
      env,
      imageClass: Image,
      getCapabilities,
      getCellDimensions,
      resizeImage: resize,
    });

    expect(Image.prototype.render).toBe(nativeRender);
    expect(image.render(80)).toBe(native);
    expect(resize).not.toHaveBeenCalled();
  });

  it.each([
    {
      guard: 'non-Orca',
      changes: { TERM_PROGRAM: 'unknown' },
      images: 'kitty',
    },
    { guard: 'tmux', changes: { TMUX: '' }, images: 'kitty' },
    { guard: 'none', changes: { PI_IMAGE_PROTOCOL: 'NONE' }, images: 'kitty' },
    { guard: '0', changes: { PI_IMAGE_PROTOCOL: '0' }, images: 'kitty' },
    { guard: 'no image protocol', changes: {}, images: null },
    { guard: 'iTerm2', changes: {}, images: 'iterm2' },
  ] as const)('bypasses a pending placeholder and never swaps or schedules a redraw after $guard', async ({
    changes,
    images,
  }) => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const env: NodeJS.ProcessEnv = { TERM_PROGRAM: 'Orca' };
    const altScreenClass = screenClass();
    installAltScreenImageOrder({ env, altScreenClass, getCapabilities });
    const tui = new altScreenClass();
    tui.doRender();
    const pending = deferredResize();
    const image = largeImage();
    const source = Reflect.get(image, 'base64Data');
    installImageDownscale({
      env,
      imageClass: Image,
      altScreenClass,
      getCapabilities,
      getCellDimensions,
      resizeImage: pending.resizeImage,
    });
    expect(image.render(80).every((line) => line === '')).toBe(true);
    Object.assign(env, changes);
    setCapabilities({ images, trueColor: true, hyperlinks: true });

    expect(image.render(80).some((line) => line !== '')).toBe(true);
    pending.resolve(resizedPng());
    await drainCompletion();

    expect(Reflect.get(image, 'base64Data') === source).toBe(true);
    expect(tui.redraws).toEqual([]);
    expect(pending.resizeImage).toHaveBeenCalledTimes(1);
  });

  it.each([
    undefined,
    null,
    { prototype: {} },
    { prototype: { render: 'removed' } },
  ])('degrades silently when Image is unreachable: %j', (imageClass) => {
    const resize = vi.fn(async () => resizedPng());
    expect(() =>
      installImageDownscale({
        env: { TERM_PROGRAM: 'Orca' },
        imageClass,
        getCapabilities,
        getCellDimensions,
        resizeImage: resize,
      }),
    ).not.toThrow();
    expect(resize).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    null,
  ])('does not install without a callable resizeImage: %j', (resize) => {
    const nativeRender = Image.prototype.render;
    expect(() =>
      installImageDownscale({
        env: { TERM_PROGRAM: 'Orca' },
        imageClass: Image,
        getCapabilities,
        getCellDimensions,
        resizeImage: resize,
      }),
    ).not.toThrow();
    expect(Image.prototype.render).toBe(nativeRender);
  });

  it.each([
    'base64Data',
    'mimeType',
    'dimensions',
    'options',
    'pngData',
    'invalidate',
  ])('leaves native rendering alone if component field %s is unreachable', (field) => {
    const NativeImage = nativeImageClass();
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const image = new NativeImage();
    if (field === 'pngData') Reflect.deleteProperty(image, field);
    else Object.defineProperty(image, field, { value: undefined });
    const resize = vi.fn(async () => resizedPng());
    installImageDownscale({
      env: { TERM_PROGRAM: 'Orca' },
      imageClass: NativeImage,
      getCapabilities,
      getCellDimensions,
      resizeImage: resize,
    });

    expect(image.render(80)).toEqual(['native']);
    expect(resize).not.toHaveBeenCalled();
  });

  it.each([
    0,
    256 * 1024,
  ])('keeps a PNG with %i base64 bytes on the native path', (length) => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const image = new Image('A'.repeat(length), 'image/png', {
      fallbackColor: (text) => text,
    });
    const native = image.render(80);
    const resize = vi.fn(async () => resizedPng());
    installImageDownscale({
      env: { TERM_PROGRAM: 'Orca' },
      imageClass: Image,
      getCapabilities,
      getCellDimensions,
      resizeImage: resize,
    });

    expect(image.render(80)).toBe(native);
    expect(resize).not.toHaveBeenCalled();
  });

  it('leaves a >256 KB JPEG on Pi’s native transcoder path', async () => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const source = Buffer.from(pngFixture(1024, 1536, 77), 'base64');
    const jpeg = await resizeImage(source, 'image/png', {
      maxWidth: 1024,
      maxHeight: 1536,
      maxBytes: source.length,
    });
    expect(jpeg?.mimeType).toBe('image/jpeg');
    expect(jpeg?.data.length).toBeGreaterThan(256 * 1024);
    const transcoder = vi.fn(() => resizedPng().data);
    setImageTranscoder(transcoder);
    const image = new Image(jpeg?.data ?? '', 'image/jpeg', {
      fallbackColor: (text) => text,
    });
    const native = image.render(80);
    const resize = vi.fn(async () => resizedPng());
    installImageDownscale({
      env: { TERM_PROGRAM: 'Orca' },
      imageClass: Image,
      getCapabilities,
      getCellDimensions,
      resizeImage: resize,
    });

    expect(image.render(80)).toBe(native);
    expect(native[0].startsWith('\x1b_Ga=T')).toBe(true);
    expect(transcoder).toHaveBeenCalledExactlyOnceWith(
      Reflect.get(image, 'base64Data'),
      'image/jpeg',
    );
    expect(resize).not.toHaveBeenCalled();
  });

  it('reuses a resized PNG for recreated components with the same decoded source bytes, not the base64 spelling', async () => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    setCellDimensions({ widthPx: 9, heightPx: 18 });
    const pending = deferredResize();
    installImageDownscale({
      env: { TERM_PROGRAM: 'Orca' },
      imageClass: Image,
      getCapabilities,
      getCellDimensions,
      resizeImage: pending.resizeImage,
      now: () => 100,
    });
    const first = largeImage();
    first.render(80);
    const result = resizedPng();
    pending.resolve(result);
    await drainCompletion();
    const second = largeImage();
    const source = Reflect.get(second, 'base64Data') as string;
    Reflect.set(
      second,
      'base64Data',
      `${source.slice(0, 100)}\n${source.slice(100)}`,
    );

    expect(second.render(80)[0]).toContain(result.data);
    expect(Reflect.get(second, 'dimensions')).toEqual({
      widthPx: 360,
      heightPx: 540,
    });
    expect(pending.resizeImage).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight resize per digest and finishes every waiting component', async () => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    setCellDimensions({ widthPx: 9, heightPx: 18 });
    const pending = deferredResize();
    installImageDownscale({
      env: { TERM_PROGRAM: 'Orca' },
      imageClass: Image,
      getCapabilities,
      getCellDimensions,
      resizeImage: pending.resizeImage,
    });
    const first = largeImage();
    const second = largeImage();

    expect(first.render(80)).toEqual(Array(30).fill(''));
    expect(second.render(80)).toEqual(Array(30).fill(''));
    expect(pending.resizeImage).toHaveBeenCalledTimes(1);
    pending.resolve(resizedPng());
    await drainCompletion();

    expect(first.render(80)[0].startsWith('\x1b_Ga=T')).toBe(true);
    expect(second.render(80)[0].startsWith('\x1b_Ga=T')).toBe(true);
    expect(Reflect.get(first, 'base64Data')).toBe(
      Reflect.get(second, 'base64Data'),
    );
  });

  it('keeps at most 32 cached sources and refreshes the least-recently-used order with the injected clock', async () => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    let time = 0;
    const resize = vi.fn(async () => resizedPng());
    installImageDownscale({
      env: { TERM_PROGRAM: 'Orca' },
      imageClass: Image,
      getCapabilities,
      getCellDimensions,
      resizeImage: resize,
      now: () => time,
    });
    for (let seed = 0; seed < 32; seed++) {
      time++;
      largeImage(seed).render(80);
      await drainCompletion();
    }
    time++;
    expect(largeImage(0).render(80)[0].startsWith('\x1b_Ga=T')).toBe(true);
    expect(resize).toHaveBeenCalledTimes(32);
    time++;
    largeImage(32).render(80);
    await drainCompletion();
    time++;
    expect(largeImage(0).render(80)[0].startsWith('\x1b_Ga=T')).toBe(true);
    expect(resize).toHaveBeenCalledTimes(33);

    expect(largeImage(1).render(80)).toEqual(Array(30).fill(''));
    expect(resize).toHaveBeenCalledTimes(34);
    await drainCompletion();
  });

  it('retains exactly 16 MB of cached base64 but evicts the oldest source when the byte limit is exceeded', async () => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const eightMb = { ...resizedPng(), data: 'A'.repeat(8 * 1024 * 1024) };
    const resize = vi.fn(async () => eightMb);
    let time = 0;
    installImageDownscale({
      env: { TERM_PROGRAM: 'Orca' },
      imageClass: Image,
      getCapabilities,
      getCellDimensions,
      resizeImage: resize,
      now: () => ++time,
    });
    for (const seed of [0, 1]) {
      largeImage(seed).render(80);
      await drainCompletion();
    }
    expect(largeImage(1).render(80)[0].startsWith('\x1b_Ga=T')).toBe(true);
    expect(resize).toHaveBeenCalledTimes(2);
    resize.mockResolvedValue(resizedPng());
    largeImage(2).render(80);
    await drainCompletion();
    expect(largeImage(1).render(80)[0].startsWith('\x1b_Ga=T')).toBe(true);
    expect(resize).toHaveBeenCalledTimes(3);

    expect(
      largeImage(0)
        .render(80)
        .every((line) => line === ''),
    ).toBe(true);
    expect(resize).toHaveBeenCalledTimes(4);
    await drainCompletion();
  });

  it('does not retain an individual resized base64 payload larger than the cache byte bound', async () => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const resize = vi.fn(async () => ({
      ...resizedPng(),
      data: 'A'.repeat(16 * 1024 * 1024 + 4),
    }));
    installImageDownscale({
      env: { TERM_PROGRAM: 'Orca' },
      imageClass: Image,
      getCapabilities,
      getCellDimensions,
      resizeImage: resize,
    });
    largeImage().render(80);
    await drainCompletion();

    expect(
      largeImage()
        .render(80)
        .every((line) => line === ''),
    ).toBe(true);
    expect(resize).toHaveBeenCalledTimes(2);
    await drainCompletion();
  });

  it('exports the 256 KB trigger, 32-entry bound and 16 MB base64 bound', () => {
    expect([
      IMAGE_DOWNSCALE_THRESHOLD,
      IMAGE_DOWNSCALE_CACHE_ENTRIES,
      IMAGE_DOWNSCALE_CACHE_BYTES,
    ]).toEqual([262_144, 32, 16_777_216]);
  });

  it.each([
    'stopped',
    'inactive',
  ])('updates the display but never renders the latest %s screen', async (reason) => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const env = { TERM_PROGRAM: 'Orca' };
    const altScreenClass = screenClass();
    installAltScreenImageOrder({ env, altScreenClass, getCapabilities });
    const first = new altScreenClass();
    first.doRender();
    const latest = new altScreenClass();
    latest.doRender();
    const pending = deferredResize();
    installImageDownscale({
      env,
      imageClass: Image,
      altScreenClass,
      getCapabilities,
      getCellDimensions,
      resizeImage: pending.resizeImage,
    });
    const image = largeImage();
    image.render(80);
    if (reason === 'stopped') latest.stopped = true;
    else latest.altScreenActive = false;
    const result = resizedPng();
    pending.resolve(result);
    await drainCompletion();

    expect(image.render(80)[0]).toContain(result.data);
    expect(first.redraws).toEqual([]);
    expect(latest.redraws).toEqual([]);
  });

  it('never modifies frozen model-facing tool-result content', async () => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const content = Object.freeze({
      type: 'image',
      mimeType: 'image/png',
      data: Buffer.alloc(200_000, 42).toString('base64'),
    });
    const toolResult = Object.freeze({ content: Object.freeze([content]) });
    const original = toolResult.content[0].data;
    const image = new Image(
      content.data,
      content.mimeType,
      { fallbackColor: (text) => text },
      {},
      { widthPx: 1024, heightPx: 1536 },
    );
    const pending = deferredResize();
    installImageDownscale({
      env: { TERM_PROGRAM: 'Orca' },
      imageClass: Image,
      getCapabilities,
      getCellDimensions,
      resizeImage: pending.resizeImage,
    });
    image.render(80);
    const result = resizedPng();
    pending.resolve(result);
    await drainCompletion();

    expect(Reflect.get(image, 'base64Data')).toBe(result.data);
    expect(toolResult.content[0]).toBe(content);
    expect(toolResult.content[0].data === original).toBe(true);
    expect(toolResult.content[0].mimeType).toBe('image/png');
  });

  it('uses native aspect rounding for width limits, custom height limits and cell dimensions', () => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    setCellDimensions({ widthPx: 9, heightPx: 18 });
    const pending = deferredResize();
    const images = [
      largeImage(1),
      new Image(
        Reflect.get(largeImage(2), 'base64Data'),
        'image/png',
        { fallbackColor: (text) => text },
        { maxWidthCells: 40, maxHeightCells: 20 },
        { widthPx: 1024, heightPx: 1536 },
      ),
      largeImage(3),
    ];
    const nativeRows = [
      images[0].render(10).length,
      images[1].render(80).length,
      images[2].render(3).length,
    ];
    expect(nativeRows).toEqual([4, 20, 1]);
    installImageDownscale({
      env: { TERM_PROGRAM: 'Orca' },
      imageClass: Image,
      getCapabilities,
      getCellDimensions,
      resizeImage: pending.resizeImage,
    });

    expect(images[0].render(10)).toEqual(Array(4).fill(''));
    expect(images[1].render(80)).toEqual(Array(20).fill(''));
    expect(images[2].render(3)).toEqual(['']);
    expect(pending.resizeImage.mock.calls.map((call) => call[2])).toEqual([
      { maxWidth: 45, maxHeight: 72, maxBytes: 200_000 },
      { maxWidth: 243, maxHeight: 360, maxBytes: 200_000 },
      { maxWidth: 9, maxHeight: 18, maxBytes: 200_000 },
    ]);
  });

  it('validates final geometry against the most recent placeholder width, rather than the first render width', async () => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    setCellDimensions({ widthPx: 9, heightPx: 18 });
    const image = new Image(
      Reflect.get(largeImage(), 'base64Data'),
      'image/png',
      { fallbackColor: (text) => text },
      { maxHeightCells: 60 },
      { widthPx: 655, heightPx: 600 },
    );
    const pending = deferredResize();
    installImageDownscale({
      env: { TERM_PROGRAM: 'Orca' },
      imageClass: Image,
      getCapabilities,
      getCellDimensions,
      resizeImage: pending.resizeImage,
    });
    expect(image.render(80)).toHaveLength(27);
    expect(image.render(20)).toEqual(Array(8).fill(''));
    const result = resizedPng(530, 486);
    pending.resolve(result);
    await drainCompletion();

    expect(image.render(20)).toHaveLength(8);
    expect(Reflect.get(image, 'base64Data')).toBe(result.data);
  });

  it('does not replace display content that changed while its resize was pending', async () => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const image = largeImage();
    const pending = deferredResize();
    installImageDownscale({
      env: { TERM_PROGRAM: 'Orca' },
      imageClass: Image,
      getCapabilities,
      getCellDimensions,
      resizeImage: pending.resizeImage,
    });
    image.render(80);
    const replacement = pngFixture(16, 48);
    Reflect.set(image, 'base64Data', replacement);
    pending.resolve(resizedPng());
    await drainCompletion();

    expect(Reflect.get(image, 'base64Data')).toBe(replacement);
  });

  it('installs its own hook once across reloads independently of the ordering hook', async () => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const pending = deferredResize();
    const env = { TERM_PROGRAM: 'Orca' };
    const altScreenClass = screenClass();
    const deps = {
      env,
      imageClass: Image,
      altScreenClass,
      getCapabilities,
      getCellDimensions,
      resizeImage: pending.resizeImage,
    };
    installImageDownscale(deps);
    const render = Image.prototype.render;
    installAltScreenImageOrder({ env, altScreenClass, getCapabilities });
    const tui = new altScreenClass();
    tui.doRender();
    vi.resetModules();
    const reloaded = await import('./image-downscale.ts');
    reloaded.installImageDownscale(deps);

    expect(Image.prototype.render).toBe(render);
    const image = largeImage();
    image.render(80);
    pending.resolve(resizedPng());
    await drainCompletion();
    expect(tui.redraws).toEqual([false]);
    expect(pending.resizeImage).toHaveBeenCalledTimes(1);
  });

  it('preserves native render failures without invoking the native method twice', () => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const ImageClass = nativeImageClass();
    const native = vi.fn(() => {
      throw new Error('native failure');
    });
    ImageClass.prototype.render = native;
    const image = new ImageClass();
    image.mimeType = 'image/jpeg';
    installImageDownscale({
      env: { TERM_PROGRAM: 'Orca' },
      imageClass: ImageClass,
      getCapabilities,
      getCellDimensions,
      resizeImage,
    });

    expect(() => image.render(80)).toThrow('native failure');
    expect(native).toHaveBeenCalledTimes(1);
  });

  it('degrades silently when the Image prototype is not writable', () => {
    const ImageClass = nativeImageClass();
    Object.freeze(ImageClass.prototype);
    expect(() =>
      installImageDownscale({
        env: { TERM_PROGRAM: 'Orca' },
        imageClass: ImageClass,
        getCapabilities,
        getCellDimensions,
        resizeImage,
      }),
    ).not.toThrow();
    expect(new ImageClass().render(80)).toEqual(['native']);
  });

  it.each([
    'base64Data',
    'dimensions',
    'pngData',
  ])('does not start resizing when %s is readonly', (field) => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const ImageClass = nativeImageClass();
    const image = new ImageClass();
    Object.defineProperty(image, field, { writable: false });
    const resize = vi.fn(async () => resizedPng());
    installImageDownscale({
      env: { TERM_PROGRAM: 'Orca' },
      imageClass: ImageClass,
      getCapabilities,
      getCellDimensions,
      resizeImage: resize,
    });
    expect(image.render(80)).toEqual(['native']);
    expect(resize).not.toHaveBeenCalled();
  });

  it.each([
    {
      missing: 'capability reader',
      getCapabilities: undefined,
      getCellDimensions,
    },
    {
      missing: 'cell dimensions reader',
      getCapabilities,
      getCellDimensions: undefined,
    },
  ])('does not install when the $missing is unreachable', (helpers) => {
    const ImageClass = nativeImageClass();
    const native = ImageClass.prototype.render;
    installImageDownscale({
      env: { TERM_PROGRAM: 'Orca' },
      imageClass: ImageClass,
      resizeImage,
      ...helpers,
    });
    expect(ImageClass.prototype.render).toBe(native);
  });

  it.each([
    {
      missing: 'capabilities',
      getCapabilities: () => {
        throw new Error('unreachable');
      },
      getCellDimensions,
    },
    {
      missing: 'cell dimensions',
      getCapabilities,
      getCellDimensions: () => {
        throw new Error('unreachable');
      },
    },
  ])('preserves the native render when $missing cannot be read', (helpers) => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const ImageClass = nativeImageClass();
    const resize = vi.fn(async () => resizedPng());
    installImageDownscale({
      env: { TERM_PROGRAM: 'Orca' },
      imageClass: ImageClass,
      resizeImage: resize,
      ...helpers,
    });
    expect(new ImageClass().render(80)).toEqual(['native']);
    expect(resize).not.toHaveBeenCalled();
  });

  it('also accepts a one-row decrease while retaining the encoded dimensions', async () => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    setCellDimensions({ widthPx: 9, heightPx: 18 });
    const image = new Image(
      Reflect.get(largeImage(), 'base64Data'),
      'image/png',
      { fallbackColor: (text) => text },
      {},
      { widthPx: 655, heightPx: 600 },
    );
    const pending = deferredResize();
    installImageDownscale({
      env: { TERM_PROGRAM: 'Orca' },
      imageClass: Image,
      getCapabilities,
      getCellDimensions,
      resizeImage: pending.resizeImage,
    });
    expect(image.render(80)).toHaveLength(27);
    pending.resolve(resizedPng(540, 460));
    await drainCompletion();
    expect(image.render(80)).toHaveLength(26);
    expect(Reflect.get(image, 'dimensions')).toEqual({
      widthPx: 540,
      heightPx: 460,
    });
  });

  it('requests an ordinary redraw after resize failure so the original does not stay blank', async () => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const env = { TERM_PROGRAM: 'Orca' };
    const altScreenClass = screenClass();
    installAltScreenImageOrder({ env, altScreenClass, getCapabilities });
    const tui = new altScreenClass();
    tui.doRender();
    const pending = deferredResize();
    const image = largeImage();
    installImageDownscale({
      env,
      imageClass: Image,
      altScreenClass,
      getCapabilities,
      getCellDimensions,
      resizeImage: pending.resizeImage,
    });
    image.render(80);
    pending.resolve(null);
    await drainCompletion();
    expect(tui.redraws).toEqual([false]);
    expect(image.render(80)[0].startsWith('\x1b_Ga=T')).toBe(true);
  });

  it('registers display downscaling on extension load', () => {
    vi.stubEnv('TERM_PROGRAM', 'Orca');
    vi.stubEnv('TMUX', undefined);
    vi.stubEnv('PI_IMAGE_PROTOCOL', undefined);
    const nativeRender = Image.prototype.render;

    orcaImages({ on() {} } as unknown as ExtensionAPI);

    expect(Image.prototype.render).not.toBe(nativeRender);
  });
});

function orcaEnvironment() {
  vi.stubEnv('TERM_PROGRAM', 'Orca');
  vi.stubEnv('TERM', 'xterm-256color');
  for (const key of ['TMUX', 'PI_IMAGE_PROTOCOL', 'WEZTERM_PANE'])
    vi.stubEnv(key, undefined);
  setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
  setCellDimensions({ widthPx: 9, heightPx: 18 });
}

function fullRedrawTui(images: Image[]) {
  const writes: string[] = [];
  const terminal: Terminal = {
    columns: 80,
    rows: 140,
    kittyProtocolActive: false,
    start() {},
    stop() {},
    async drainInput() {},
    write(data) {
      writes.push(data);
    },
    moveBy() {},
    hideCursor() {},
    showCursor() {},
    clearLine() {},
    clearFromCursor() {},
    clearScreen() {},
    setTitle() {},
    setProgress() {},
  };
  const tui = new TuiAltScreen(terminal, false, undefined, { mouse: false });
  for (const image of images) tui.addChild(image);
  activeTuis.push(tui);
  tui.start();
  return {
    tui,
    frame() {
      writes.length = 0;
      tui.renderNow(true);
      return writes.join('');
    },
  };
}

function kittyBytes(frame: string) {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Measure complete Kitty APCs from real terminal writes.
  return [...frame.matchAll(/\x1b_G[\s\S]*?\x1b\\/g)].reduce(
    (bytes, match) => bytes + Buffer.byteLength(match[0]),
    0,
  );
}

describe('real Pi display resize regressions and redraw bytes', () => {
  it('accepts the single-row adjustment for a real 655×600 PNG without stretching encoded dimensions', async () => {
    orcaEnvironment();
    const image = new Image(pngFixture(655, 600, 65, true), 'image/png', {
      fallbackColor: (text) => text,
    });
    expect(image.render(80)).toHaveLength(27);
    const jobs: Array<Promise<ResizedImage | null>> = [];
    const resize: typeof resizeImage = (...args) => {
      const job = resizeImage(...args);
      jobs.push(job);
      return job;
    };
    installImageDownscale({
      env: process.env,
      imageClass: Image,
      getCapabilities,
      getCellDimensions,
      resizeImage: resize,
    });
    expect(image.render(80)).toEqual(Array(27).fill(''));
    const result = await jobs[0];
    await drainCompletion();

    expect(result?.mimeType).toBe('image/png');
    expect(result?.wasResized).toBe(true);
    expect(Reflect.get(image, 'dimensions')).toEqual({
      widthPx: 530,
      heightPx: 486,
    });
    expect(image.render(80)).toHaveLength(28);
    expect(image.render(80)[0].startsWith('\x1b_Ga=T')).toBe(true);
    expect(jobs).toHaveLength(1);
  }, 15_000);

  it('discards a non-PNG resize result and still emits the original PNG as Kitty without any transcoder', async () => {
    orcaEnvironment();
    setImageTranscoder(undefined);
    const image = new Image(pngFixture(1024, 1536, 3), 'image/png', {
      fallbackColor: (text) => text,
    });
    const source = Reflect.get(image, 'base64Data');
    installAltScreenImageOrder();
    const { frame } = fullRedrawTui([image]);
    const original = kittyBytes(frame());
    const pending = deferredResize();
    installImageDownscale({
      env: process.env,
      imageClass: Image,
      getCapabilities,
      getCellDimensions,
      resizeImage: pending.resizeImage,
    });
    const placeholder = frame();
    expect(placeholder).not.toContain('\x1b_Ga=T');
    expect(placeholder).not.toContain('\x1b_Ga=p');
    pending.resolve({ ...resizedPng(), mimeType: 'image/jpeg' });
    await drainCompletion();

    expect(Reflect.get(image, 'base64Data') === source).toBe(true);
    expect(kittyBytes(frame())).toBe(original);
    expect(pending.resizeImage).toHaveBeenCalledTimes(1);
  });

  it('reduces Kitty bytes per full redraw by at least 5× for four deterministic 1024×1536 PNGs in an 80×140 viewport', async () => {
    orcaEnvironment();
    const images = [11, 22, 33, 44].map(
      (seed) =>
        new Image(pngFixture(1024, 1536, seed), 'image/png', {
          fallbackColor: (text) => text,
        }),
    );
    installAltScreenImageOrder();
    const { frame } = fullRedrawTui(images);
    const baseline = frame();
    expect(baseline.split('\x1b_Ga=T')).toHaveLength(5);
    const originalBytes = kittyBytes(baseline);
    const jobs: Array<Promise<ResizedImage | null>> = [];
    const resize: typeof resizeImage = (...args) => {
      const job = resizeImage(...args);
      jobs.push(job);
      return job;
    };
    installImageDownscale({
      env: process.env,
      imageClass: Image,
      getCapabilities,
      getCellDimensions,
      resizeImage: resize,
    });

    const placeholder = frame();
    await Promise.all(jobs);
    await drainCompletion();
    const resized = frame();
    const resizedBytes = kittyBytes(resized);
    process.stdout.write(
      `Kitty full redraw: ${originalBytes} → ${resizedBytes} bytes (${(originalBytes / resizedBytes).toFixed(2)}× reduction)\n`,
    );

    expect(resizedBytes).toBeGreaterThan(0);
    expect(originalBytes / resizedBytes).toBeGreaterThanOrEqual(5);
    expect(jobs).toHaveLength(4);
    expect(placeholder).not.toContain('\x1b_Ga=T');
    expect(placeholder).not.toContain('\x1b_Ga=p');
    expect(resized.split('\x1b_Ga=T')).toHaveLength(5);
    expect(images.map((image) => image.render(80).length)).toEqual([
      30, 30, 30, 30,
    ]);
    expect(images.map((image) => Reflect.get(image, 'dimensions'))).toEqual(
      Array(4).fill({ widthPx: 360, heightPx: 540 }),
    );
  }, 30_000);
});
