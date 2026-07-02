export const SIDEBAR_TABLE_METADATA_FIELDS = [
  'comment',
  'rows',
  'size',
  'createdAt',
  'updatedAt',
] as const;

export type SidebarTableMetadataField =
  typeof SIDEBAR_TABLE_METADATA_FIELDS[number];

export interface SidebarTableMetadataSnapshot {
  tableComment?: string;
  rowCount?: number;
  tableSize?: number;
  createdAt?: string;
  updatedAt?: string;
}

export const DEFAULT_SIDEBAR_TABLE_METADATA_FIELDS: SidebarTableMetadataField[] = [
  'rows',
];

const isSidebarTableMetadataField = (
  value: unknown,
): value is SidebarTableMetadataField =>
  typeof value === 'string'
  && SIDEBAR_TABLE_METADATA_FIELDS.includes(
    value as SidebarTableMetadataField,
  );

const uniqueSidebarTableMetadataFieldsInInputOrder = (
  fields: Iterable<unknown>,
): SidebarTableMetadataField[] => {
  const seen = new Set<SidebarTableMetadataField>();
  const result: SidebarTableMetadataField[] = [];
  Array.from(fields).forEach((field) => {
    if (!isSidebarTableMetadataField(field) || seen.has(field)) {
      return;
    }
    seen.add(field);
    result.push(field);
  });
  return result;
};

const completeSidebarTableMetadataFieldOrder = (
  fields: Iterable<unknown>,
): SidebarTableMetadataField[] => {
  const ordered = uniqueSidebarTableMetadataFieldsInInputOrder(fields);
  const seen = new Set(ordered);
  SIDEBAR_TABLE_METADATA_FIELDS.forEach((field) => {
    if (!seen.has(field)) {
      ordered.push(field);
    }
  });
  return ordered;
};

export const sanitizeSidebarTableMetadataFields = (
  value: unknown,
  fallback: SidebarTableMetadataField[] = DEFAULT_SIDEBAR_TABLE_METADATA_FIELDS,
): SidebarTableMetadataField[] => {
  if (!Array.isArray(value)) {
    return uniqueSidebarTableMetadataFieldsInInputOrder(fallback);
  }
  const normalized = uniqueSidebarTableMetadataFieldsInInputOrder(value);
  if (normalized.length === 0) {
    return uniqueSidebarTableMetadataFieldsInInputOrder(fallback);
  }
  return normalized;
};

export const resolveSidebarTableMetadataFieldOrder = (
  value: unknown,
): SidebarTableMetadataField[] => {
  if (!Array.isArray(value)) {
    return [...SIDEBAR_TABLE_METADATA_FIELDS];
  }
  return completeSidebarTableMetadataFieldOrder(value);
};

export const applySidebarTableMetadataFieldOrder = (
  fields: SidebarTableMetadataField[],
  order: unknown,
): SidebarTableMetadataField[] => {
  const selected = new Set(sanitizeSidebarTableMetadataFields(fields, []));
  return resolveSidebarTableMetadataFieldOrder(order)
    .filter((field) => selected.has(field));
};

export const resolveSidebarTableMetadataFields = (
  value: unknown,
  legacyShowSidebarTableComment = false,
  order?: unknown,
): SidebarTableMetadataField[] => {
  let resolved: SidebarTableMetadataField[];
  if (Array.isArray(value)) {
    resolved = uniqueSidebarTableMetadataFieldsInInputOrder(value);
  } else {
    resolved = uniqueSidebarTableMetadataFieldsInInputOrder([
      ...(legacyShowSidebarTableComment ? ['comment'] : []),
      ...DEFAULT_SIDEBAR_TABLE_METADATA_FIELDS,
    ]);
  }
  if (order !== undefined) {
    return applySidebarTableMetadataFieldOrder(resolved, order);
  }
  return resolved;
};

export const setSidebarTableMetadataFieldSelected = (
  fields: SidebarTableMetadataField[],
  target: SidebarTableMetadataField,
  selected: boolean,
  order?: SidebarTableMetadataField[],
): SidebarTableMetadataField[] => {
  const next = new Set(resolveSidebarTableMetadataFields(fields));
  if (selected) {
    next.add(target);
  } else {
    next.delete(target);
  }
  const nextFields = Array.from(next);
  return order
    ? applySidebarTableMetadataFieldOrder(nextFields, order)
    : uniqueSidebarTableMetadataFieldsInInputOrder(nextFields);
};
