import { t as translateCatalog } from '../i18n';

export type JVMRuntimeMode = 'jmx' | 'endpoint' | 'agent';
export type JVMTabKind = 'overview' | 'resource' | 'audit' | 'diagnostic' | 'monitoring';

export type JVMModeMeta = {
  mode: string;
  label: string;
  color: string;
  backgroundColor: string;
};

export const JVM_RUNTIME_MODES: JVMRuntimeMode[] = ['jmx', 'endpoint', 'agent'];

type JVMRuntimeTranslator = (key: string) => string;

const JVM_MODE_META_MAP: Record<JVMRuntimeMode, JVMModeMeta> = {
  jmx: {
    mode: 'jmx',
    label: 'JMX',
    color: '#1D39C4',
    backgroundColor: 'rgba(29, 57, 196, 0.12)',
  },
  endpoint: {
    mode: 'endpoint',
    label: 'Endpoint',
    color: '#1677FF',
    backgroundColor: 'rgba(22, 119, 255, 0.12)',
  },
  agent: {
    mode: 'agent',
    label: 'Agent',
    color: '#FA8C16',
    backgroundColor: 'rgba(250, 140, 22, 0.12)',
  },
};

const JVM_TAB_KIND_LABEL_KEYS: Record<JVMTabKind, string> = {
  overview: 'sidebar.jvm.tab.overview',
  resource: 'sidebar.jvm.tab.resource',
  audit: 'sidebar.jvm.tab.audit',
  diagnostic: 'sidebar.jvm.tab.diagnostic',
  monitoring: 'sidebar.jvm.tab.monitoring',
};

const normalizeMode = (mode: string): string => String(mode || '').trim().toLowerCase();

const toTitleCase = (value: string): string => {
  if (!value) {
    return 'Unknown';
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
};

export const resolveJVMModeMeta = (mode: string): JVMModeMeta => {
  const normalizedMode = normalizeMode(mode);
  if (normalizedMode in JVM_MODE_META_MAP) {
    return JVM_MODE_META_MAP[normalizedMode as JVMRuntimeMode];
  }

  return {
    mode: normalizedMode || 'unknown',
    label: toTitleCase(normalizedMode || 'unknown'),
    color: '#8C8C8C',
    backgroundColor: 'rgba(140, 140, 140, 0.12)',
  };
};

export const buildJVMTabTitle = (
  connectionName: string,
  tabKind: JVMTabKind,
  mode: string,
  translate: JVMRuntimeTranslator = translateCatalog,
): string => {
  const trimmedConnectionName = String(connectionName || '').trim();
  const tabLabelKey = JVM_TAB_KIND_LABEL_KEYS[tabKind];
  const tabLabel = tabLabelKey ? translate(tabLabelKey) : 'JVM';
  const modeLabel = resolveJVMModeMeta(mode).label;
  const prefix = trimmedConnectionName ? `[${trimmedConnectionName}] ` : '';

  return `${prefix}${tabLabel} · ${modeLabel}`;
};
