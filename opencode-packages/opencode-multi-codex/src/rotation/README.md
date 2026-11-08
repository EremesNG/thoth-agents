# Rotation host contract (OpenCode v2.2.6)

Rotation owns process-wide account blocks, not a "last request" per session.
HTTP attribution uses only the sent native account/auth headers. Retry decisions
never infer which request failed; a rebuilt request consults the current block
state again. Prepared auxiliary requests can still fail on their original account.

Verified against `anomalyco/opencode@v2.2.6`:

- `packages/core/src/session/model-request.ts` L337-398: model hook sees only
  headers/baseURL; HTTP response sees the actual sent request and raw response.
- `packages/core/src/session/model-transport.ts` L309-345: handshake precedes
  socket selection, including reuse and header-affinity reconnects. L430-456:
  receive hook precedes driver observation; errors close the socket. L509-530:
  a per-session lock serializes the handshake and full exchange. Therefore only
  the WebSocket handshake updates the receive-attribution context; HTTP never does.
- `packages/plugin/src/promise/session.ts` L134-141 and
  `packages/core/src/session/to-session-error.ts` L134-143: retry carries normalized
  status/response body, but no request kind or identity.
- `packages/core/src/session/runner/retry.ts`: mutate `event.decision` to request
  immediate retry within the host retry budget; leave it untouched on exhaustion.
- `packages/core/src/session/runner/llm.ts` L233-305: primary retry rebuilds the
  model request. Compaction reuses prepared requests; generate/title do not use
  the same plugin retry callback. Later newly prepared requests still route.

## Encrypted reasoning seam

`SessionModelRequest` has **no mutable body/messages/input**. Stripping encrypted
reasoning here cannot be implemented cleanly. No enabled-by-default flag or
payload rewriting is installed. Native replay state and cross-account reasoning
validity remain a live-validation requirement. If the host later exposes mutable
input at this hook, strip prior-account reasoning items/`encrypted_content` only
on cross-account rerouting (default-on opt-out flag), without dropping visible
conversation/tool content. A send-frame or HTTP-body rewrite is intentionally not
substituted: it could desynchronize the host continuation driver and would need
a separately reviewed contract.

Unknown resets block for five minutes; eligibility then awaits a quota refresh
attempt. Failed refresh leaves quota unknown/stale (ranked last), not indefinitely
blocked. A fresh exhausted quota with a future reset extends the block to that
reset. Known resets expire without an extra cooldown.
