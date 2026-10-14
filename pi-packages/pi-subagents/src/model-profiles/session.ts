export const SESSION_MODEL_PROFILE_ENTRY = 'thoth-subagent-model-profile';

/** Session entries only; clearing is an explicit tombstone for resume. */
export class SessionModelProfile {
  private selection?: string;
  constructor(
    private appendEntry?: (customType: string, data: unknown) => void,
  ) {}
  get(): string | undefined {
    return this.selection;
  }
  set(profile?: string): void {
    if (profile !== undefined && !profile.trim())
      throw new Error('Profile name must be non-empty');
    if (!this.appendEntry) throw new Error('Pi appendEntry API is unavailable');
    const selection = profile?.trim();
    this.appendEntry(SESSION_MODEL_PROFILE_ENTRY, {
      profile: selection ?? null,
    });
    this.selection = selection;
  }
  restore(entries: readonly any[]): void {
    this.selection = undefined;
    for (const entry of entries) {
      if (
        entry?.type !== 'custom' ||
        entry.customType !== SESSION_MODEL_PROFILE_ENTRY
      )
        continue;
      const profile = entry.data?.profile;
      if (profile === null) this.selection = undefined;
      else if (typeof profile === 'string' && profile.trim())
        this.selection = profile.trim();
    }
  }
}
