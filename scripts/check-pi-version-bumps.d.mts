export function isTestPath(file: string): boolean;
export function checkPiVersionBumps(
  baseRef: string,
  options?: { projectRoot?: string },
): string[];
export function runCheck(
  args: string[],
  env?: Record<string, string | undefined>,
  options?: { projectRoot?: string },
): number;
