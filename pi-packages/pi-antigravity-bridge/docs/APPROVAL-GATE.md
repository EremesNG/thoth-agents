# Approval gate (agy native tools)

agy is not a plain model: it runs its own agent loop with its own native tools (`run_command`, `create_file`, `edit_file`, ...). Those calls execute inside agy with no pi involvement, so pi's permission extensions never saw them. The approval gate closes that gap: agy native tool calls pass through a pi-side approval in a form the existing permission-extension ecosystem gates with zero changes.

Mechanics: the extension delivers an owned `PreToolUse` hook group to this session's agy only. On stream-json it stages `.agents/hooks.json` in the session-private bridge dir (the per-pid directory passed as an extra `--add-dir`; live-probed on agy 1.5.13: a hook denial there is honored and the target file stays absent). On ACP it merges the group into the private staged home's `config/hooks.json` (foreign groups preserved, removed with the home). Because only this session's agy receives either location, standalone IDE or CLI sessions in the same workspace never load the gate: their tool calls cannot be denied while pi is idle, and cannot be parked into a live pi turn (issue #5 isolation). The group matches EVERY native tool (`.*`) and the gate is allow-by-exception (see below). The hook script (generated, per-pid, mode 0600 because it embeds the bridge token) reads the hook payload, decides locally for allowlisted and MCP calls, and otherwise POSTs the call to the bridge and polls for a decision. The bridge parks it, the provider interrupts the pi-side view of the agy turn with a `toolUse` for a SHADOW tool named `bash`/`write`/`edit` (same schema as the real builtin plus internal `__agy*` marker fields), or `agy_native_approval` for tools with no known target (below), and pi's whole `tool_call` surface applies: any installed permission extension gates the call unchanged, and only if nothing blocks does the fallback policy run. The decision travels back to the hook and agy enforces it; on deny the reason text is what agy's model sees. Marker calls never execute locally (a ticket check denies forged ones); non-marker calls delegate to a factory twin of the real builtin, so normal pi bash/write/edit behavior is unchanged. Every decision lands in the daily log with tool names, source, and latency.

## Allow-by-exception

Only these pass without Pi approval:

- a read-only allowlist of agy native tools (`src/native-tool-policy.ts`, derived from the agy 1.5.13 stream-json `init` tool inventory, plus `read_file`, which the live ACP probe showed ACP uses; ACP exposes a different native inventory than stream-json): `read_file`, `view_file`, `list_dir`, `grep_search`, `find_by_name`, `read_url_content`, `search_web`, `command_status`, `wait`, `wait_5_seconds`, `finish`, `list_resources`, `read_resource`, `list_permissions`, `list_plugin_accounts`, `list_browser_pages`, `read_browser_page`, `capture_browser_console_logs`, `browser_get_dom`, `browser_get_network_request`, `browser_list_network_requests`. New agy tools fail safe: they cost an extra approval until added;
- MCP calls with positive payload evidence: the native `call_mcp_tool` wrapper carrying a server argument, or this bridge's qualified `mcp_<server>_<tool>` name. The live ACP hook payload (agy 1.5.13) is `toolCall: { name: "call_mcp_tool", args: { ServerName, ToolName, Arguments } }`; `server_name`, `serverName` and `server` (stream-json step records) are also recognized. A call without that evidence is not treated as MCP and needs approval;
- `run_command`, only while the separate headless guard is verified-delivered (next section).

Write and edit targets must be absolute: drive or POSIX paths, or a complete UNC path (`\servershare...`); server-only UNC forms are denied. The approval view for an unknown tool is a bounded, scrollable component (arrow/PgUp/PgDn/Home/End) over the complete tool name and arguments as escaped JSON, never a truncated view. Spaces and non-ASCII characters appear as `\uXXXX` escapes, and the display hard-wraps without discarding characters or collapsing whitespace. It fails closed: the selection starts on No, Yes stays locked until every row of the arguments has actually been rendered in view at the current width (jumping with End, or resizing, does not count rows that were never shown), and Enter confirms the current selection (default deny). Esc, `n`, timeout or any UI error deny. bash/write/edit approvals keep the standard confirm.

Everything else, including `write_file`, `sed_file`, `notebook_edit` and any unknown future tool, requires approval.

The bridge applies its 1,000,000-byte request limit before decoding UTF-8. Characters split across HTTP chunks are preserved in paths and arguments. Malformed UTF-8 is rejected without parking an approval. The MCP endpoint uses the same byte limit and decoding.

Known write/edit tools (`create_file`, `write_to_file`, `write_file`, `replace_file_content`, `edit_file`, `multi_replace_file_content`) map both the agy 1.5.11 shapes (`Path`/`Content`, `Path`/`Target`/`Replacement`) and the legacy fields (`TargetFile`, `CodeContent`, `SearchText`, `ReplacementContent`). The observed live ACP shapes `write_file {Content, Overwrite, Path}` and `edit_file {Path, Target, Replacement}` map the same way. They are approved only against an absolute target path taken verbatim from the arguments, which is the path agy will mutate. A relative, missing, blank, conflicting or unresolvable target, and an edit with no change information (empty multi-edit), is denied; the bridge never resolves a target against a guessed base directory. Tools without a known target shape are presented through the production `agy_native_approval` shadow, whose schema carries only the raw tool name and arguments (no fabricated path or command); its declaration is hidden from provider requests and it is never bridged back to agy. The Pi decision, allow or deny, returns to agy.

