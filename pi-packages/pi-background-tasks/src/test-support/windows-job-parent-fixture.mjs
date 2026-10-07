import { spawn } from 'node:child_process';
const helper = spawn(process.argv[2], ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-File', process.argv[3], '-ParentPid', String(process.pid), '-TestFaults'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
process.stdin.pipe(helper.stdin);
helper.stdout.pipe(process.stdout);
helper.stderr.pipe(process.stderr);
helper.on('error', error => { console.error(error); process.exit(1); });
