// Manual post-probe audit only; never imported by production or used as ownership authority.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const command = `Get-CimInstance Win32_Process | Where-Object {
 ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'bg-contained-.*grand[.]cjs') -or
 ($_.Name -eq 'pwsh.exe' -and $_.CommandLine -match 'pi-background-tasks.*windows-job-helper[.]ps1')
} | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress`;
const child=spawn(process.env.PWSH_PATH || 'C:/Program Files/PowerShell/7/pwsh.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',command],{windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.pipe(process.stderr);
const [code]=await once(child,'exit');if(code)process.exitCode=code;
console.log(output.trim() || 'No surviving probe grandchildren or package helpers.');
