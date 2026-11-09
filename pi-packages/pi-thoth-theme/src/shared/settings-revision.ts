/** Theme-local invalidation epoch, independent of viewport width and animation. */
let revision = 0;

export function settingsRevision(): number {
  return revision;
}

export function advanceSettingsRevision(): void {
  revision++;
}
