type YamlValue = string | null;

export function stringifyYamlRecord(record: Record<string, YamlValue>): string {
  return Object.entries(record)
    .map(([key, value]) => `${key}: ${formatYamlValue(value)}`)
    .join('\n');
}

export function parseYamlRecord(source: string): Record<string, YamlValue> {
  const parsed: Record<string, YamlValue> = {};

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf(':');
    if (separator < 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!key) {
      continue;
    }

    parsed[key] = parseYamlValue(value);
  }

  return parsed;
}

function formatYamlValue(value: YamlValue): string {
  if (value === null) {
    return 'null';
  }

  return JSON.stringify(value);
}

function parseYamlValue(value: string): YamlValue {
  if (value === '' || value === 'null' || value === '~') {
    return null;
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1).replace(/''/g, "'");
    }
  }

  return value;
}
