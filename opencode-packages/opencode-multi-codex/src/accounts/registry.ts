import type { Plugin } from '@opencode/plugin';

export type RegistryStorage = Pick<Plugin.Context['storage'], 'get' | 'set'>;
export type CredentialSnapshot = {
  credentials: ReadonlyArray<{ id: string; label: string }>;
  activeCredentialID?: string;
};
export interface CredentialSource {
  snapshot(): Promise<CredentialSnapshot>;
}
export type Account = {
  number: number;
  providerID: string;
  credentialID: string;
  label: string;
  state: 'ok' | 'missing';
};
type Binding = { number: number; credentialID: string; label: string };
function parseBindings(value: unknown): Binding[] {
  if (value === undefined) return [];
  const invalid = () =>
    new Error('Invalid account registry; stored mappings were not changed.');
  if (
    !value ||
    typeof value !== 'object' ||
    !('version' in value) ||
    value.version !== 1 ||
    !('accounts' in value) ||
    !Array.isArray(value.accounts)
  )
    throw invalid();
  const numbers = new Set<number>();
  const bindings: Binding[] = [];
  for (const item of value.accounts) {
    if (
      !item ||
      typeof item !== 'object' ||
      !Number.isSafeInteger(item.number) ||
      item.number < 1 ||
      numbers.has(item.number) ||
      typeof item.credentialID !== 'string' ||
      !item.credentialID ||
      typeof item.label !== 'string'
    )
      throw invalid();
    numbers.add(item.number);
    bindings.push({
      number: item.number,
      credentialID: item.credentialID,
      label: item.label,
    });
  }
  if (bindings.length > 0 && !numbers.has(1)) throw invalid();
  return bindings;
}
export const ACCOUNT_STORAGE_KEY = 'accounts/v1';
export type AddResult =
  | { status: 'added'; account: Account }
  | { status: 'no-unmapped-credential'; guidance: string }
  | {
      status:
        | 'already-mapped'
        | 'credential-not-found'
        | 'no-active-credential';
    };
export type RemoveResult = {
  status: 'removed' | 'not-found' | 'invalid-number';
};
export type AccountNotice = {
  type: 'account-1-rebound';
  previousCredentialID: string;
  credentialID: string;
};

/** Use one instance per plugin setup; operations serialize within that instance.
 * Storage contains only IDs and labels, never credential values or tokens.
 */
export class AccountRegistry {
  private pending: Promise<unknown> = Promise.resolve();
  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => undefined);
    return result;
  }
  private readonly changes: AccountNotice[] = [];
  /** Retained for status display for the lifetime of this registry instance. */
  get notices(): readonly AccountNotice[] {
    return this.changes.map((notice) => ({ ...notice }));
  }
  constructor(
    private readonly storage: RegistryStorage,
    private readonly source: CredentialSource,
  ) {}

  private async load() {
    const snapshot = await this.source.snapshot();
    const saved = await this.storage.get(ACCOUNT_STORAGE_KEY);
    const bindings = parseBindings(saved);
    const active = snapshot.credentials.find(
      (item) => item.id === snapshot.activeCredentialID,
    );
    const first = bindings.find((item) => item.number === 1);
    let notice: AccountNotice | undefined;
    if (
      first &&
      active &&
      !snapshot.credentials.some((item) => item.id === first.credentialID)
    ) {
      notice = {
        type: 'account-1-rebound',
        previousCredentialID: first.credentialID,
        credentialID: active.id,
      };
      first.credentialID = active.id;
      first.label = active.label;
    }
    if (!bindings.some((item) => item.number === 1) && active) {
      bindings.push({
        number: 1,
        credentialID: active.id,
        label: active.label,
      });
    }
    const accounts = bindings
      .sort((a, b) => a.number - b.number)
      .map((binding): Account => {
        const credential = snapshot.credentials.find(
          (item) => item.id === binding.credentialID,
        );
        if (credential) binding.label = credential.label;
        return {
          ...binding,
          providerID:
            binding.number === 1 ? 'openai' : `openai-codex-${binding.number}`,
          state: credential ? 'ok' : 'missing',
        };
      });
    await this.storage.set(ACCOUNT_STORAGE_KEY, {
      version: 1,
      accounts: bindings,
    });
    if (notice) this.changes.push(notice);
    return { accounts, bindings, snapshot };
  }

  async list(): Promise<Account[]> {
    return this.exclusive(async () => (await this.load()).accounts);
  }

  async add(credentialID?: string): Promise<AddResult> {
    return this.exclusive(() => this.addCredential(credentialID));
  }

  private async addCredential(credentialID?: string): Promise<AddResult> {
    const { accounts, bindings, snapshot } = await this.load();
    if (!accounts.some((a) => a.number === 1 && a.state === 'ok'))
      return { status: 'no-active-credential' };
    if (
      credentialID !== undefined &&
      bindings.some((a) => a.credentialID === credentialID)
    )
      return { status: 'already-mapped' };
    const credential = snapshot.credentials.find((item) =>
      credentialID === undefined
        ? !bindings.some((a) => a.credentialID === item.id)
        : item.id === credentialID,
    );
    if (!credential)
      return credentialID === undefined
        ? {
            status: 'no-unmapped-credential',
            guidance:
              'Add another OpenAI account through the native connect dialog, then run /codex-add again.',
          }
        : { status: 'credential-not-found' };
    let number = 2;
    while (bindings.some((a) => a.number === number)) number++;
    const binding = {
      number,
      credentialID: credential.id,
      label: credential.label,
    };
    await this.storage.set(ACCOUNT_STORAGE_KEY, {
      version: 1,
      accounts: [...bindings, binding],
    });
    return {
      status: 'added',
      account: {
        ...binding,
        providerID: `openai-codex-${number}`,
        state: 'ok',
      },
    };
  }

  async remove(number: number): Promise<RemoveResult> {
    return this.exclusive(() => this.removeBinding(number));
  }

  private async removeBinding(number: number): Promise<RemoveResult> {
    if (!Number.isSafeInteger(number) || number < 2)
      return { status: 'invalid-number' };
    const { bindings } = await this.load();
    if (!bindings.some((a) => a.number === number))
      return { status: 'not-found' };
    await this.storage.set(ACCOUNT_STORAGE_KEY, {
      version: 1,
      accounts: bindings.filter((a) => a.number !== number),
    });
    return { status: 'removed' };
  }
}
