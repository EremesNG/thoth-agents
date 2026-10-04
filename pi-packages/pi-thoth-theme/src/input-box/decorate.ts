import {
  type TuiMouseEvent,
  type TuiMouseEventResult,
  truncateToWidth,
  visibleWidth,
} from '@earendil-works/pi-tui';
import type { ActiveThemeLike } from '../status-line/layout.ts';
import {
  inputLabelWidth,
  renderInputBottom,
  renderInputTop,
  renderPlaceholder,
  wrapContentRow,
} from './frame.ts';
import type { WorkingState } from './state.ts';

export const MIN_INPUT_BOX_WIDTH = 16;

interface EditorLike {
  render(width: number): string[];
  renderTopBorder(width: number, hiddenLineCount: number): string;
  renderBottomBorder(width: number, hiddenLineCount: number): string;
  getText(): string;
  getPaddingX(): number;
  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined;
  borderColor(text: string): string;
  workingStatusIndicator?: unknown;
}

export interface InputBoxDeps {
  theme: ActiveThemeLike;
  working: WorkingState;
}

export interface EditorDecoration {
  dispose(): void;
}

const decoratedEditors = new WeakSet<object>();
const decorations = new WeakMap<object, EditorDecoration>();
const methodNames = [
  'render',
  'renderTopBorder',
  'renderBottomBorder',
  'getText',
  'getPaddingX',
  'handleMouse',
  'borderColor',
] as const;

// Do not read editor.render: the background-task Proxy getter dynamically calls
// target.render, which would recurse after replacing that same target method.
function method<Name extends keyof EditorLike>(
  editor: object,
  name: Name,
): EditorLike[Name] | undefined {
  for (
    let owner: object | null = editor;
    owner;
    owner = Reflect.getPrototypeOf(owner)
  ) {
    const descriptor = Reflect.getOwnPropertyDescriptor(owner, name);
    if (descriptor)
      return typeof descriptor.value === 'function'
        ? descriptor.value
        : undefined;
  }
  return undefined;
}

export function isEditorLike(editor: unknown): editor is EditorLike {
  if (!editor || typeof editor !== 'object') return false;
  if (decoratedEditors.has(editor)) return true;
  try {
    return methodNames.every((name) => method(editor, name) !== undefined);
  } catch {
    return false;
  }
}

export function decorateEditor(
  editor: unknown,
  deps: InputBoxDeps,
): EditorDecoration | undefined {
  if (!isEditorLike(editor)) return undefined;
  if (decoratedEditors.has(editor)) return decorations.get(editor);
  const names = [
    'render',
    'renderTopBorder',
    'renderBottomBorder',
    'handleMouse',
    'borderColor',
  ] as const;
  if (
    !Reflect.isExtensible(editor) ||
    names.some(
      (name) =>
        Reflect.getOwnPropertyDescriptor(editor, name)?.configurable === false,
    )
  )
    return undefined;
  const originals = Object.fromEntries(
    methodNames.map((name) => [name, method(editor, name)]),
  ) as unknown as EditorLike;
  const descriptors = new Map(
    names.map((name) => [name, Reflect.getOwnPropertyDescriptor(editor, name)]),
  );
  let active = true;
  let outerWidth: number | undefined;
  let fallback = false;
  let top: string | undefined;
  let bottom: string | undefined;
  // Mouse hit-testing follows the last render's boxed or native geometry.
  let boxRendered = false;
  const accent = (text: string) => deps.theme.fg?.('accent', text) ?? text;

  function nativeRender(receiver: EditorLike, width: number): string[] {
    fallback = true;
    try {
      return originals.render.call(receiver, width);
    } finally {
      fallback = false;
    }
  }

  const patches: PropertyDescriptorMap = {
    render: {
      configurable: true,
      writable: true,
      value(this: EditorLike, width: number): string[] {
        boxRendered = false;
        if (!active || width < MIN_INPUT_BOX_WIDTH)
          return nativeRender(this, width);
        const innerWidth = Math.floor(width) - 2;
        const maxPadding = Math.max(0, Math.floor((innerWidth - 1) / 2));
        const paddingX = Math.min(originals.getPaddingX.call(this), maxPadding);
        const contentWidth = Math.max(1, innerWidth - paddingX * 2);
        const layoutWidth = Math.max(1, contentWidth - (paddingX ? 0 : 1));
        // Native word wrapping recurses on a wide grapheme at width 1. Keep
        // its original geometry when the box plus current padding is unsafe.
        if (layoutWidth < 2) return nativeRender(this, width);
        outerWidth = Math.floor(width);
        top = undefined;
        bottom = undefined;
        let lines: string[];
        try {
          lines = originals.render.call(this, outerWidth - 2);
        } finally {
          outerWidth = undefined;
        }
        const bottomIndex =
          bottom === undefined ? -1 : lines.indexOf(bottom, 1);
        if (top === undefined || lines[0] !== top || bottomIndex < 2)
          return nativeRender(this, width);
        const text = originals.getText.call(this);
        lines = lines.map((line, index) => {
          if (index === 0 || index === bottomIndex) return line;
          if (index > bottomIndex)
            return ` ${truncateToWidth(line, width - 2, '', true)} `;
          return wrapContentRow(
            renderPlaceholder(line, width - 2, deps.theme, text),
            width,
            deps.theme,
          );
        });
        boxRendered = true;
        return lines;
      },
    },
    renderTopBorder: {
      configurable: true,
      writable: true,
      value(this: EditorLike, width: number, hidden: number): string {
        if (
          outerWidth === undefined ||
          (hidden > 0 && visibleWidth(`↑ ${hidden} more`) > outerWidth - 6)
        )
          return originals.renderTopBorder.call(this, width, hidden);
        const status = deps.working.status(
          this.workingStatusIndicator,
          inputLabelWidth(outerWidth, hidden),
        );
        top = renderInputTop(outerWidth, deps.theme, status, hidden);
        return top;
      },
    },
    renderBottomBorder: {
      configurable: true,
      writable: true,
      value(this: EditorLike, width: number, hidden: number): string {
        if (
          outerWidth === undefined ||
          (hidden > 0 && visibleWidth(`↓ ${hidden} more`) > outerWidth - 6)
        )
          return originals.renderBottomBorder.call(this, width, hidden);
        bottom = renderInputBottom(outerWidth, deps.theme, hidden);
        return bottom;
      },
    },
    handleMouse: {
      configurable: true,
      writable: true,
      value(
        this: EditorLike,
        event: TuiMouseEvent,
      ): TuiMouseEventResult | undefined {
        const translated =
          active && boxRendered
            ? { ...event, x: event.x - 1, width: event.width - 2 }
            : event;
        return originals.handleMouse.call(this, translated);
      },
    },
    borderColor: {
      configurable: true,
      get: () => (fallback ? originals.borderColor : accent),
      set: () => {},
    },
  };
  Object.defineProperties(editor, patches);
  const decoration: EditorDecoration = {
    dispose() {
      if (!active) return;
      active = false;
      for (const name of names) {
        const current = Reflect.getOwnPropertyDescriptor(editor, name);
        const patch = patches[name];
        if (
          current?.value !== patch.value ||
          current?.get !== patch.get ||
          current?.set !== patch.set
        )
          continue;
        const descriptor = descriptors.get(name);
        if (descriptor) Object.defineProperty(editor, name, descriptor);
        else Reflect.deleteProperty(editor, name);
      }
      decoratedEditors.delete(editor);
      decorations.delete(editor);
    },
  };
  decoratedEditors.add(editor);
  decorations.set(editor, decoration);
  return decoration;
}
