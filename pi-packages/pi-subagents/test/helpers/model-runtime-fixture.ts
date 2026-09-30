/** Minimal SDK boundary double for tests that exercise runner events, not providers. */
export class ModelRuntimeFixture {
  static async create(): Promise<ModelRuntimeFixture> {
    return new ModelRuntimeFixture();
  }

  getRegisteredProviderIds(): string[] {
    return [];
  }

  async refresh(): Promise<void> {}
}
