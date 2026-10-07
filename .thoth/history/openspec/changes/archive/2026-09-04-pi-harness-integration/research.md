# Research: Pi Harness Integration

## Decision summary

thoth-agents will deliver Pi as a native fourth harness on
`@earendil-works/pi-coding-agent` `0.84.4` with Node.js `>=22.19`. Delegation
uses `pi-subagents-j0k3r@1.5.9`; research is deliberately hybrid:

- Context7 is native through `@upstash/context7-pi@0.1.2`.
- Exa is native through `@feniix/pi-exa@5.1.1`.
- grep.app is the only MCP-backed research provider, through
  `pi-mcp-adapter@2.32.1` and `https://mcp.grep.app`.
- thoth-mem remains an independent provider and owns `thoth-mem setup pi`.

The CLI owns installation, attributable files/configuration, diagnostics, and
its completion ledger. It does not own Pi's executor, package lifecycle,
provider credentials, research services, or memory runtime.

## Local baseline and reference implementations

The installed `pi` resolves to `@earendil-works/pi-coding-agent` `0.84.4`, whose
manifest requires Node.js `>=22.19.0`; `pi list` reported no installed packages
at exploration time. Pi's documented package manager supports global and local
packages, extensions, skills, prompts, settings, trust, and JSON/RPC modes.

`gentle-ai` confirms a viable composition of Pi packages and
`pi-subagents-j0k3r`, but its Gentle-specific runtime and memory packages are not
reused. `agentmemory` demonstrates that Pi can host a native memory extension,
hooks, and external service transport; thoth-agents does not adopt those assets
because thoth-mem owns the future Pi provider surface.

