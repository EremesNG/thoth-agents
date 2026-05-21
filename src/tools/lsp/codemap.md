# src/tools/lsp/

## Responsibility

- Encapsulate a minimal LSP client stack so the CLI can ask language servers for definitions, references, diagnostics, and renames without managing subprocesses itself.
- Provide thin, documented tools (`lsp_goto_definition`, `lsp_find_references`, `lsp_diagnostics`, `lsp_rename`) that compose `withLspClient` helpers with exported plugin schema definitions (see `src/tools/lsp/tools.ts`).

## Design

- `LSPServerManager` in `src/tools/lsp/client.ts` is a singleton connection pool that keys clients by `<workspace-root>::<server-id>`, tracks reference counts, and evicts idle or dead processes.
- `LSPClient` wears responsibility for spawning the underlying language server (`bun.spawn`), wiring vscode-jsonrpc streams, maintaining opened documents, collecting diagnostics notifications, and gracefully shutting down/ restarting when needed.
- Utility helpers in `src/tools/lsp/utils.ts` keep formatting, severity mapping, diagnostic filtering, workspace root discovery, URI translation, and workspace-edit application consolidated; they also host `withLspClient`, which orchestrates server lookup, client acquisition/release, and retry messaging when initialization is still in progress.
- Constants/configuration (`src/tools/lsp/constants.ts`, `src/tools/lsp/config.ts`) define the supported servers, extension-to-language mappings, install hints, and runtime checks for whether the configured binaries exist, so the tools never start a missing server.
- Shared types from `src/tools/lsp/types.ts` mirror the vscode-languageserver-protocol definitions that both the client and tools consume.

## Flow

1. Tool execution (e.g., `lsp_find_references`) calls `withLspClient` with a file path; `withLspClient` resolves the extension using `findServerForExtension` and either throws an install/configuration error or proceeds.
2. `withLspClient` asks `lspManager` for a client tied to the workspace root; the manager either reuses an existing `LSPClient` or starts/initializes a new one, waiting on the init promise before handing it back, and increments the reference count.
3. `LSPClient` ensures the file is open via `textDocument/didOpen` (loading the text, waiting for the server) before sending requests such as `textDocument/definition`, `references`, `diagnostic`, or `rename`; diagnostics request also waits for pending `publishDiagnostics` notifications when the server cannot answer directly.
4. Responses flow back through `vscode-jsonrpc` and are formatted/filtered by `utils` (`formatLocation`, `filterDiagnosticsBySeverity`, `formatDiagnostic`, etc.), and in the rename path the returned `WorkspaceEdit` is applied locally, with results reported via `formatApplyResult`.
5. After the tool receives its answer, `withLspClient` releases the client reference; the manager later tears down idle clients or when the process exits.

## Integration

- `src/tools/lsp/index.ts` re-exports the manager and the defined tools/types so other pieces of the CLI can import the LSP surface without touching implementation details.
- Tools are wired into the plugin layer via `@opencode-ai/plugin/tool`; the exported `ToolDefinition` instances declare arguments, descriptions, and error formatting using helpers from `src/tools/lsp/utils.ts`.
- `client.ts` depends on `config.ts` and `constants.ts` for language IDs, server configuration, and install hints; `utils.ts` depends on the same modules for severity maps, `findServerForExtension`, and `lspManager`.
- External callers (e.g., command handlers) simply feed absolute paths and cursor positions into the exported tools; the module reports installation errors, server initialization delays, or successful results back through formatted strings so higher layers can relay them to the user.
