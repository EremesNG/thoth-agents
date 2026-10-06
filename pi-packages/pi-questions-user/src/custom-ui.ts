import type {
  KeybindingsManager,
  Theme,
} from '@earendil-works/pi-coding-agent';
import type { Component, TUI } from '@earendil-works/pi-tui';
import type { AnswerState, QuestionResult } from './answers.js';
import { createQuestionnaireUI } from './ui/index.js';

export interface QuestionUISession {
  state: AnswerState;
  signal?: AbortSignal;
  /** Report recorded answers after transitions so an abort can preserve them. */
  onStateChange(state: AnswerState): void;
}

/** Undefined is reserved for UI unavailability; cancel with buildResult(state, {cancelled: true}). */
export type QuestionUIFactory = (
  tui: TUI,
  theme: Theme,
  keybindings: KeybindingsManager,
  done: (result: QuestionResult | undefined) => void,
) =>
  | (Component & { dispose?(): void })
  | Promise<Component & { dispose?(): void }>;

export type QuestionUIHook = (
  session: QuestionUISession,
) => QuestionUIFactory | undefined;

export const getQuestionUIFactory: QuestionUIHook = createQuestionnaireUI;
