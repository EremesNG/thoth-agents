import * as fs from 'node:fs';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  extractChannel,
  findPluginEntry,
  getLocalDevVersion,
  updatePinnedVersion,
} from './checker';

// Mock the dependencies
vi.mock('./constants', () => ({
  PACKAGE_NAME: 'thoth-agents',
  USER_OPENCODE_CONFIG: '/mock/config/opencode.json',
  USER_OPENCODE_CONFIG_JSONC: '/mock/config/opencode.jsonc',
  INSTALLED_PACKAGE_JSON: '/mock/cache/node_modules/thoth-agents/package.json',
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn((_p: string) => false),
  readFileSync: vi.fn((_p: string) => ''),
  statSync: vi.fn((_p: string) => ({ isDirectory: () => true })),
  writeFileSync: vi.fn(() => {}),
}));

describe('auto-update-checker/checker', () => {
  beforeEach(() => {
    (fs.existsSync as any).mockReset();
    (fs.existsSync as any).mockImplementation((_p: string) => false);
    (fs.readFileSync as any).mockReset();
    (fs.readFileSync as any).mockImplementation((_p: string) => '');
    (fs.statSync as any).mockReset();
    (fs.statSync as any).mockImplementation((_p: string) => ({
      isDirectory: () => true,
    }));
    (fs.writeFileSync as any).mockReset();
    (fs.writeFileSync as any).mockImplementation(() => {});
  });

  describe('extractChannel', () => {
    test('returns latest for null or empty', () => {
      expect(extractChannel(null)).toBe('latest');
      expect(extractChannel('')).toBe('latest');
    });

    test('returns tag if version starts with non-digit', () => {
      expect(extractChannel('beta')).toBe('beta');
      expect(extractChannel('next')).toBe('next');
    });

    test('extracts channel from prerelease version', () => {
      expect(extractChannel('1.0.0-alpha.1')).toBe('alpha');
      expect(extractChannel('2.3.4-beta.5')).toBe('beta');
      expect(extractChannel('0.1.0-rc.1')).toBe('rc');
      expect(extractChannel('1.0.0-canary.0')).toBe('canary');
    });

    test('returns latest for standard versions', () => {
      expect(extractChannel('1.0.0')).toBe('latest');
    });
  });

  describe('getLocalDevVersion', () => {
    test('returns null if no local dev path in config', () => {
      // existsSync returns false by default from mock
      expect(getLocalDevVersion('/test')).toBeNull();
    });

    test('returns version from local package.json if path exists', () => {
      const existsMock = fs.existsSync as any;
      const readMock = fs.readFileSync as any;

      existsMock.mockImplementation((p: string) => {
        if (p.includes('opencode.json')) return true;
        if (p.includes('package.json')) return true;
        return false;
      });

      readMock.mockImplementation((p: string) => {
        if (p.includes('opencode.json')) {
          return JSON.stringify({
            plugin: ['file:///dev/thoth-agents'],
          });
        }
        if (p.includes('package.json')) {
          return JSON.stringify({
            name: 'thoth-agents',
            version: '1.2.3-dev',
          });
        }
        return '';
      });

      expect(getLocalDevVersion('/test')).toBe('1.2.3-dev');
    });
  });

  describe('findPluginEntry', () => {
    test('detects latest version entry', () => {
      const existsMock = fs.existsSync as any;
      const readMock = fs.readFileSync as any;

      existsMock.mockImplementation((p: string) => p.includes('opencode.json'));
      readMock.mockImplementation(() =>
        JSON.stringify({
          plugin: ['thoth-agents'],
        }),
      );

      const entry = findPluginEntry('/test');
      expect(entry).not.toBeNull();
      expect(entry?.entry).toBe('thoth-agents');
      expect(entry?.isPinned).toBe(false);
      expect(entry?.pinnedVersion).toBeNull();
    });

    test('detects pinned version entry', () => {
      const existsMock = fs.existsSync as any;
      const readMock = fs.readFileSync as any;

      existsMock.mockImplementation((p: string) => p.includes('opencode.json'));
      readMock.mockImplementation(() =>
        JSON.stringify({
          plugin: ['thoth-agents@1.0.0'],
        }),
      );

      const entry = findPluginEntry('/test');
      expect(entry).not.toBeNull();
      expect(entry?.isPinned).toBe(true);
      expect(entry?.pinnedVersion).toBe('1.0.0');
    });
  });

  describe('updatePinnedVersion', () => {
    test('updates pinned package-manager entry without rewriting config shape', () => {
      const existsMock = fs.existsSync as any;
      const readMock = fs.readFileSync as any;
      const writeMock = fs.writeFileSync as any;
      const configPath = '/mock/config/opencode.json';
      const originalConfig =
        '{\n  "plugin": [\n    "thoth-agents@1.0.0"\n  ]\n}\n';

      existsMock.mockImplementation((p: string) => p === configPath);
      readMock.mockReturnValue(originalConfig);

      expect(
        updatePinnedVersion(configPath, 'thoth-agents@1.0.0', '1.2.3'),
      ).toBe(true);
      expect(writeMock).toHaveBeenCalledWith(
        configPath,
        originalConfig.replace('thoth-agents@1.0.0', 'thoth-agents@1.2.3'),
        'utf-8',
      );
    });
  });
});
