import type { ResolvedAccount } from '../request/requests.js';
import { parseUsage, type QuotaSnapshot } from './parsers.js';

export const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
export const USAGE_TIMEOUT_MS = 10_000;
export type QuotaCredentials = {
  resolveCredential(
    accountNumber: number,
  ): Promise<ResolvedAccount | undefined>;
};

/** Bound credential resolution, fetch and body reading with one abortable deadline. */
export async function fetchQuota(
  accountNumber: number,
  requests: QuotaCredentials,
  fetcher: typeof fetch = fetch,
): Promise<QuotaSnapshot> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('Quota request timed out after 10 seconds.'));
    }, USAGE_TIMEOUT_MS);
  });
  const operation = async () => {
    const credential = await requests
      .resolveCredential(accountNumber)
      .catch(() => undefined);
    if (!credential) throw new Error('Quota credential unavailable.');
    controller.signal.throwIfAborted();
    let response: Response;
    try {
      response = await fetcher(USAGE_URL, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${credential.access}`,
          'ChatGPT-Account-Id': credential.accountID,
        },
        signal: controller.signal,
      });
    } catch {
      throw new Error('Quota network request failed.');
    }
    if (!response.ok)
      throw new Error(`Quota request failed (HTTP ${response.status}).`);
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new Error('Invalid quota response JSON.');
    }
    const snapshot = parseUsage(value);
    if (!snapshot) throw new Error('Quota response has no usable windows.');
    return snapshot;
  };
  try {
    return await Promise.race([operation(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
