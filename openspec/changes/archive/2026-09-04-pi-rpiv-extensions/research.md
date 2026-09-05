# Frozen upstream contracts

Preflight research completed before SDD implementation; no further network is needed.

## Exact packages

All three pins are 2.9.0 (registry latest and exact tarball manifests matched; publication 2026-09-01).
- https://registry.npmjs.org/@juicesharp%2Frpiv-ask-user-question
- https://registry.npmjs.org/@juicesharp%2Frpiv-todo
- https://registry.npmjs.org/@juicesharp%2Frpiv-web-tools

Read-only extracted snapshots: C:/Users/EremesNG/AppData/Local/Temp/rpiv-contracts-cc8e26118a59494cbf0832104049927b/{_juicesharp_rpiv_ask_user_question,_juicesharp_rpiv_todo,_juicesharp_rpiv_web_tools}/package.
Snapshots are verification inputs only, not repository dependencies or vendored assets.
All have pi.extensions ["./index.ts"], wildcard Pi peers, and no engines field. Ask documents Node 22+; exact host compatibility needs local evidence.

## Question contract

Tool: ask_user_question, not ask_user.
Input: questions (1-4); each question has question/header and 2-4 options with label/description and optional preview; optional multiSelect. Typed free text is always present.
Output: details.answers, cancelled, optional globalNote/error codes. Escape/dismissal gives cancelled true and "User declined to answer questions"; partial submit can omit answers.
TTY supports TUI; RPC/ACP require host select/input. Noninteractive hosts remove the tool; handler has no_ui backstop.
No credential required. Optional rpiv-i18n.
Sources:
- https://github.com/juicesharp/rpiv-mono/blob/main/packages/rpiv-ask-user-question/docs/tool-schema.md
- https://github.com/juicesharp/rpiv-mono/blob/main/packages/rpiv-ask-user-question/docs/hosts.md

## Todo contract

Tool todo; actions create/update/list/get/delete/clear. Fields subject, description, activeForm, owner, metadata, status, blockedBy/addBlockedBy/removeBlockedBy/includeDeleted.
State is Pi-session/conversation-branch snapshots; reload/compaction replay, no separate disk store. Headless retains tools without panel.
Decision: root alone maintains the user-facing list; children report progress and blockers. No thoth scheduler, shared child state, or canonical OpenSpec mirroring.
Source: https://github.com/juicesharp/rpiv-mono/blob/main/packages/rpiv-todo/docs/tool-schema.md

## Web contract

web_search: query, optional max_results 1..10 and provider.
web_fetch: url, optional raw boolean; HTTP(S).
Search providers: brave/tavily/serper/exa/youcom/jina/firecrawl/perplexity/searxng/ollama. Search requires configured provider credentials or a reachable suitable local provider. Credential-free fetch exists on selected direct HTTP/text paths; no blanket credential-free search claim.
Fetch limits 2000 lines/50 KB with overflow in temporary file. Host checks are not comprehensive DNS/redirect SSRF protection; do not label tools sandboxed.
Decision: root and librarian may use these additive tools; no credential/provider configuration changes, existing research stack remains.
Sources:
- https://github.com/juicesharp/rpiv-mono/blob/main/packages/rpiv-web-tools/docs/tools.md
- https://github.com/juicesharp/rpiv-mono/blob/main/packages/rpiv-web-tools/docs/providers.md

## Evidence limits

Exact source/metadata inspected; no live interactive answer, task panel, or credentialed web request was observed. SC-005 must distinguish local contract checks from real user/provider outcomes.

