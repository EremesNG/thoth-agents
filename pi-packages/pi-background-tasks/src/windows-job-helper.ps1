# Persistent UTF-8 JSON-lines host. One Add-Type per helper process.
param([Parameter(Mandatory=$true)][int]$ParentPid, [switch]$TestFaults)
$ErrorActionPreference = 'Stop'
if (-not (($PSVersionTable.PSEdition -eq 'Core' -and $PSVersionTable.PSVersion.Major -ge 7) -or ($PSVersionTable.PSEdition -eq 'Desktop' -and $PSVersionTable.PSVersion.Major -eq 5 -and $PSVersionTable.PSVersion.Minor -eq 1))) { throw 'PowerShell 7+ or Windows PowerShell 5.1 is required.' }
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -Path (Join-Path $PSScriptRoot 'windows-job-helper.cs')
[WindowsJobPrototype]::WatchParent($ParentPid)
[Console]::WriteLine((@{ event = 'ready'; pid = $PID; parentPid = $ParentPid } | ConvertTo-Json -Compress))
$terminationFaults = @{}
$responseFaults = @{}
# Convert JSON objects recursively, including env and test fault dictionaries.
# ConvertFrom-Json -AsHashtable is unavailable on Windows PowerShell 5.1.
function ConvertTo-Hashtable($value) {
    if ($value -is [System.Management.Automation.PSCustomObject]) {
        $table = @{}
        foreach ($property in $value.PSObject.Properties) { $table[$property.Name] = ConvertTo-Hashtable $property.Value }
        return $table
    }
    if ($value -is [array]) {
        $items = @($value | ForEach-Object { ConvertTo-Hashtable $_ })
        return ,$items
    }
    return $value
}
try {
    while ($null -ne ($line = [Console]::ReadLine())) {
        $request = $null
        try {
            $request = ConvertTo-Hashtable (ConvertFrom-Json -InputObject $line)
            # Private test clients can withhold one response without blocking unrelated jobs.
            if ($TestFaults -and $request.op -eq 'terminate' -and $terminationFaults.ContainsKey($request.key)) {
                $fault = $terminationFaults[$request.key]
                $terminationFaults.Remove($request.key)
                if ($fault -eq 'malformed') { [Console]::WriteLine('{invalid-json') }
                if ($fault -eq 'protocol-error') { [Console]::WriteLine((@{ id = $request.id; error = 'invalid protocol: injected response error' } | ConvertTo-Json -Compress)) }
                continue
            }
            $result = switch ($request.op) {
                'launch' {
                    if ($TestFaults -and $request.terminationFault) { $terminationFaults[$request.key] = $request.terminationFault }
                    if ($TestFaults -and $request.responseFaults) { $responseFaults[$request.key] = $request.responseFaults }
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
            if ($cause.Data.Contains('errorCode')) { $response.errorCode = $cause.Data['errorCode'] }
            if ($cause.Data.Contains('failedPid')) { $response.failedPid = $cause.Data['failedPid']; $response.neverResumed = $cause.Data['neverResumed'] }
        }
        # Lose an acknowledgment AFTER the operation (including handle release).
        # Faults are one-shot and available only to explicitly private test helpers.
        if ($TestFaults -and $responseFaults.ContainsKey($request.key) -and $responseFaults[$request.key].ContainsKey($request.op)) {
            $fault = $responseFaults[$request.key][$request.op]
            $responseFaults[$request.key].Remove($request.op)
            if ($responseFaults[$request.key].Count -eq 0) { $responseFaults.Remove($request.key) }
            if ($fault -eq 'malformed') { [Console]::WriteLine('{invalid-json') }
            if ($fault -eq 'schema') { [Console]::WriteLine((@{ id = $request.id; activeProcesses = 0 } | ConvertTo-Json -Compress)) }
            if ($fault -eq 'protocol-error') { [Console]::WriteLine((@{ id = $request.id; error = 'invalid protocol: injected response error' } | ConvertTo-Json -Compress)) }
            continue
        }
        [Console]::WriteLine(($response | ConvertTo-Json -Depth 8 -Compress))
    }
} finally { [WindowsJobPrototype]::Close() }
