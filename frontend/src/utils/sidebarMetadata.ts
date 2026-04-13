const splitQualifiedName = (qualifiedName: string): { schemaName: string; objectName: string } => {
  const raw = String(qualifiedName || '').trim();
  if (!raw) return { schemaName: '', objectName: '' };
  const idx = raw.lastIndexOf('.');
  if (idx <= 0 || idx >= raw.length - 1) {
    return { schemaName: '', objectName: raw };
  }
  return {
    schemaName: raw.substring(0, idx),
    objectName: raw.substring(idx + 1),
  };
};

export const normalizeSidebarViewName = (dialect: string, dbName: string, schemaName: string, viewName: string): string => {
  const normalizedDialect = String(dialect || '').trim().toLowerCase();
  const normalizedDbName = String(dbName || '').trim();
  const normalizedSchemaName = String(schemaName || '').trim();
  const normalizedViewName = String(viewName || '').trim();

  if (!normalizedViewName) {
    return '';
  }

  if (normalizedDialect === 'mysql') {
    const parsed = splitQualifiedName(normalizedViewName);
    if (parsed.objectName) {
      return parsed.objectName;
    }
    return normalizedViewName;
  }

  if (!normalizedSchemaName || normalizedViewName.includes('.')) {
    return normalizedViewName;
  }

  return `${normalizedSchemaName}.${normalizedViewName}`;
};
