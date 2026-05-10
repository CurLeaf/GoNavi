export type DataTableDensity = 'comfortable' | 'standard' | 'compact';

export interface DataGridDisplaySettings {
  showDataTableVerticalBorders: boolean;
  dataTableDensity: DataTableDensity;
}

export const DEFAULT_DATA_GRID_DISPLAY_SETTINGS: DataGridDisplaySettings = {
  showDataTableVerticalBorders: false,
  dataTableDensity: 'comfortable',
};

interface DensityParams {
  defaultColumnWidth: number;
  cellPadding: string;
  inputCellPadding: string;
  headerMinHeight: number;
  dataFontSize: number;
  metaFontSize: number;
}

const DENSITY_PARAMS: Record<DataTableDensity, DensityParams> = {
  comfortable: {
    defaultColumnWidth: 180,
    cellPadding: '8px',
    inputCellPadding: '0px 4px',
    headerMinHeight: 40,
    dataFontSize: 13,
    metaFontSize: 11,
  },
  standard: {
    defaultColumnWidth: 140,
    cellPadding: '5px 8px',
    inputCellPadding: '0px 3px',
    headerMinHeight: 34,
    dataFontSize: 13,
    metaFontSize: 10,
  },
  compact: {
    defaultColumnWidth: 100,
    cellPadding: '2px 6px',
    inputCellPadding: '0px 2px',
    headerMinHeight: 28,
    dataFontSize: 12,
    metaFontSize: 10,
  },
};

export const DENSITY_OPTIONS = [
  { label: '舒适', value: 'comfortable' as const },
  { label: '标准', value: 'standard' as const },
  { label: '紧凑', value: 'compact' as const },
];

export const sanitizeDataTableDensity = (value: unknown): DataTableDensity => {
  if (value === 'standard' || value === 'compact') return value;
  return 'comfortable';
};

export const getDensityParams = (density: DataTableDensity): DensityParams => {
  return DENSITY_PARAMS[density] || DENSITY_PARAMS.comfortable;
};

export const sanitizeDataGridDisplaySettings = (
  value: Partial<DataGridDisplaySettings> | undefined
): DataGridDisplaySettings => {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_DATA_GRID_DISPLAY_SETTINGS };
  }

  return {
    showDataTableVerticalBorders: value.showDataTableVerticalBorders === true,
    dataTableDensity: sanitizeDataTableDensity(value.dataTableDensity),
  };
};

export const resolveDataTableDefaultColumnWidth = (
  density: DataTableDensity | null | undefined
): number => {
  return getDensityParams(sanitizeDataTableDensity(density)).defaultColumnWidth;
};

export const resolveDataTableColumnWidth = ({
  manualWidth,
  density,
}: {
  manualWidth: number | null | undefined;
  density: DataTableDensity | null | undefined;
}): number => {
  if (typeof manualWidth === 'number' && Number.isFinite(manualWidth) && manualWidth > 0) {
    return manualWidth;
  }

  return resolveDataTableDefaultColumnWidth(density);
};

export const resolveDataTableVerticalBorderColor = ({
  darkMode,
  visible,
}: {
  darkMode: boolean;
  visible: boolean;
}): string => {
  if (!visible) {
    return 'transparent';
  }

  return darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)';
};
