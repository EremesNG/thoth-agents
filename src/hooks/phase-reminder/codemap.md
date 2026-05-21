# src/hooks/phase-reminder/

<!-- Explorer: Fill in this section with architectural understanding -->

## Responsibility

Keep the orchestrator agent’s working memory on track by injecting a terse phase reminder directly into the payload sent to the API. Because the reminder lives in `experimental.chat.messages.transform`, it doesn’t surface in the UI until the next response is generated, yet it keeps the delegate→plan→execute→verify workflow in scope for every user turn.

## Design

Exports a single factory (`createPhaseReminderHook`) that supplies an `experimental.chat.messages.transform` handler. The hook stores the reminder template in `PHASE_REMINDER`, scopes mutation to the orchestrator (or default session) only, and rewrites the first text part of the last user message by prefixing it with the reminder plus a divider. Encapsulating this in a synchronous factory keeps the hook pluggable and compatible with the global hook registry.

## Flow

When the hook fires, it inspects the outgoing messages array, walks backward to locate the last `'user'` role entry, and short-circuits if none exists. If the user message belongs to another agent, it skips mutation. Otherwise it finds the first text part, prepends the reminder block (and a separator) to the existing text, and leaves the rest of the payload untouched. Since it modifies `output.messages` just before the API call, downstream components (like UI) never see the reminder; it only influences the assistant’s reasoning in the next turn.

## Integration

Registered through the shared hook registry, this module hooks the `experimental.chat.messages.transform` lifecycle event that runs right before OpenAI invocation. It only touches the orchestrator session’s outgoing message list, so its effect is indirect: the reminder guides every assistant response that follows the user turn, but no other module needs to call it explicitly.
