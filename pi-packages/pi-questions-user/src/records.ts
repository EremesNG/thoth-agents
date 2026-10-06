/** JSON round-trips restore ordinary prototypes; keyed reads must ignore inherited entries. */
export function getOwn<T>(
  record: Record<string, T> | undefined,
  key: string,
): T | undefined {
  return record && Object.hasOwn(record, key) ? record[key] : undefined;
}
