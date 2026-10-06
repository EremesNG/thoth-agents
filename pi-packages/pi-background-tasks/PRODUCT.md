# Product scope

This owned fork provides session-origin-scoped local shell/process jobs, command watches, bounded logs, status/list/stop tools, completion and failure callbacks, and an interactive Work panel.

Command jobs declare `shell:"bash" | "powershell" | "none"`, defaulting to the same bash Pi resolves through its `shellPath` setting. PowerShell prefers Core 7+, with built-in Windows PowerShell 5.1 support on Windows (including the containment helper); POSIX supports pwsh only. The POSIX bash override and PowerShell override remain supported. Unsupported sh/WSL shells are rejected. Requested-shell unavailability is an immediate actionable error, never cross-shell fallback or command translation. `none` runs literal argv directly; boolean shell calls are removed.

Registration descriptions disclose paths, PowerShell edition/version and the 5.1 `&&`/`||` limitation. Spawn/watch results disclose the actual resolved shell in text and `details.shell`. PowerShell commands and parse errors use UTF-8; Git Bash output is captured. Every Windows shell/argv job keeps the existing assignment-before-resume Job Object containment, session ownership, reload handoff and verified teardown guarantees. Legacy persisted boolean metadata is normalized to preserve its original platform shell; unknown launch details stay unknown.

Pi loads the source-TypeScript extension directly. No LLM launching is provided by this package. See README.md for provenance, lifecycle implementation status, installation selection, and limits; docs/usage.md describes the tool contract.
