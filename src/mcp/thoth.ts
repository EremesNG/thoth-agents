import { DEFAULT_THOTH_COMMAND, type ThothConfig } from '../config';
import type { LocalMcpConfig } from './types';

export function createThothMcp(config?: ThothConfig): LocalMcpConfig {
  const environment = {
    ...(config?.data_dir ? { THOTH_DATA_DIR: config.data_dir } : {}),
    ...(typeof config?.http_port === 'number'
      ? { THOTH_HTTP_PORT: String(config.http_port) }
      : {}),
    ...config?.environment,
  };

  const mcpConfig: LocalMcpConfig & { timeout?: number } = {
    type: 'local',
    command: [...(config?.command ?? DEFAULT_THOTH_COMMAND)],
    ...(Object.keys(environment).length > 0 ? { environment } : {}),
    ...(typeof config?.timeout === 'number' ? { timeout: config.timeout } : {}),
  };

  return mcpConfig;
}
