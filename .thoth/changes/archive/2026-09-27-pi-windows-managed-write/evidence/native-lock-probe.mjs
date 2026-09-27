import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { writePiManagedText } = await import(
  pathToFileURL(resolve('src/cli/pi-managed-write.ts')).href
);
assert.equal(process.platform, 'win32');
const root = mkdtempSync(join(tmpdir(), 'thoth-native-rename-lock-'));
const quote = (text) => `'${text.replaceAll("'", "''")}'`;
try {
  for (const [name, holdMs] of [
    ['released', 400],
    ['persistent', 1800],
  ]) {
    const target = join(root, `${name}.json`);
    writeFileSync(target, 'original');
    const script = `$h=[System.IO.File]::Open(${quote(target)},[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::ReadWrite);try { [Console]::WriteLine('LOCKED'); [System.Threading.Thread]::Sleep(${holdMs}) } finally { $h.Dispose() }`;
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64'),
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const exited = new Promise((resolveExit, reject) => {
      child.once('error', reject);
      child.once('exit', (code) =>
        code === 0
          ? resolveExit()
          : reject(new Error(`Lock holder exited ${code}`)),
      );
    });
    await new Promise((ready, reject) => {
      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
        if (output.includes('LOCKED')) ready();
      });
      child.once('error', reject);
      child.once('exit', () =>
        reject(new Error('Lock holder exited before readiness')),
      );
    });
    const start = performance.now();
    if (name === 'released') {
      assert.equal(writePiManagedText(target, 'replacement'), true);
      assert.equal(readFileSync(target, 'utf8'), 'replacement');
    } else {
      assert.throws(
        () => writePiManagedText(target, 'replacement'),
        /after bounded retries/,
      );
      assert.equal(readFileSync(target, 'utf8'), 'original');
    }
    const elapsedMs = Math.round(performance.now() - start);
    assert.ok(
      elapsedMs >= 100,
      'Probe must encounter the held lock, not run after release',
    );
    assert.ok(!readdirSync(root).some((entry) => entry.includes('.tmp-')));
    await exited;
    console.log(JSON.stringify({ name, holdMs, elapsedMs, passed: true }));
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
