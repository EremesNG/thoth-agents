export function getEnv(name: string): string | undefined {
  const processValue = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env?.[name];
  if (typeof processValue === 'string' && processValue.length > 0) {
    return processValue;
  }

  const bunValue = (globalThis as { Bun?: { env?: Record<string, string> } })
    .Bun?.env?.[name];
  return typeof bunValue === 'string' && bunValue.length > 0
    ? bunValue
    : undefined;
}
