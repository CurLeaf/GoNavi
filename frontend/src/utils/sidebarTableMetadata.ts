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

const orderSidebarTableMetadataFields = (
  fields: Iterable<SidebarTableMetadataField>,
): SidebarTableMetadataField[] => {
  const selected = new Set(fields);
  return SIDEBAR_TABLE_METADATA_FIELDS.filter((field) => selected.has(field));
};

export const sanitizeSidebarTableMetadataFields = (
  value: unknown,
  fallback: SidebarTableMetadataField[] = DEFAULT_SIDEBAR_TABLE_METADATA_FIELDS,
): SidebarTableMetadataField[] => {
  if (!Array.isArray(value)) {
    return orderSidebarTableMetadataFields(fallback);
  }
  const normalized = orderSidebarTableMetadataFields(
    value.filter(isSidebarTableMetadataField),
  );
  if (normalized.length === 0) {
    return orderSidebarTableMetadataFields(fallback);
  }
  return normalized;
};

export const resolveSidebarTableMetadataFields = (
  value: unknown,
  legacyShowSidebarTableComment = false,
): SidebarTableMetadataField[] => {
  if (Array.isArray(value)) {
    return orderSidebarTableMetadataFields(
      value.filter(isSidebarTableMetadataField),
    );
  }
  const defaults = new Set<SidebarTableMetadataField>(
    DEFAULT_SIDEBAR_TABLE_METADATA_FIELDS,
  );
  if (legacyShowSidebarTableComment) {
    defaults.add('comment');
  }
  return orderSidebarTableMetadataFields(defaults);
};

export const setSidebarTableMetadataFieldSelected = (
  fields: SidebarTableMetadataField[],
  target: SidebarTableMetadataField,
  selected: boolean,
): SidebarTableMetadataField[] => {
  const next = new Set(resolveSidebarTableMetadataFields(fields));
  if (selected) {
    next.add(target);
  } else {
    next.delete(target);
  }
  return orderSidebarTableMetadataFields(next);
};

