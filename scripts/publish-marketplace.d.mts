export interface PublishMarketplaceOptions {
  projectRoot?: string;
  pluginName?: string;
  centralRepository?: string;
  pluginRepository?: string;
  beforePush?: () => void | Promise<void>;
}

export type PublishMarketplaceResult =
  | {
      status: 'current';
      pluginName: string;
      version: string;
    }
  | {
      status: 'published';
      pluginName: string;
      version: string;
      commit: string;
    };

export function publishMarketplace(
  options?: PublishMarketplaceOptions,
): Promise<PublishMarketplaceResult>;
