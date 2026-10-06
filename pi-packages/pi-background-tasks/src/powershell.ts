import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const flags = () => ['-NoProfile', '-NonInteractive', ...(process.platform === 'win32' ? ['-WindowStyle', 'Hidden'] : [])];
const validation = "[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); @{edition=$PSVersionTable.PSEdition;major=$PSVersionTable.PSVersion.Major;minor=$PSVersionTable.PSVersion.Minor;version=$PSVersionTable.PSVersion.ToString()}|ConvertTo-Json -Compress";

export interface PowerShellConfig { executable: string; args: string[]; edition: string; version: string }

/** Trusted shell discovery only; user commands always launch inside the Job Object. */
export function resolvePowerShellConfig(): PowerShellConfig {
  const windows = process.platform === 'win32';
  const override = process.env.PI_BACKGROUND_TASKS_PWSH;
  const candidates: string[] = [];
  if (override) candidates.push(override);
  else {
    const where = spawnSync(windows ? join(process.env.SystemRoot || 'C:/Windows', 'System32', 'where.exe') : 'which',
      [windows ? 'pwsh.exe' : 'pwsh'], { windowsHide: true, encoding: 'utf8', timeout: 5000 });
    if (where.status === 0) candidates.push(...String(where.stdout || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean));
    if (windows) {
      const standard = [join(process.env.ProgramFiles || 'C:/Program Files', 'PowerShell', '7', 'pwsh.exe'),
        ...(process.env.LOCALAPPDATA ? [join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'pwsh.exe')] : [])];
      candidates.push(...standard.filter(existsSync));
    }
  }
  if (windows) candidates.push(join(process.env.SystemRoot || 'C:/Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'));
  const reasons: string[] = [];
  for (const executable of new Set(candidates)) {
    const check = spawnSync(executable, [...flags(), '-EncodedCommand', Buffer.from(validation, 'utf16le').toString('base64')],
      { windowsHide: true, encoding: 'utf8', timeout: 5000 });
    try {
      const version = JSON.parse(String(check.stdout).trim());
      if (check.status === 0 && ((version.edition === 'Core' && Number.isInteger(version.major) && version.major >= 7)
        || (windows && version.edition === 'Desktop' && version.major === 5 && version.minor === 1))) {
        return { executable, args: flags(), edition: version.edition, version: version.version || `${version.major}.${version.minor || 0}` };
      }
      reasons.push(`${executable}: requires Core 7+${windows ? ' or Desktop 5.1' : ''}`);
    } catch { reasons.push(`${executable}: ${check.error?.message || String(check.stderr || 'validation failed').trim()}`); }
  }
  throw new Error(`PowerShell is unavailable. Install PowerShell 7 or set PI_BACKGROUND_TASKS_PWSH to a validated PowerShell executable. ${reasons.join('; ')}`);
}

export function resolvePowerShell(): string { return resolvePowerShellConfig().executable; }

/** UTF-16LE encoded source avoids cmdline quote/newline/Unicode transformations. */
export function powerShellArguments(command:string):string[] {
  const script=`[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$global:LASTEXITCODE = 0
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $source = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(command, 'utf8').toString('base64')}'))
  $userCommand = [ScriptBlock]::Create($source)
  & $userCommand
  $commandSucceeded = $?
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  if (-not $commandSucceeded) { exit 1 }
  exit 0
} catch {
  [Console]::Error.WriteLine(($_ | Out-String))
  exit 1
}
`;
  return [...flags(),'-OutputFormat','Text','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')];
}
