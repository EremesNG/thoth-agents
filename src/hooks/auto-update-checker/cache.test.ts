import * as fs from 'node:fs';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { invalidatePackage } from './cache';

// Mock internal dependencies
vi.mock('./constants', () => ({
  CACHE_DIR: '/mock/cache',
  PACKAGE_NAME: 'thoth-agents',
}));

vi.mock('../../utils/logger', () => ({
  log: vi.fn(() => {}),
}));

// Mock fs and path
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  rmSync: vi.fn(() => {}),
  readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(() => {}),
}));

vi.mock('../../cli/config-manager', () => ({
  stripJsonComments: (s: string) => s,
}));

describe('auto-update-checker/cache', () => {
  beforeEach(() => {
    (fs.existsSync as any).mockReset();
    (fs.existsSync as any).mockImplementation(() => false);
    (fs.rmSync as any).mockReset();
    (fs.rmSync as any).mockImplementation(() => {});
    (fs.readFileSync as any).mockReset();
    (fs.readFileSync as any).mockImplementation(() => '');
    (fs.writeFileSync as any).mockReset();
    (fs.writeFileSync as any).mockImplementation(() => {});
  });

  describe('invalidatePackage', () => {
    test('returns false when nothing to invalidate', () => {
      const existsMock = fs.existsSync as any;
      existsMock.mockReturnValue(false);

      const result = invalidatePackage();
      expect(result).toBe(false);
    });

    test('returns true and removes directory if node_modules path exists', () => {
      const existsMock = fs.existsSync as any;
      const rmSyncMock = fs.rmSync as any;

      existsMock.mockImplementation((p: string) => p.includes('node_modules'));

      const result = invalidatePackage();

      expect(rmSyncMock).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    test('removes dependency from package.json if present', () => {
      const existsMock = fs.existsSync as any;
      const readMock = fs.readFileSync as any;
      const writeMock = fs.writeFileSync as any;

      existsMock.mockImplementation((p: string) => p.includes('package.json'));
      readMock.mockReturnValue(
        JSON.stringify({
          dependencies: {
            'thoth-agents': '1.0.0',
            'other-pkg': '1.0.0',
          },
        }),
      );

      const result = invalidatePackage();

      expect(result).toBe(true);
      const callArgs = writeMock.mock.calls[0];
      const savedJson = JSON.parse(callArgs[1]);
      expect(savedJson.dependencies['thoth-agents']).toBeUndefined();
      expect(savedJson.dependencies['other-pkg']).toBe('1.0.0');
    });

    test('invalidates the pnpm cache package directory without touching lockfiles', () => {
      const existsMock = fs.existsSync as any;
      const rmSyncMock = fs.rmSync as any;
      const writeMock = fs.writeFileSync as any;

      existsMock.mockImplementation(
        (p: string) =>
          p.endsWith('/node_modules/thoth-agents') ||
          p.endsWith('\\node_modules\\thoth-agents'),
      );

      const result = invalidatePackage();

      expect(result).toBe(true);
      expect(rmSyncMock).toHaveBeenCalledWith(
        expect.stringContaining('node_modules'),
        { recursive: true, force: true },
      );
      expect(writeMock).not.toHaveBeenCalled();
    });
  });
});
