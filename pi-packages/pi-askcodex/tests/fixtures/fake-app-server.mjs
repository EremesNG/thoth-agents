import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createInterface } from 'node:readline';

const scenario = process.env.FAKE_SCENARIO ?? 'normal';
const send = (message) =>
  process.stdout.write(`${JSON.stringify(message)}\r\n`);
const turn = (status = 'inProgress') => ({
  id: 'turn-1',
  rootTurnId: null,
  items: [],
  itemsView: 'full',
  status,
  error: null,
  startedAt: null,
  completedAt: null,
  durationMs: null,
});
const complete = (status = 'completed') =>
  send({
    method: 'turn/completed',
    params: { threadId: 'thread-1', turn: turn(status) },
  });
let initialized = false;
let threadRequest;
createInterface({ input: process.stdin }).on('line', (line) => {
  const m = JSON.parse(line);
  if (process.env.FAKE_TRACE)
    fs.appendFileSync(process.env.FAKE_TRACE, `${line}\n`);
  if (m.method === 'initialized') {
    initialized = true;
    return;
  }
  if (m.method === 'initialize') {
    if (scenario.startsWith('persistent-descendant')) {
      const child = spawn(
        process.execPath,
        ['-e', 'setInterval(() => {}, 1000)'],
        {
          // POSIX stays in the owned server group; Windows stays in the inherited Job Object.
          detached: process.platform === 'win32',
          windowsHide: true,
          stdio: 'ignore',
        },
      );
      child.unref();
      if (process.env.FAKE_DESCENDANT_PID)
        fs.writeFileSync(process.env.FAKE_DESCENDANT_PID, String(child.pid));
      send({
        method: 'item/agentMessage/delta',
        params: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          itemId: 'pid',
          delta: String(child.pid),
        },
      });
    }
    if (scenario === 'slow') return;
    if (scenario === 'stderr')
      process.stderr.write(`${'x'.repeat(100000)}lasttail`);
    if (scenario === 'unsupported')
      return send({
        id: m.id,
        error: { code: -32601, message: 'unsupported' },
      });
    if (!m.params.capabilities.experimentalApi) process.exit(9);
    return send({
      id: m.id,
      result: {
        userAgent: 'fake',
        codexHome: '/fake',
        platformFamily: 'unix',
        platformOs: 'linux',
      },
    });
  }
  if (m.method === 'thread/start' || m.method === 'thread/resume') {
    if (!initialized) process.exit(10);
    threadRequest = m;
    return send({
      id: m.id,
      result: {
        thread: {
          id: m.params.threadId ?? 'thread-1',
          cwd: process.cwd(),
          pid: process.pid,
          marker: process.env.FAKE_MARKER,
          argv: process.argv.slice(2),
        },
      },
    });
  }
  if (m.method === 'turn/interrupt') {
    if (scenario === 'ignore-interrupt') return;
    send({ id: m.id, result: {} });
    complete('interrupted');
    return;
  }
  if (m.method === 'turn/start') {
    send({ id: m.id, result: { turn: turn() } });
    if (scenario === 'exit') {
      process.stderr.write('diagnostic crash tail', () => process.exit(17));
      return;
    }
    if (scenario === 'inherited-pipe') {
      spawn(
        process.execPath,
        ['-e', 'setTimeout(() => process.exit(0), 1500)'],
        { stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true },
      );
      process.exit(18);
    }
    if (scenario === 'persistent-descendant-exit') process.exit(18);
    if (
      scenario === 'interrupt' ||
      scenario === 'ignore-interrupt' ||
      scenario === 'persistent-descendant'
    )
      return;
    if (scenario === 'inspect') {
      const text = m.params.input[0].text;
      const contextPath = text.match(/Pi context file: (.+)/)?.[1];
      const context = contextPath
        ? {
            path: contextPath,
            text: fs.readFileSync(contextPath, 'utf8'),
            mode: fs.statSync(contextPath).mode & 0o777,
          }
        : null;
      send({
        method: 'item/completed',
        params: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          item: {
            type: 'agentMessage',
            id: 'inspect',
            text: JSON.stringify({ threadRequest, turnRequest: m, context }),
          },
          completedAtMs: Date.now(),
        },
      });
      complete();
      return;
    }
    if (
      scenario === 'elicitation' ||
      scenario === 'unknown' ||
      scenario === 'computer-use'
    ) {
      send({
        id: 'server-1',
        method:
          scenario === 'unknown'
            ? 'future/approval'
            : 'mcpServer/elicitation/request',
        params: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          serverName: 'node_repl',
          mode: 'form',
          _meta:
            scenario === 'computer-use'
              ? {
                  connector_id: 'computer-use',
                  persist: ['session', 'always'],
                  tool_params: { app: 'notepad.exe' },
                }
              : null,
          message: 'Approve?',
          requestedSchema: {},
        },
      });
      return;
    }
    if (scenario === 'malformed')
      process.stdout.write(`not json\nnull\n${'x'.repeat(4096)}\n`);
    const delta = JSON.stringify({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'item-1',
        delta: 'héllo',
      },
    });
    const bytes = Buffer.from(`${delta}\r\n`);
    const split = bytes.indexOf(Buffer.from('é')) + 1;
    process.stdout.write(bytes.subarray(0, split));
    setTimeout(() => {
      process.stdout.write(bytes.subarray(split));
      send({
        method: 'thread/tokenUsage/updated',
        params: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          tokenUsage: {
            total: { totalTokens: 12 },
            last: { totalTokens: 12 },
            modelContextWindow: 1000,
          },
        },
      });
      send({
        method: 'item/completed',
        params: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          item: { type: 'agentMessage', id: 'item-1', text: 'final answer' },
          completedAtMs: Date.now(),
        },
      });
      complete();
    }, 5);
    return;
  }
  if (m.id === 'server-1') {
    send({
      method: 'item/completed',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: {
          type: 'agentMessage',
          id: 'approval',
          text: 'approval handled',
        },
        completedAtMs: Date.now(),
      },
    });
    send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'approval',
        delta: JSON.stringify(m),
      },
    });
    complete();
  }
});
process.stdin.on('end', () => {
  if (scenario !== 'ignore-eof') process.exit(0);
});
if (scenario === 'ignore-eof') setInterval(() => {}, 1000);
