import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const KEY=Symbol.for('thoth-agents.background-tasks.pwsh-discovery.v1');
const global=globalThis as typeof globalThis & {[KEY]?:Map<string,string>};
const flags=['-NoProfile','-NonInteractive','-WindowStyle','Hidden'];
const validation="[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); @{edition=$PSVersionTable.PSEdition;major=$PSVersionTable.PSVersion.Major}|ConvertTo-Json -Compress";

/** Trusted shell discovery only; user commands always launch inside the Job Object. */
export function resolvePowerShell():string {
  const override=process.env.PI_BACKGROUND_TASKS_PWSH;
  const key=JSON.stringify([override,process.env.PATH,process.env.ProgramFiles,process.env.LOCALAPPDATA]);
  const cache=global[KEY] ??= new Map();const cached=cache.get(key);if(cached)return cached;
  const candidates:string[]=[];
  if(override)candidates.push(override);
  else {
    const where=spawnSync(join(process.env.SystemRoot || 'C:/Windows','System32','where.exe'),['pwsh.exe'],{windowsHide:true,encoding:'utf8',timeout:5000});
    if(where.status===0)candidates.push(...String(where.stdout || '').split(/\r?\n/).map(line=>line.trim()).filter(Boolean));
    const standard=[join(process.env.ProgramFiles || 'C:/Program Files','PowerShell','7','pwsh.exe'),
      ...(process.env.LOCALAPPDATA?[join(process.env.LOCALAPPDATA,'Microsoft','WindowsApps','pwsh.exe')]:[])];
    candidates.push(...standard.filter(existsSync));
  }
  const reasons:string[]=[];
  for(const executable of new Set(candidates)) {
    const check=spawnSync(executable,[...flags,'-EncodedCommand',Buffer.from(validation,'utf16le').toString('base64')],{windowsHide:true,encoding:'utf8',timeout:5000});
    try {
      const version=JSON.parse(String(check.stdout).trim());
      if(check.status===0&&version.edition==='Core'&&Number.isInteger(version.major)&&version.major>=7){cache.set(key,executable);return executable;}
      reasons.push(`${executable}: requires Core edition major >=7`);
    }catch{reasons.push(`${executable}: ${check.error?.message || String(check.stderr || 'validation failed').trim()}`);}
  }
  throw new Error(`PowerShell Core 7+ is required for Windows background tasks. Install PowerShell 7 and set PI_BACKGROUND_TASKS_PWSH to its pwsh.exe path. ${reasons.join('; ')}`);
}

/** UTF-16LE encoded source avoids cmdline quote/newline/Unicode transformations. */
export function powerShellArguments(command:string):string[] {
  const script=`[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$global:LASTEXITCODE = 0
$ErrorActionPreference = 'Stop'
try {
  & {
${command}
  }
  $commandSucceeded = $?
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  if (-not $commandSucceeded) { exit 1 }
  exit 0
} catch {
  [Console]::Error.WriteLine(($_ | Out-String))
  exit 1
}
`;
  return [...flags,'-OutputFormat','Text','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')];
}
