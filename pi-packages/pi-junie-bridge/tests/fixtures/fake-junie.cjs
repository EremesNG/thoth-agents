const { createInterface } = require('node:readline');
const { spawn } = require('node:child_process');
const { appendFileSync } = require('node:fs');
const configOptions = [
  {
    id: 'mode',
    name: 'Mode',
    type: 'select',
    currentValue: 'default',
    options: [
      { value: 'default', name: 'Default' },
      { value: 'plan', name: 'Plan' },
    ],
  },
  {
    id: 'model',
    name: 'Model',
    type: 'select',
    currentValue: 'v1:12:jetbrains-ai:gemini-3.7-flash',
    options: [
      {
        group: 'jetbrains-ai',
        name: 'JetBrains AI',
        options: [
          {
            value: 'v1:12:jetbrains-ai:gemini-3.7-flash',
            name: 'Gemini 3.7 Flash',
          },
        ],
      },
      {
        group: 'mix',
        name: 'Automatic',
        options: [{ value: 'mix.auto', name: 'Auto' }],
      },
    ],
  },
  {
    id: 'effort',
    name: 'Effort',
    category: 'thought_level',
    type: 'select',
    currentValue: 'medium',
    options: [
      { value: 'low', name: 'Low' },
      { value: 'medium', name: 'Medium' },
      { value: 'high', name: 'High' },
    ],
  },
  {
    id: 'brave_mode',
    name: 'Brave mode',
    type: 'select',
    currentValue: 'on',
    options: [
      { value: 'off', name: 'Off' },
      { value: 'brave-auto', name: 'Auto' },
      { value: 'on', name: 'On' },
    ],
  },
];
let turns = 0,
  pendingPrompt,
  mcp,
  braveResets = 0;
