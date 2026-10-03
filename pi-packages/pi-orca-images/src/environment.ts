export function isOrcaImagesEnabled(env: NodeJS.ProcessEnv): boolean {
  const protocol = env.PI_IMAGE_PROTOCOL?.toLowerCase();
  return (
    env.TERM_PROGRAM?.toLowerCase() === 'orca' &&
    env.TMUX === undefined &&
    protocol !== 'none' &&
    protocol !== '0'
  );
}
