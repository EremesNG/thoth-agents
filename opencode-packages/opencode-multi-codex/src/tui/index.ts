import type { Plugin } from '@opencode/plugin/tui';
import { type CodexRpcPort, codexRpc } from '../rpc.js';
import { type CodexCommand, runCodexFlow } from './flow.js';

const plugin: Plugin.Definition = {
  id: 'thoth-multi-codex.tui',
  setup(context) {
    const rpc = context.client.rpc(codexRpc) as unknown as CodexRpcPort;
    const sessionID = () => {
      const route = context.ui.router.current();
      return route.type === 'session' ? route.sessionID : undefined;
    };
    const { dialog, toast } = context.ui;
    const ui = {
      select: dialog.select.bind(dialog),
      confirm: dialog.confirm.bind(dialog),
      alert: dialog.alert.bind(dialog),
      toast: { show: toast.show.bind(toast) },
    };
    let running = false;
    const exclusive = async (command: CodexCommand) => {
      if (running) return;
      running = true;
      try {
        await runCodexFlow(command, { ui, rpc, sessionID });
      } finally {
        running = false;
      }
    };
    context.keymap.layer(() => ({
      mode: 'global',
      commands: (['add', 'remove', 'switch', 'status'] as const).map(
        (command) => ({
          id: `thoth-multi-codex.codex-${command}`,
          title: `Codex accounts: ${command}`,
          description: `Manage Codex accounts: ${command}`,
          palette: true,
          slash: { name: `codex-${command}` },
          run: () => exclusive(command),
        }),
      ),
    }));
  },
};

export default plugin;
