export interface NpxCommandOptions {
  platform?: NodeJS.Platform;
  commandShell?: string;
}

export interface NpxCommand {
  command: string;
  args: string[];
}

export function getNpxCommand(
  args: readonly string[],
  options: NpxCommandOptions = {},
): NpxCommand {
  if ((options.platform ?? process.platform) !== 'win32') {
    return { command: 'npx', args: [...args] };
  }

  return {
    command: options.commandShell ?? process.env.ComSpec ?? 'cmd.exe',
    args: ['/d', '/s', '/c', ['npx', ...args].join(' ')],
  };
}