const replies = new Map();
const send = (value) =>
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...value }) + '\n');
if (process.env.FAKE_DESCENDANT) {
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
    stdio: 'inherit',
  });
  const notification = {
    method: 'fixture/descendant',
    params: { pid: child.pid, leader: process.pid },
  };
  send(notification);
  if (process.env.FAKE_TRANSCRIPT)
    appendFileSync(
      process.env.FAKE_TRANSCRIPT,
      JSON.stringify(notification) + '\n',
    );
}
process.stderr.write('fake Junie diagnostic\n');
createInterface({ input: process.stdin }).on('line', (line) => {
  const m = JSON.parse(line);
  if (process.env.FAKE_TRANSCRIPT)
    appendFileSync(process.env.FAKE_TRANSCRIPT, JSON.stringify(m) + '\n');
  if (m.method === 'session/cancel') {
    if (pendingPrompt)
      send({ id: pendingPrompt, result: { stopReason: 'cancelled' } });
    return;
  }
  if (replies.has(m.id)) {
    replies.get(m.id)(m.result);
    replies.delete(m.id);
    return;
  }
  if (m.id === 901) {
    send({ method: 'fixture/permission_result', params: m.result });
    return;
  }
  if (!m.method) return;
  if (
    process.env.FAKE_HANG ||
    (process.env.FAKE_HANG_NEW && m.method === 'session/new')
  )
    return;
  if (
    (process.env.FAKE_AUTH && m.method === 'session/new') ||
    (process.env.FAKE_INIT_AUTH && m.method === 'initialize')
  )
    return send({
      id: m.id,
      error: {
        code: -32000,
        message: 'Authentication required',
        data: { authMethods: ['jetbrains-account'] },
      },
    });
  if (m.method === 'session/resume' && process.env.FAKE_EXIT_RESUME)
    return process.exit(1);
  if (m.method === 'session/resume' && process.env.FAKE_HANG_RESUME) return;
  if (m.method === 'session/resume' && process.env.FAKE_RESUME_UNSUPPORTED)
    return send({
      id: m.id,
      error: { code: -32601, message: 'Method not found' },
    });
  if (
    ['session/resume', 'session/load'].includes(m.method) &&
    process.env.FAKE_RESUME_FAIL
  )
    return send({
      id: m.id,
      error: { code: -32603, message: 'Session unavailable' },
    });
  if (m.params?.mcpServers)
    mcp = m.params.mcpServers.find((server) => server.name === 'pi');
  let result = {};
  if (m.method === 'initialize')
    result = {
      protocolVersion: 1,
      agentCapabilities: {
        loadSession: true,
        sessionCapabilities: {
          fork: {},
          resume: {},
          close: {},
          list: {},
          delete: {},
        },
      },
      authMethods: [{ id: 'jetbrains-account', name: 'JetBrains Account' }],
    };
  if (
    ['session/new', 'session/resume', 'session/fork', 'session/load'].includes(
      m.method,
    )
  )
    result = { sessionId: m.params.sessionId || 'fake-session', configOptions };
  if (process.env.FAKE_LATE_USAGE && m.method === 'session/new') turns = 0;
  if (
    process.env.FAKE_LATE_USAGE &&
    ['session/resume', 'session/load'].includes(m.method)
  ) {
    turns = 1;
    send({
      method: 'session/update',
      params: {
        sessionId: result.sessionId,
        update: {
          sessionUpdate: 'usage_update',
          cost: { amount: 0.3, currency: 'USD' },
        },
      },
    });
  }
  if (m.method === 'session/set_config_option') {
    if (
      m.params.configId === 'brave_mode' &&
      ++braveResets > 1 &&
      process.env.FAKE_BRAVE_RESET_FAIL
    )
      return send({
        id: m.id,
        error: { code: -32603, message: 'Cannot reset brave mode' },
      });
    const option = configOptions.find(
      (option) => option.id === m.params.configId,
    );
    if (option) option.currentValue = m.params.value;
    result = { configOptions };
    send({
      method: 'session/update',
      params: {
        sessionId: m.params.sessionId,
        update: { sessionUpdate: 'config_option_update', configOptions },
      },
    });
    if (process.env.FAKE_PERMISSION)
      send({
        id: 901,
        method: 'session/request_permission',
        params: {
          sessionId: m.params.sessionId,
          toolCall: {
            toolCallId: 'native-1',
            title: 'Terminal',
            _meta: { is_mcp_tool_call: false },
          },
          options: [
            { optionId: 'yes', name: 'Allow once', kind: 'allow_once' },
            { optionId: 'no', name: 'Reject', kind: 'reject_once' },
          ],
        },
      });
  }
  if (m.method === 'session/new' && process.env.FAKE_STATS) {
    if (process.env.FAKE_TRANSCRIPT)
      appendFileSync(
        process.env.FAKE_TRANSCRIPT,
        JSON.stringify({
          method: 'fixture/quota_pid',
          params: { pid: process.pid },
        }) + '\n',
      );
    if (process.env.FAKE_STATS !== 'not-advertised')
      send({
        method: 'session/update',
        params: {
          sessionId: result.sessionId,
          update: {
            sessionUpdate: 'available_commands_update',
            availableCommands: [
              {
                name: 'stats',
                description:
                  'Displays Junie usage statistics for this session and all-time',
              },
            ],
          },
        },
      });
  }
  if (m.method === 'session/prompt' && process.env.FAKE_STATS) {
    const update = (value) =>
      send({
        method: 'session/update',
        params: { sessionId: m.params.sessionId, update: value },
      });
    if (process.env.FAKE_STATS === 'timeout') return;
    if (process.env.FAKE_STATS === 'thought')
      update({
        sessionUpdate: 'agent_thought_chunk',
        content: { type: 'text', text: 'Thinking' },
      });
    if (process.env.FAKE_STATS === 'tool')
      update({
        sessionUpdate: 'tool_call',
        toolCallId: 'unsafe',
        title: 'Terminal',
      });
    if (process.env.FAKE_STATS === 'cost')
      update({
        sessionUpdate: 'usage_update',
        cost: { amount: 0.01, currency: 'USD' },
      });
    if (process.env.FAKE_STATS === 'free')
      update({
        sessionUpdate: 'usage_update',
        cost: { amount: 0, currency: 'USD' },
      });
    update({
      sessionUpdate: 'agent_message_chunk',
      content: {
        type: 'text',
        text:
          process.env.FAKE_STATS === 'malformed'
            ? 'No balance available'
            : '**Junie stats**  \n**Current session**  \n**All-time (this machine)**  \n**License & quota**  \n- License: JetBrains AI Pro  \n- Balance left: 64.75 credits  \n- Top-up: https://jb.gg/junie_top_up  \n',
      },
    });
    return send({ id: m.id, result: { stopReason: 'end_turn' } });
  }
  if (m.method === 'session/prompt') {
    if (!process.env.FAKE_STREAM)
      return send({
        id: m.id,
        error: { code: -32601, message: 'PROMPT FORBIDDEN IN DISCOVERY' },
      });
    if (
      process.env.FAKE_PROMPT_ERROR ||
      (process.env.FAKE_FAIL_SECOND && turns === 1)
    )
      return send({
        id: m.id,
        error: { code: -32603, message: 'fixture prompt error' },
      });
    turns++;
    if (process.env.FAKE_MCP && turns === 1) {
      pendingPrompt = m.id;
      const update = (value) =>
        send({
          method: 'session/update',
          params: { sessionId: m.params.sessionId, update: value },
        });
      (async () => {
        if (!mcp) throw new Error('No Pi MCP server registered');
        const permission = new Promise((resolve) => replies.set(902, resolve));
        send({
          id: 902,
          method: 'session/request_permission',
          params: {
            sessionId: m.params.sessionId,
            toolCall: {
              toolCallId: 'acp-unrelated-id',
              title: 'pi/read',
              _meta: { is_mcp_tool_call: true },
            },
            options: [
              { optionId: 'once', name: 'Allow once', kind: 'allow_once' },
              { optionId: 'no', name: 'Reject', kind: 'reject_once' },
            ],
          },
        });
        const decision = await permission;
        if (decision?.outcome?.optionId !== 'once')
          throw new Error('Pi MCP permission denied');
        const call = async (index) => {
          if (index === 2 && process.env.FAKE_MCP_DELAY_SECOND)
            await new Promise((resolve) => setTimeout(resolve, 50));
          if (process.env.FAKE_TRANSCRIPT)
            appendFileSync(
              process.env.FAKE_TRANSCRIPT,
              JSON.stringify({
                method: 'fixture/mcp_start',
                params: { index },
              }) + '\n',
            );
          update({
            sessionUpdate: 'tool_call',
            toolCallId: 'acp-' + index,
            title: 'pi/read',
            _meta: { is_mcp_tool_call: true },
          });
          const response = await fetch(mcp.url, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              accept: 'application/json, text/event-stream',
              ...Object.fromEntries(mcp.headers.map((h) => [h.name, h.value])),
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: index,
              method: 'tools/call',
              params: { name: 'read', arguments: { path: '/file-' + index } },
            }),
          });
          const result = await response.json();
          if (!result.result) throw new Error(JSON.stringify(result));
          if (process.env.FAKE_TRANSCRIPT)
            appendFileSync(
              process.env.FAKE_TRANSCRIPT,
              JSON.stringify({
                method: 'fixture/mcp_result',
                params: { index, ...result.result },
              }) + '\n',
            );
          update({
            sessionUpdate: 'tool_call_update',
            toolCallId: 'acp-' + index,
            status: 'completed',
          });
          return result.result;
        };
        if (process.env.FAKE_MCP_PARK_TEXT)
          setTimeout(() => {
            update({
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: 'Progress while parked. ' },
            });
            if (process.env.FAKE_TRANSCRIPT)
              appendFileSync(
                process.env.FAKE_TRANSCRIPT,
                JSON.stringify({ method: 'fixture/park_text' }) + '\n',
              );
          }, 100);
        const count = Number(process.env.FAKE_MCP);
        await Promise.all(Array.from({ length: count }, (_, i) => call(i + 1)));
        update({
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Tool results received in same turn' },
        });
        send({ id: m.id, result: { stopReason: 'end_turn' } });
      })().catch((error) =>
        send({ id: m.id, error: { code: -32603, message: error.message } }),
      );
      return;
    }
    const update = (value) =>
      send({
        method: 'session/update',
        params: { sessionId: m.params.sessionId, update: value },
      });
    if (process.env.FAKE_LATE_USAGE) {
      if (turns !== 2)
        update({
          sessionUpdate: 'usage_update',
          cost: { amount: turns === 1 ? 0.25 : 0.4, currency: 'USD' },
        });
      send({ id: m.id, result: { stopReason: 'end_turn' } });
      if (turns === 1)
        setTimeout(() => {
          update({
            sessionUpdate: 'usage_update',
            cost: { amount: 0.3, currency: 'USD' },
          });
          appendFileSync(
            process.env.FAKE_TRANSCRIPT,
            `${JSON.stringify({ method: 'fixture/late_usage_sent' })}\n`,
          );
        }, 50);
      return;
    }
    if (process.env.FAKE_BRAVE_UPDATE)
      update({
        sessionUpdate: 'config_option_update',
        configOptions: [{ id: 'brave_mode', currentValue: 'on' }],
      });
    if (process.env.FAKE_NATIVE_DETAIL) {
      update({
        sessionUpdate: 'tool_call',
        toolCallId: 'detail',
        kind: 'edit',
        title: 'Edit file',
        status: 'in_progress',
        locations: [{ path: '/repo/file', line: 4 }],
        rawInput: { path: '/repo/file' },
      });
      update({
        sessionUpdate: 'tool_call_update',
        toolCallId: 'detail',
        status: 'completed',
        content: [
          {
            type: 'diff',
            path: '/repo/file',
            oldText: 'before',
            newText: 'after',
          },
          { type: 'content', content: { type: 'text', text: 'Edit finished' } },
        ],
      });
    }
    if (process.env.FAKE_NATIVE_PERMISSION) {
      const id = 903;
      replies.set(id, (decision) => {
        if (process.env.FAKE_TRANSCRIPT)
          appendFileSync(
            process.env.FAKE_TRANSCRIPT,
            JSON.stringify({
              method: 'fixture/native_decision',
              params: decision,
            }) + '\n',
          );
        send({ id: m.id, result: { stopReason: 'end_turn' } });
      });
      send({
        id,
        method: 'session/request_permission',
        params: {
          sessionId: m.params.sessionId,
          toolCall: {
            title: 'Terminal',
            kind: 'execute',
            rawInput: { command: 'echo hello' },
          },
          options: [
            { optionId: 'yes', name: 'Allow once', kind: 'allow_once' },
            { optionId: 'no', name: 'Reject', kind: 'reject_once' },
          ],
        },
      });
      pendingPrompt = m.id;
      return;
    }
    if (process.env.FAKE_FOREIGN_MCP)
      update({
        sessionUpdate: 'tool_call',
        toolCallId: 'foreign',
        title: 'other/read',
        _meta: { is_mcp_tool_call: true },
      });
    if (process.env.FAKE_RICH) {
      update({
        sessionUpdate: 'agent_thought_chunk',
        content: { type: 'text', text: 'Let me think' },
      });
      update({
        sessionUpdate: 'usage_update',
        used: 100,
        size: 64000,
        cost: { amount: turns === 1 ? 0.2 : 0.35, currency: 'USD' },
      });
      update({
        sessionUpdate: 'usage_update',
        used: 120,
        size: 64000,
        cost: { amount: turns === 1 ? 0.25 : 0.4, currency: 'USD' },
      });
      update({
        sessionUpdate: 'tool_call',
        toolCallId: 'native-1',
        title: 'Terminal',
        status: 'in_progress',
      });
      update({
        sessionUpdate: 'tool_call_update',
        toolCallId: 'native-1',
        status: 'completed',
      });
    }
    send({
      method: 'session/update',
      params: {
        sessionId: m.params.sessionId,
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Hello from Junie' },
        },
      },
    });
    if (process.env.FAKE_PROGRESS) {
      let ticks = 0;
      const timer = setInterval(() => {
        update({
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: ' progress' },
        });
        if (++ticks === 5) {
          clearInterval(timer);
          send({ id: m.id, result: { stopReason: 'end_turn' } });
        }
      }, 50);
      return;
    }
    if (process.env.FAKE_HANG_PROMPT) {
      pendingPrompt = m.id;
      return;
    }
    return send({
      id: m.id,
      result: { stopReason: process.env.FAKE_STOP || 'end_turn' },
    });
  }
  send({ id: m.id, result });
});
