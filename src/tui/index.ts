import type { Plugin } from '@opencode/plugin/tui';
import { profileRpc } from '../opencode/profile-rpc';
import { type RpcPort, runModelProfilesFlow, type Ui } from './flow';

const SLASH = 'subagents-model';

/**
 * `Plugin.define` is an identity helper, so the definition is exported as a typed
 * object; that keeps the bundle free of the host's UI runtime dependencies.
 */
const plugin: Plugin.Definition = {
  id: 'thoth-agents.model-profiles',
  setup(context) {
    const rpc = context.client.rpc(profileRpc) as unknown as RpcPort;
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
    context.keymap.layer(() => ({
      mode: 'global',
      commands: [
        {
          id: 'thoth-agents.subagents-model',
          title: 'Subagent model profiles',
          description: 'View, edit and activate subagent model profiles',
          palette: true,
          slash: { name: SLASH },
          async run() {
            if (running) return;
            running = true;
            try {
              await runModelProfilesFlow({ ui, rpc, sessionID });
            } finally {
              running = false;
            }
          },
        },
      ],
    }));
  },
};

export default plugin;
