import {
  CustomEditor,
  type ExtensionToolContext,
} from '@earendil-works/pi-coding-agent';
import { type Component, matchesKey } from '@earendil-works/pi-tui';
import {
  type EditorSlotHandle,
  registerEditorSlot,
} from '@thoth-agents/pi-core/panel';
import type { QuestionResult } from './answers.js';
import type { QuestionUIHook, QuestionUISession } from './custom-ui.js';

type QuestionComponent = Component & { dispose?(): void };

/** Mount the same questionnaire instance throughout collapse/expand and settle only once. */
export function openQuestionDock(
  ctx: ExtensionToolContext,
  toolCallId: string,
  uiHook: QuestionUIHook,
  session: QuestionUISession,
  abortedResult: () => QuestionResult,
  onCollapsedChange: (collapsed: boolean) => void,
): Promise<QuestionResult | undefined> {
  let component: QuestionComponent | undefined;
  let slot: EditorSlotHandle | undefined;
  let collapsed = false;
  let closed = false;
  const factory = uiHook({
    ...session,
    onCollapseChange(next) {
      if (closed || collapsed === next) return;
      collapsed = next;
      if (next) slot?.releaseFocus();
      else slot?.acquireFocus();
      slot?.refresh();
      onCollapsedChange(next);
    },
  });
  if (!factory) return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      session.signal?.removeEventListener('abort', abort);
      try {
        slot?.dispose();
      } finally {
        // Match the SDK custom-UI contract: disposal errors cannot strand completion.
        try {
          component?.dispose?.();
        } catch {
          /* best-effort teardown */
        }
      }
    };
    const close = (result: QuestionResult | undefined) => {
      if (closed) return;
      closed = true;
      try {
        cleanup();
      } finally {
        resolve(result);
      }
    };
    const abort = () => close(abortedResult());
    const fail = (error: unknown) => {
      if (closed) return;
      closed = true;
      try {
        cleanup();
      } finally {
        reject(error);
      }
    };
    try {
      slot = registerEditorSlot(
        ctx,
        {
          key: `thoth-question-${toolCallId}`,
          aboveEditor: () => ({
            render: (width) =>
              collapsed ? (component?.render(width) ?? []) : [],
            invalidate: () => component?.invalidate(),
          }),
          replacement: () => (collapsed ? undefined : component),
          handleInput(data) {
            if (closed || !component || !matchesKey(data, 'ctrl+]')) return;
            component.handleInput?.(data);
            return { consume: true };
          },
        },
        (tui, theme, keys) =>
          new CustomEditor(tui, theme, keys, { embedWorkingStatus: true }),
      );
      if (!slot) {
        close(undefined);
        return;
      }
      session.signal?.addEventListener('abort', abort, { once: true });
      if (session.signal?.aborted) {
        abort();
        return;
      }
      const mount = (created: QuestionComponent) => {
        if (closed) {
          try {
            created.dispose?.();
          } catch {
            /* SDK disposal is best effort */
          }
          return;
        }
        component = created;
        slot?.acquireFocus();
        slot?.refresh();
      };
      const created = factory(slot.tui, ctx.ui.theme, slot.keybindings, close);
      if ('then' in created) void created.then(mount).catch(fail);
      else mount(created);
    } catch (error) {
      fail(error);
    }
  });
}