Sources: [Pi packages](https://pi.dev/docs/latest/packages),
[extensions](https://pi.dev/docs/latest/extensions),
[settings](https://pi.dev/docs/latest/settings),
[Windows](https://pi.dev/docs/latest/windows), and
[repository](https://github.com/earendil-works/pi).

## Delegation contract

`pi-subagents-j0k3r@1.5.9` is selected because it supplies Pi-native nested
sessions and public single-agent tools without requiring thoth-agents to build
an executor. Canonical roles are discovered from Pi agent-definition folders;
the root remains ambient and only the six specialists are materialized.

The stable surface is `subagent_run` with one explicit `agent`, plus status,
result, list, message, and cancel operations. Default concurrency is five tasks
per working directory. Live steering depends on a sufficiently new Pi SDK;
continuation is configuration-gated and remains disabled by default. A queued
message and a nonterminal status are not fan-in evidence. Tool allowlists are
role controls, not OS or credential sandboxes.

The upstream release/tag says `1.5.9`, while the tagged package manifest reports
`1.0.0`; installation and status therefore cannot use that manifest field as
their sole version proof.

Sources: [package catalog](https://pi.dev/packages/pi-subagents-j0k3r),
[release 1.5.9](https://github.com/j0k3r-dev-rgl/pi-subagents-j0k3r/releases/tag/v1.5.9),
and [tagged README](https://raw.githubusercontent.com/j0k3r-dev-rgl/pi-subagents-j0k3r/v1.5.9/README.md).

## Skill installation

The canonical `skills` CLI supports Pi through `--agent pi`. Global copied
materialization targets `~/.pi/agent/skills`, so the four mandatory external
skills use `--global --yes --copy`; the five thoth-owned workflow skills are
synchronized directly from this package. When `PI_CODING_AGENT_DIR` redirects
Pi, the skills CLI's default destination can differ from Pi's actual discovery
root, so installation must stop with a manual action instead of claiming
success.

Source: [Vercel skills CLI 1.5.23](https://github.com/vercel-labs/skills/tree/v1.5.23).

## Research-provider selection

| Provider | Selected contract | Why | Operational condition |
| --- | --- | --- | --- |
| Context7 | `pi install npm:@upstash/context7-pi@0.1.2` | Official native Pi extension, direct REST client, narrow two-tool surface | No MCP adapter; report network/provider failures separately |
| Exa | `pi install npm:@feniix/pi-exa@5.1.1` | Native Pi extension with broader search, fetch, research, answer, similar, and planning surface plus explicit Node `>=22.19.0` support | Exa retrieval tools require operator-owned `EXA_API_KEY`; never solicit or copy it |
| grep.app | `pi install npm:pi-mcp-adapter@2.32.1` plus the managed global server entry below | Official service is a remote MCP endpoint and Pi intentionally has no generic native MCP client | Anonymous network service; preserve proxy-only exposure and diagnose reachability/schema drift |

Sources: [Context7 Pi package](https://github.com/upstash/context7/tree/master/packages/pi),
[Feniix Exa package](https://github.com/feniix/pi-extensions/tree/main/packages/pi-exa),
[Pi MCP adapter 2.32.1](https://github.com/nicobailon/pi-mcp-adapter/tree/v2.32.1),
and [official grep.app MCP announcement](https://vercel.com/blog/grep-a-million-github-repositories-via-mcp).

### grep.app managed contract

The global `~/.config/mcp/mcp.json` entry is:

```json
{
  "mcpServers": {
    "grep": {
      "url": "https://mcp.grep.app",
      "protocolVersion": "legacy",
      "lifecycle": "lazy"
    }
  }
}
```

The official endpoint uses Streamable HTTP at its root; `/sse` is not a valid
substitute. It currently exposes `searchGitHub` anonymously. `directTools` is
omitted so schema changes remain behind the adapter's `mcp` proxy. Installation
adds only `mcpServers.grep`, preserves every unrelated server/top-level field,
is idempotent for the same definition, and fails on a different existing
definition. Project-local `.mcp.json` or `.pi/mcp.json` can shadow the global
entry and must be reported by status rather than overwritten.

Status verifies package presence and the attributable configuration separately
from an optional live connect/list-tools probe. Remote `404`, `429`, `5xx`,
timeouts, or a missing/changed `searchGitHub` schema are degraded provider
states, not proof that the managed installation vanished.

Sources: [adapter README 2.32.1](https://raw.githubusercontent.com/nicobailon/pi-mcp-adapter/v2.32.1/README.md)
and [configuration precedence](https://raw.githubusercontent.com/nicobailon/pi-mcp-adapter/v2.32.1/config.ts).

## Rejected and fallback alternatives

`@benvargas/pi-exa-mcp@1.2.0` is an autonomous Pi extension with its own hosted
MCP client, so it would not need `pi-mcp-adapter`. It is retained only as a
documented fallback: it exposes two tools, depends on the hosted MCP endpoint,
does not declare a Node engine, and includes `get_code_context_exa`, which has
diverged from Exa's current default MCP surface. It must not be installed beside
the selected Exa extension as managed complete state.

`pi-exa@0.6.1` and `pi-exa-search-api@2.0.1` were also rejected as defaults due
to lower operational maturity or narrower credential-bound contracts.

Sources: [Ben Vargas manifest](https://github.com/ben-vargas/pi-packages/blob/main/packages/pi-exa-mcp/package.json),
[source](https://raw.githubusercontent.com/ben-vargas/pi-packages/main/packages/pi-exa-mcp/extensions/index.ts),
[Exa MCP documentation](https://exa.ai/docs/reference/exa-mcp),
[junnjiee/pi-exa](https://github.com/junnjiee/pi-exa), and
[pi-exa-search-api](https://github.com/william-wei-zhu/pi-exa-search-api).

## Security and reliability consequences

- Every Pi extension executes with the invoking user's system permissions and
  can access process credentials and the network. Package pins reduce drift but
  are not a sandbox or trust guarantee.
- Exa credentials remain operator-owned environment state. grep.app currently
  needs no token; the managed entry must not add headers, bearer tokens, or
  OAuth configuration without a later explicit contract.
- grep.app results are untrusted public-repository text and must be treated as
  data rather than instructions. Its terms and service availability prohibit
  promising bulk or continuous scraping.
- Complete install/update is fail-closed across owned steps, but status reports
  package/configuration health independently from live provider health so a
  network outage cannot corrupt or erase the CLI ledger.

## Verification implications

Tests need isolated Pi homes and injected command/filesystem boundaries. They
must cover dry-run non-mutation; ordered pinned package commands; attributable
root, specialist, skill, and MCP writes; conflicts and shadowing; package and
schema drift; credential-required and remote-unreachable states; provider setup
evidence; and ledger advancement only after every required managed step passes.

A Windows smoke test against Pi `0.84.4` should prove package/resource discovery,
one foreground and one background specialist lifecycle, the two Context7 tools,
the selected Exa tool registration, and adapter-backed `searchGitHub`. External
credential or service blockers remain explicit residual evidence rather than
mocked success.
