/** Connection children shown in the sidebar: unique names, alphabetical. */
export const dedupeTrimmedDatabaseNames = (databaseNames: readonly string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  databaseNames.forEach((databaseName) => {
    const normalizedName = String(databaseName || '').trim();
    if (!normalizedName || seen.has(normalizedName)) return;
    seen.add(normalizedName);
    result.push(normalizedName);
  });
  result.sort((left, right) => left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: 'base',
  }));
  return result;
};
