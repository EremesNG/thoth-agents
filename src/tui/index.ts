import type { Plugin } from '@opencode/plugin/tui';
import { profileRpc } from '../opencode/profile-rpc';
import { toolRpc } from '../opencode/tool-rpc';
import { type RpcPort, runModelProfilesFlow, type Ui } from './flow';
import { runToolsFlow, type ToolsRpcPort } from './tools/flow';

const SLASH = 'subagents-model';
const TOOLS_SLASH = 'subagents-tools';

/**
 * `Plugin.define` is an identity helper, so the definition is exported as a typed
 * object; that keeps the bundle free of the host's UI runtime dependencies.
 */
const plugin: Plugin.Definition = {
  id: 'thoth-agents.model-profiles',
  setup(context) {
    const rpc = context.client.rpc(profileRpc) as unknown as RpcPort;
    const toolsRpc = context.client.rpc(toolRpc) as unknown as ToolsRpcPort;
    const sessionID = () => {
      const route = context.ui.router.current();
      return route.type === 'session' ? route.sessionID : undefined;
    };
    const { dialog, toast } = context.ui;
    const ui: Ui = {
      select: (options) => dialog.select(options),
      prompt: (options) => dialog.prompt(options),
      confirm: (options) => dialog.confirm(options),
      alert: (options) => dialog.alert(options),
      toast: { show: (options) => toast.show(options) },
    };
    let running = false;
    /** One panel at a time: both commands share the guard. */
    const exclusive = async (run: () => Promise<void>) => {
      if (running) return;
      running = true;
      try {
        await run();
      } finally {
        running = false;
      }
    };
    context.keymap.layer(() => ({
      mode: 'global',
      commands: [
        {
          id: 'thoth-agents.subagents-model',
          title: 'Subagent model profiles',
          description: 'View, edit and activate subagent model profiles',
          palette: true,
          slash: { name: SLASH },
          run: () =>
            exclusive(() => runModelProfilesFlow({ ui, rpc, sessionID })),
        },
        {
          id: 'thoth-agents.subagents-tools',
          title: 'Subagent tool permissions',
          description: 'View and edit per-role allow/ask/deny tool overrides',
          palette: true,
          slash: { name: TOOLS_SLASH },
          run: () => exclusive(() => runToolsFlow({ ui, rpc: toolsRpc })),
        },
      ],
    }));
  },
};

export default plugin;
