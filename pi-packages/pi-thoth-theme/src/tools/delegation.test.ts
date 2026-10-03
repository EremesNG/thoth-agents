import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createPowerShellToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';
import type { ThemeConfig } from '../shared/config.ts';
import { registerTools } from './index.ts';

interface RegisteredToolShape {
  name: string;
  parameters: unknown;
  execute: unknown;
  description: string;
  renderShell?: string;
  renderCall?: unknown;
  renderResult?: unknown;
}

describe('registerTools delegation', () => {
  const dummyConfig: ThemeConfig = {
    icons: 'nerd',
    statusLine: { enabled: true, subscriptionProviders: ['claude-bridge'] },
    tools: { enabled: true },
    images: { enabled: true },
    welcome: { enabled: true },
  };

  it('re-registers all 7 built-in tools with identical name, parameters, and execute reference when powershell is omitted', () => {
    const cwd = process.cwd();
    const sdkDefs = {
      read: createReadToolDefinition(cwd),
      bash: createBashToolDefinition(cwd),
      ls: createLsToolDefinition(cwd),
      grep: createGrepToolDefinition(cwd),
      find: createFindToolDefinition(cwd),
      edit: createEditToolDefinition(cwd),
      write: createWriteToolDefinition(cwd),
    };

    const mockFactories = {
      createReadToolDefinition: () => sdkDefs.read,
      createBashToolDefinition: () => sdkDefs.bash,
      createLsToolDefinition: () => sdkDefs.ls,
      createGrepToolDefinition: () => sdkDefs.grep,
      createFindToolDefinition: () => sdkDefs.find,
      createEditToolDefinition: () => sdkDefs.edit,
      createWriteToolDefinition: () => sdkDefs.write,
    };

    const registered = new Map<string, RegisteredToolShape>();
    const mockPi = {
      registerTool(tool: RegisteredToolShape) {
        registered.set(tool.name, tool);
      },
    } as unknown as ExtensionAPI;

    registerTools(mockPi, dummyConfig, cwd, mockFactories);

    expect(registered.size).toBe(7);

    for (const [name, sdkDef] of Object.entries(sdkDefs)) {
      const reg = registered.get(name);
      expect(reg).toBeDefined();
      expect(reg?.name).toBe(sdkDef.name);
      expect(reg?.parameters).toBe(sdkDef.parameters);
      expect(reg?.execute).toBe(sdkDef.execute);
      expect(reg?.description).toBe(sdkDef.description);
      expect(reg?.renderShell).toBe('self');
      expect(typeof reg?.renderCall).toBe('function');
      expect(typeof reg?.renderResult).toBe('function');
    }
  });

  it('re-registers powershell with identical name, parameters, and execute reference when factory is exposed', () => {
    const cwd = process.cwd();
    const sdkPs = createPowerShellToolDefinition(cwd);
    const mockFactories = {
      createReadToolDefinition,
      createBashToolDefinition,
      createPowerShellToolDefinition: () => sdkPs,
      createLsToolDefinition,
      createGrepToolDefinition,
      createFindToolDefinition,
      createEditToolDefinition,
      createWriteToolDefinition,
    };

    const registered = new Map<string, RegisteredToolShape>();
    const mockPi = {
      registerTool(tool: RegisteredToolShape) {
        registered.set(tool.name, tool);
      },
    } as unknown as ExtensionAPI;

    registerTools(mockPi, dummyConfig, cwd, mockFactories);

    const reg = registered.get('powershell');
    expect(reg).toBeDefined();
    expect(reg?.name).toBe('powershell');
    expect(reg?.parameters).toBe(sdkPs.parameters);
    expect(reg?.execute).toBe(sdkPs.execute);
    expect(reg?.description).toBe(sdkPs.description);
    expect(reg?.renderShell).toBe('self');
    expect(typeof reg?.renderCall).toBe('function');
    expect(typeof reg?.renderResult).toBe('function');
  });

  it('omits powershell registration when createPowerShellToolDefinition factory is undefined', () => {
    const cwd = process.cwd();
    const mockFactories = {
      createReadToolDefinition,
      createBashToolDefinition,
      createPowerShellToolDefinition: undefined,
      createLsToolDefinition,
      createGrepToolDefinition,
      createFindToolDefinition,
      createEditToolDefinition,
      createWriteToolDefinition,
    };

    const registered = new Map<string, RegisteredToolShape>();
    const mockPi = {
      registerTool(tool: RegisteredToolShape) {
        registered.set(tool.name, tool);
      },
    } as unknown as ExtensionAPI;

    registerTools(mockPi, dummyConfig, cwd, mockFactories);

    expect(registered.has('powershell')).toBe(false);
    expect(registered.size).toBe(7);
  });

  it('registers all 8 tools including powershell with default factories when optional factories argument is omitted', () => {
    const registered = new Map<string, RegisteredToolShape>();
    const mockPi = {
      registerTool(tool: RegisteredToolShape) {
        registered.set(tool.name, tool);
      },
    } as unknown as ExtensionAPI;

    registerTools(mockPi, dummyConfig);

    expect(registered.size).toBe(8);
    const expectedNames = [
      'read',
      'bash',
      'powershell',
      'ls',
      'grep',
      'find',
      'edit',
      'write',
    ];
    for (const name of expectedNames) {
      const reg = registered.get(name);
      expect(reg).toBeDefined();
      expect(reg?.name).toBe(name);
      expect(reg?.renderShell).toBe('self');
      expect(typeof reg?.execute).toBe('function');
      expect(typeof reg?.parameters).toBe('object');
      expect(typeof reg?.renderCall).toBe('function');
      expect(typeof reg?.renderResult).toBe('function');
    }
  });
});
