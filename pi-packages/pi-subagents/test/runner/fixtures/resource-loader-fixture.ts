/** Empty SDK resource boundary for runner tests that exercise events, not discovery. */
export const emptyFullResourceSdk = {
  getAgentDir: () => '/agent-dir',
  SettingsManager: {
    create: () => ({ reload: async () => {} }),
  },
  DefaultPackageManager: class {
    async resolve() {
      return { extensions: [] };
    }
  },
  DefaultResourceLoader: class {
    async reload() {}
  },
};
