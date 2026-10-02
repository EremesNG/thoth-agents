# @thoth-agents/pi-openai-fast

Pi extension that adds a priority-tier `-fast` sibling next to every OpenAI model
Pi can reach through the Responses APIs.

For each physical model whose `api` is `openai-responses` or
`openai-codex-responses`, the extension lists `<provider>/<id>-fast` inside the
same provider. This covers the built-in `openai` and `openai-codex` providers and
providers added by other extensions (for example `openai-codex-2`), without naming
any of them. Selecting a fast variant sends the request to the physical
`<provider>/<id>` with that provider's own credentials and `service_tier: "priority"`.

## Install

```sh
pi install npm:@thoth-agents/pi-openai-fast
```

## How it works

- On every `session_start` (startup, reload, new, resume, fork) the extension reads
  the model registry and registers one Pi virtual model per eligible base model.
  The sync is idempotent and unregisters only variants it registered whose base
  model has disappeared.
- A variant mirrors its base model's name (suffixed ` (fast)`), thinking levels,
  context window, max tokens and input types.
- Pi calls the variant's `route()` for each agent-loop request. It resolves the
  base model from the registry at request time and returns it with the requested
  thinking level (clamped to what the base supports). A missing base model raises
  a clear error.
- Routes for reasons `user`, `continuation` and `retry` arm a one-shot token. The
  next `before_provider_request` adds `service_tier: "priority"` to a shallow copy
  of the payload only when `payload.model` equals the routed base id. Any payload
  consumes the token, so a stale token never grants priority to a later request.
- When priority is applied, a one-shot pricing marker corrects the next matching
  Codex assistant message's displayed cost to priority pricing (×2, or ×2.5 for
  exactly `gpt-5.5`). Already-priced usage is left unchanged. Any new route or
  assistant message clears the marker; the original message is never mutated.
- OpenAI API pricing follows the service tier the server reports; the extension
  does not adjust `openai-responses` usage costs.
- The extension never calls `registerProvider`; existing providers, catalogs, oauth
  and model refresh callbacks are untouched.

## Limits

- Models are discovered dynamically; there is no allowlist or configuration.
- `direct` requests (compaction summaries, extension calls) and requests for other
  models chosen by other packages (for example a compaction-model package) keep the
  standard tier, even when they use the same base model.
- Fast variants and Codex cost correction also work in `pi-subagents` children
  when this package is enabled for lifecycle passthrough.
- Priority entitlement and latency are decided by the provider. An unsupported tier
  surfaces as a normal provider error.
- Models whose id already ends in `-fast`, and bases whose `-fast` id would collide
  with an existing physical model, get no variant.

## Development

From the workspace root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @thoth-agents/pi-openai-fast run typecheck
pnpm --filter @thoth-agents/pi-openai-fast run test
```

## Credits

The idea of a priority-tier fast model for Codex is inspired by
[`2h2d-co/pi-openai-codex-fast`](https://github.com/2h2d-co/pi-openai-codex-fast)
(MIT, commit `b2258b0bc9e2c03fd40d51143530882917aabb00`). This package is a new
implementation, not a fork, and uses Pi virtual models instead of a separate
provider.

## License

MIT
