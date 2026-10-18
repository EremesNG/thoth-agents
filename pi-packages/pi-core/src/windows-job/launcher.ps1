param([Parameter(Mandatory=$true)][int]$ParentPid)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -Path (Join-Path $PSScriptRoot 'launcher.cs')
[ThothJobLauncher]::WatchParent($ParentPid)
function Send($value) { [ThothJobLauncher]::Emit(($value | ConvertTo-Json -Depth 8 -Compress)) }
Send @{ event = 'ready' }
try {
    while ($null -ne ($line = [Console]::ReadLine())) {
        $request = $null
        try {
            $request = ConvertFrom-Json -InputObject $line
            $response = @{ id = $request.id; ok = $true }
            switch ($request.op) {
                'launch' { $response.pipes = [ThothJobLauncher]::Prepare($request.key) }
                'start' {
                    [string[]]$envBlock = @($request.env.PSObject.Properties | Where-Object { $null -ne $_.Value } | ForEach-Object { "$($_.Name)=$($_.Value)" })
                    $response.pid = [ThothJobLauncher]::Start($request.key, $request.file, $request.command, $request.cwd, $envBlock)
                }
                'terminate' { [ThothJobLauncher]::Terminate($request.key, $request.timeoutMs) }
                'release' { [ThothJobLauncher]::Release($request.key) }
                default { throw 'Unknown operation' }
            }
        } catch {
            $cause = $_.Exception.GetBaseException()
            $response = @{ id = $request.id; error = $cause.ToString(); kind = 'unavailable' }
            if ($cause.Data.Contains('kind')) { $response.kind = $cause.Data['kind'] }
            if ($cause -is [ComponentModel.Win32Exception]) { $response.code = $cause.NativeErrorCode }
        }
        Send $response
    }
} finally { [ThothJobLauncher]::Close() }
