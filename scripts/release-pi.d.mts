export const RELEASE_LEVELS: string[];

export interface PiPackage {
  directory: string;
  dir: string;
  name: string;
  version: string;
}

export interface NpmResult {
  status: number;
  stdout: string;
  stderr: string;
}

export function discoverPiPackages(projectRoot?: string): PiPackage[];
export function resolvePiPackage(
  packages: PiPackage[],
  identifier: string,
): PiPackage | undefined;
export function releasePi(
  args: string[],
  options?: {
    projectRoot?: string;
    runNpm?: (level: string, cwd: string) => NpmResult;
    log?: (message: string) => void;
  },
):
  | { ok: false; exitCode: number }
  | {
      ok: true;
      exitCode: 0;
      name: string;
      oldVersion: string;
      newVersion: string;
    };
