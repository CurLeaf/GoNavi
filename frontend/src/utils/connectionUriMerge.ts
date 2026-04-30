const EMPTY_PRESERVED_URI_FIELDS = new Set([
  "user",
  "password",
  "database",
  "connectionParams",
]);

const isEmptyParsedValue = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);

export const mergeParsedUriValuesForForm = (
  currentValues: Record<string, unknown>,
  parsedValues: Record<string, unknown>,
  uriText: string,
): Record<string, unknown> => {
  const nextValues: Record<string, unknown> = { uri: uriText };

  Object.entries(parsedValues).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }
    if (
      EMPTY_PRESERVED_URI_FIELDS.has(key) &&
      isEmptyParsedValue(value) &&
      !isEmptyParsedValue(currentValues[key])
    ) {
      return;
    }
    nextValues[key] = value;
  });

  return nextValues;
};
