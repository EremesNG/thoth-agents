import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function getLogFile(): string {
  const os = require('node:os') as typeof import('node:os');
  const path = require('node:path') as typeof import('node:path');
  const configuredPath = process.env.THOTH_AGENTS_LOG_FILE?.trim();

  return configuredPath || path.join(os.tmpdir(), 'thoth-agents.log');
}

export function log(message: string, data?: unknown): void {
  try {
    const fs = require('node:fs') as typeof import('node:fs');
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message} ${data ? JSON.stringify(data) : ''}\n`;
    fs.appendFileSync(getLogFile(), logEntry);
  } catch {
    // Silently ignore logging errors
  }
}
