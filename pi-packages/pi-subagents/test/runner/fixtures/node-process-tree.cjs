const { spawn } = require('node:child_process');
const fs = require('node:fs');

// Both processes outlive the test's observation window, but cannot leak forever
// if setup fails before their PIDs are recorded.
setTimeout(() => process.exit(0), 120_000);

if (process.argv[2] === 'grandchild') {
  process.send(process.pid);
  process.disconnect();
} else {
  const pidFile = process.argv[2];
  const grandchild = spawn(process.execPath, [__filename, 'grandchild'], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  grandchild.once('error', (error) => {
    console.error(error);
    process.exit(1);
  });
  grandchild.once('message', (pid) => {
    // Publish only once the grandchild is executing, and never expose partial JSON.
    fs.writeFileSync(
      `${pidFile}.tmp`,
      JSON.stringify({ parent: process.pid, grandchild: pid }),
    );
    fs.renameSync(`${pidFile}.tmp`, pidFile);
  });
}
