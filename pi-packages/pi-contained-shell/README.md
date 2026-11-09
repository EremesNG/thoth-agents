# Pi contained shell

On Windows, replaces Pi's `bash` and `powershell` tools with their SDK definitions backed by pi-core Windows Job Objects. Other platforms register nothing.

Each command owns one job. Abort, timeout, and normal shell exit terminate all descendants; stdout and stderr drain before a running command settles, and shell exit codes are preserved. Persistent work belongs in background tasks.

Timeout includes launcher startup. Cancellation while startup is pending rejects promptly, retains ownership of the pending launch, and terminates/releases any late job without feeding a stdin command or delivering late output. Session startup asynchronously warms the launcher.

If the launcher is unavailable, execution delegates to the SDK's default operations with the remaining timeout and warns once per session. This fallback does **not** guarantee descendant containment.

PowerShell uses the public SDK shell resolver and a pinned copy of its UTF-8 initialization prefix. Both definitions are published through the pi-core registry and do not register renderers.

## Development

- `pnpm --filter @thoth-agents/pi-contained-shell typecheck`
- `pnpm --filter @thoth-agents/pi-contained-shell test`

Windows integration tests require Git Bash, PowerShell, and an operational Windows job launcher. They query `Win32_Process` with unique numeric markers; cleanup targets only PIDs still bearing that exact marker, never parent-PID walks or process names.

The bundled extension must include pi-core's `launcher.ps1` and `launcher.cs` beside its bundle. That asset location gives this separately bundled consumer its own helper, isolated from other consumers. Workspace source imports share pi-core's source helper, so source-level tests are not evidence of bundled consumer isolation.
