/** Exact-session overrides: parent/child sessions never inherit each other's state. */
export class SessionAccountOverrides {
  private readonly values = new Map<string, number>();

  set(sessionID: string, accountNumber: number) {
    if (!Number.isSafeInteger(accountNumber) || accountNumber < 1)
      throw new Error('Codex account number must be a positive safe integer.');
    this.values.set(sessionID, accountNumber);
  }

  get(sessionID: string) {
    return this.values.get(sessionID);
  }

  clear(sessionID: string) {
    this.values.delete(sessionID);
  }

  clearAll() {
    this.values.clear();
  }
}
