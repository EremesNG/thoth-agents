import type { Plugin } from '@opencode/plugin/tui';
import type { CodexRpcPort } from '../rpc.js';
import { statusView } from './status.js';

export type Ui = Pick<
  Plugin.Context['ui']['dialog'],
  'select' | 'confirm' | 'alert'
> & { toast: Pick<Plugin.Context['ui']['toast'], 'show'> };
export type CodexCommand = 'add' | 'remove' | 'switch' | 'status';
type Ports = { ui: Ui; rpc: CodexRpcPort; sessionID(): string | undefined };
const TITLE = 'Codex accounts';

export async function runCodexFlow(
  command: CodexCommand,
  { ui, rpc, sessionID: currentSession }: Ports,
): Promise<void> {
  const sessionID = currentSession();
  const session = sessionID ? { sessionID } : {};
  try {
    const loaded = await rpc.state(session);
    if (!loaded.ok) throw new Error(loaded.error.message);
    const state = loaded.value;
    if (command === 'status') {
      let latest = state;
      if (state.accounts.some((account) => account.quota.state !== 'fresh')) {
        const result = await rpc.refreshQuota(session);
        if (!result.ok) throw new Error(result.error.message);
        latest = result.value;
      }
      await ui.alert({ title: TITLE, message: statusView(latest, Date.now()) });
    }
    if (command === 'switch') {
      if (!sessionID) {
        ui.toast.show({
          title: TITLE,
          message: 'Open a session to switch Codex accounts.',
          variant: 'info',
        });
        return;
      }
      const selected = await ui.select<string | number>({
        title: 'Switch Codex account (this session only)',
        current: state.sessionOverride ?? 'default',
        options: [
          {
            title: 'Pinned/default',
            description:
              'Clear this session override; child sessions stay unchanged',
            value: 'default',
          },
          ...state.accounts.map((account) => ({
            title: `${account.number}: ${account.label}`,
            description: account.providerID,
            value: account.number,
            disabled: account.credentialState !== 'ok',
          })),
        ],
      });
      if (selected === undefined) return;
      const result = await rpc.switch({
        sessionID,
        number: selected === 'default' ? null : Number(selected),
      });
      if (!result.ok) throw new Error(result.error.message);
      ui.toast.show({
        title: TITLE,
        message:
          selected === 'default'
            ? 'Using the pinned/default account.'
            : `This session now uses account ${selected}.`,
        variant: 'success',
      });
    }
    if (command === 'remove') {
      const accounts = state.accounts.filter((account) => account.number >= 2);
      if (!accounts.length) {
        ui.toast.show({
          title: TITLE,
          message: 'No extra accounts to remove.',
          variant: 'info',
        });
        return;
      }
      const number = await ui.select({
        title: 'Remove Codex account',
        options: accounts.map((account) => ({
          title: `${account.number}: ${account.label}`,
          description: account.providerID,
          value: account.number,
        })),
      });
      if (
        number === undefined ||
        !(await ui.confirm({
          title: 'Remove Codex account?',
          message: `Unmap account ${number}? Its OpenCode credential will not be deleted.`,
        }))
      )
        return;
      const result = await rpc.remove({ ...session, number });
      if (!result.ok) throw new Error(result.error.message);
      ui.toast.show({
        title: TITLE,
        message: 'Codex account unmapped.',
        variant: 'success',
      });
    }
    if (command === 'add') {
      let credentialID: string | undefined = state.unmappedCredentials[0]?.id;
      if (state.unmappedCredentials.length > 1) {
        credentialID = await ui.select({
          title: 'Add Codex account',
          options: state.unmappedCredentials.map((credential) => ({
            title: credential.label,
            value: credential.id,
          })),
        });
        if (credentialID === undefined) return;
      }
      const result = await rpc.add(
        credentialID ? { ...session, credentialID } : session,
      );
      if (!result.ok) throw new Error(result.error.message);
      ui.toast.show({
        title: TITLE,
        message: result.value.guidance ?? 'Codex account added.',
        variant: result.value.guidance ? 'info' : 'success',
      });
    }
  } catch (error) {
    ui.toast.show({
      title: TITLE,
      message: error instanceof Error ? error.message : String(error),
      variant: 'error',
    });
  }
}