## `run_command` routing

`run_command` is owned by the separate non-interactive guard (`runCommandGuard`) when it is active. With the gate enabled the guard is delivered in the same location as the edit gate (ACP private home; stream-json bridge dir) and verified in the same pre-dispatch check:

- guard verified: the edit gate passes `run_command` and the guard hook denies it with the Pi bash redirect;
- guard expected but missing or unusable: the edit gate itself denies `run_command` with the same redirect, independent of `approvals.mode` (including `allow`);
- guard intentionally inactive (for example `tui` sessions or no active `bash`): `run_command` requires Pi approval like any other non-allowlisted tool.

Gate mode is resolved once at startup and used for approval wiring, hook staging and verification. A configuration change during startup takes effect on the next startup, not in the current bridge instance.

When an ACP turn reaches an otherwise successful end without model text after a verified native tool failure, the terminal diagnostic names the tool (or uses a generic label for an unsafe identifier) and directs you to the agy conversation transcript (`.system_generated/logs/transcript_full.jsonl` under that conversation's state directory). The diagnostic never includes agy's free-form failure text.

With the gate off, the guard keeps its previous delivery (hooks-only `--add-dir` on ACP, bridge dir on stream-json).

## Delivery verification and refusals

Gate intent is latched from configuration at bridge start, before any staging. With the gate enabled, no turn is dispatched on either carrier until the owned group is read back from the delivery location and verified: the group matches what this instance wrote, and the instance-owned handler script it references exists, is readable and has the expected content. The check runs twice: before startup work and again immediately before the prompt write (after async session/startup work), refreshing the `run_command` guard exemption; a failed check refuses the turn with a visible error before any prompt is sent. Refusal cases: gate staging failure, an unavailable bridge, `bridgeTools: "none"` (the gate cannot work without the bridge; the turn is refused instead of running ungated), a missing or malformed owned group, a missing or mismatched handler, and, on ACP, the `AGY_AGENTS_ROOT` legacy override, which bypasses private home staging and so cannot deliver the group. Stream-json home-staging failure keeps its additive-configuration fallback, because gate delivery there uses the bridge `--add-dir` and is verified independently. A guard-only staging failure at startup is tolerated only with the gate enabled (the gate then denies `run_command` with the Pi bash redirect); with the gate off it fails startup visibly. With the gate off, none of this applies.

## Handler deadline and the crash/kill residual

A hook that outlives agy's declared `timeout` soft-passes upstream, so the handler owns one overall deadline (park budget + 20s, always at least 30s below the declared timeout) covering stdin reading and every bridge wait. It forwards a valid Pi decision (allow or deny) that arrives in time and otherwise prints a deny: on any failure, a malformed reply, an unreachable bridge or an expired deadline. Known limitation: if the hook process crashes or is killed before it writes a verdict, agy may soft-pass that call; this residual is accepted and cannot be covered from inside the handler.

Upgrades from 1.6.x: that line staged the gate group into the shared workspace `.agents/hooks.json`, where standalone sessions loaded it. On model-gated bridge startup (first Antigravity use), the extension sweeps gate groups left in the workspace file by sessions whose pid is dead; groups of live sessions and foreign groups are never touched.

Configuration (`/agy` config keys or environment):

```jsonc
{
  "approvals": {
    "gateMode": "auto",  // auto | shadow | dedicated | off
    "mode": "ask"        // ask | allow | deny  (fallback when no extension gates)
  }
}
// env: AGY_APPROVALS=shadow AGY_APPROVALS_MODE=ask
```

`auto` (default) keeps the gate OFF until one of the known pi permission packages is detected (pi settings `packages` name-match or known config markers). `shadow` forces it on; `off` forces it off. `dedicated` currently stages the same shadow tools (the explicit `antigravity_approve` variant is planned; the config value is accepted today so the schema is stable). The fallback `mode` is consulted only when no extension blocked the call: `ask` shows a pi confirm dialog (headless runs deny, fail-closed), `allow` approves, `deny` blocks. Timeouts deny fail-closed: the staged hook timeout always exceeds the park budget and the handler deadline (see above), and the park answers first.

If you write your own gate extension, it sees a normal pi tool call:

```typescript
export default function (pi) {
	pi.on("tool_call", async (event) => {
		if (event.input?.__agyGate && event.input.command?.startsWith("rm ")) {
			return { block: true, reason: "rm is not allowed through the agy gate" };
		}
	});
}
```

Live end-to-end verification on ACP through the built bridge (a native write intercepted via the private-home hook, with a completed Pi denial) is tracked separately; see docs/TODO.md section 1.

Separately from the hook gate, on ACP the server also asks per-tool permission
itself via `session/request_permission`, and the bridge parks that request
on a real pi dialog (`approvals.mode` semantics apply; skip turns
auto-allow and never ask; `allow_always` choices are remembered per
connection). Wiring is pinned against a fake server; live verification is
tracked in docs/TODO.md section 3.
