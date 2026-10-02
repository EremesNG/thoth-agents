# Persistent UTF-8 JSON-lines host. One Add-Type per helper process.
param([Parameter(Mandatory=$true)][int]$ParentPid, [switch]$TestFaults)
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSEdition -ne 'Core' -or $PSVersionTable.PSVersion.Major -lt 7) { throw 'PowerShell Core 7+ is required.' }
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -Path (Join-Path $PSScriptRoot 'windows-job-helper.cs')
[WindowsJobPrototype]::WatchParent($ParentPid)
[Console]::WriteLine((@{ event = 'ready'; pid = $PID; parentPid = $ParentPid } | ConvertTo-Json -Compress))
try {
    while ($null -ne ($line = [Console]::ReadLine())) {
        $request = $null
        try {
            $request = ConvertFrom-Json -InputObject $line -AsHashtable
            $result = switch ($request.op) {
                'launch' {
                    [string[]]$envBlock = @($request.env.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" })
                    [WindowsJobPrototype]::Launch($request.key, $request.executable, [string[]]$request.argv, $request.cwd, $envBlock, $request.log, ($TestFaults -and $request.denyAssignment), $request.stderrLog)
                }
                'query' { [WindowsJobPrototype]::Query($request.key) }
                'terminate' { [WindowsJobPrototype]::Terminate($request.key) }
                'release' { [WindowsJobPrototype]::Release($request.key) }
                default { throw "Unknown operation: $($request.op)" }
            }
            $response = @{ id = $request.id }
            foreach ($property in $result.PSObject.Properties) { $response[$property.Name] = $property.Value }
        } catch {
            $cause = $_.Exception.GetBaseException()
            $response = @{ id = $request.id; error = $_.Exception.ToString() }
            if ($cause.Data.Contains('failedPid')) { $response.failedPid = $cause.Data['failedPid']; $response.neverResumed = $cause.Data['neverResumed'] }
        }
        [Console]::WriteLine(($response | ConvertTo-Json -Depth 8 -Compress))
    }
} finally { [WindowsJobPrototype]::Close() }
