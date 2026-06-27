import type { AIInspectionTranslator } from './aiInspectionI18n';
import { translateInspectionCopy } from './aiInspectionI18n';

export interface CodebaseHotspotEntry {
  path: string;
  lines: number;
  area: string;
  riskLevel: 'medium' | 'high' | 'critical';
  readiness: 'readyToExtract' | 'needsCharacterizationTests';
  why: string;
  preferredNextSlice: string;
  safeSeam: string;
  suggestedSlices: string[];
  testTargets: string[];
  verificationPlan: string[];
}

export interface CodebaseHotspotSnapshotOptions {
  keyword?: string;
  minLines?: number;
  limit?: number;
  includeRecommendations?: boolean;
  translate?: AIInspectionTranslator;
}

interface LocalizableText {
  key: string;
  fallback: string;
}

interface CodebaseHotspotSourceEntry {
  id: string;
  path: string;
  lines: number;
  area: string;
  riskLevel: CodebaseHotspotEntry['riskLevel'];
  readiness: CodebaseHotspotEntry['readiness'];
  why: LocalizableText;
  preferredNextSlice: LocalizableText;
  safeSeam: LocalizableText;
  suggestedSlices: LocalizableText[];
  testTargets: string[];
  verificationPlan: Array<LocalizableText | string>;
}

const keyFor = (id: string, field: string): string => `ai_chat.inspection.codebase_hotspots.${id}.${field}`;

const CODEBASE_HOTSPOT_SNAPSHOT: CodebaseHotspotSourceEntry[] = [
  {
    id: 'sidebar',
    path: 'frontend/src/components/Sidebar.tsx',
    lines: 8901,
    area: 'workspace-navigation',
    riskLevel: 'critical',
    readiness: 'needsCharacterizationTests',
    why: {
      key: keyFor('sidebar', 'why'),
      fallback: 'The left tree, command palette, context menus, and connection actions are concentrated in one file, so change entry points are numerous and regression risk is high.',
    },
    preferredNextSlice: {
      key: keyFor('sidebar', 'preferred_next_slice'),
      fallback: 'External SQL directory dialog',
    },
    safeSeam: {
      key: keyFor('sidebar', 'safe_seam'),
      fallback: 'Extract stateless dialog and menu configuration first, then handle action dispatch that depends on connection tree state.',
    },
    suggestedSlices: [
      { key: keyFor('sidebar', 'suggested_slice.v2_command_palette'), fallback: 'V2 command palette' },
      { key: keyFor('sidebar', 'suggested_slice.external_sql_directory_dialog'), fallback: 'External SQL directory dialog' },
      { key: keyFor('sidebar', 'suggested_slice.connection_tree_actions'), fallback: 'Connection tree actions' },
      { key: keyFor('sidebar', 'suggested_slice.batch_operation_dialogs'), fallback: 'Batch operation dialogs' },
    ],
    testTargets: ['Sidebar.locate-toolbar.test.tsx', 'sidebarV2Utils.test.ts'],
    verificationPlan: [
      'npm --prefix frontend test -- Sidebar.locate-toolbar.test.tsx sidebarV2Utils.test.ts',
      'npm --prefix frontend run build',
      {
        key: keyFor('sidebar', 'verification.browser_smoke'),
        fallback: 'Open the sidebar in a browser and verify the connection tree, context menus, and external SQL directory entry.',
      },
    ],
  },
  {
    id: 'data_grid',
    path: 'frontend/src/components/DataGrid.tsx',
    lines: 8080,
    area: 'result-grid',
    riskLevel: 'critical',
    readiness: 'needsCharacterizationTests',
    why: {
      key: keyFor('data_grid', 'why'),
      fallback: 'Result display, editing, DDL, export, and column operations are coupled, so a focused fix can affect the query result area.',
    },
    preferredNextSlice: {
      key: keyFor('data_grid', 'preferred_next_slice'),
      fallback: 'Result export toolbar',
    },
    safeSeam: {
      key: keyFor('data_grid', 'safe_seam'),
      fallback: 'Extract the pure display toolbar and menu item generation first; do not move data-editing transaction state yet.',
    },
    suggestedSlices: [
      { key: keyFor('data_grid', 'suggested_slice.result_export_toolbar'), fallback: 'Result export toolbar' },
      { key: keyFor('data_grid', 'suggested_slice.column_header_menu'), fallback: 'Column header menu' },
      { key: keyFor('data_grid', 'suggested_slice.ddl_view'), fallback: 'DDL view' },
      { key: keyFor('data_grid', 'suggested_slice.cell_edit_transaction_hint'), fallback: 'Cell edit transaction hint' },
    ],
    testTargets: ['DataGrid.layout.test.tsx', 'DataGrid.ddl.test.tsx'],
    verificationPlan: [
      'npm --prefix frontend test -- DataGrid.layout.test.tsx DataGrid.ddl.test.tsx',
      'npm --prefix frontend run build',
      {
        key: keyFor('data_grid', 'verification.browser_smoke'),
        fallback: 'Run a query in the browser and verify the result table, export, column menu, and table editing entry.',
      },
    ],
  },
  {
    id: 'connection_modal',
    path: 'frontend/src/components/ConnectionModal.tsx',
    lines: 6811,
    area: 'connection-form',
    riskLevel: 'critical',
    readiness: 'readyToExtract',
    why: {
      key: keyFor('connection_modal', 'why'),
      fallback: 'Multi-source connection forms are still concentrated in one component, so adding data sources or secret rules can affect each other.',
    },
    preferredNextSlice: {
      key: keyFor('connection_modal', 'preferred_next_slice'),
      fallback: 'TLS configuration section',
    },
    safeSeam: {
      key: keyFor('connection_modal', 'safe_seam'),
      fallback: 'The connection form already has presentation utilities; first extract configuration sections shown per data source.',
    },
    suggestedSlices: [
      { key: keyFor('connection_modal', 'suggested_slice.ssh_proxy_section'), fallback: 'SSH/proxy configuration section' },
      { key: keyFor('connection_modal', 'suggested_slice.tls_section'), fallback: 'TLS configuration section' },
      { key: keyFor('connection_modal', 'suggested_slice.mongodb_section'), fallback: 'MongoDB configuration section' },
      { key: keyFor('connection_modal', 'suggested_slice.jvm_section'), fallback: 'JVM configuration section' },
    ],
    testTargets: ['ConnectionModal.edit-password.test.tsx', 'connectionModalPresentation.test.ts'],
    verificationPlan: [
      'npm --prefix frontend test -- ConnectionModal.edit-password.test.tsx connectionModalPresentation.test.ts',
      'npm --prefix frontend run build',
      {
        key: keyFor('connection_modal', 'verification.browser_smoke'),
        fallback: 'Open the add/edit connection dialog in a browser and switch MySQL, Oracle, MongoDB, and Redis forms.',
      },
    ],
  },
  {
    id: 'query_editor',
    path: 'frontend/src/components/QueryEditor.tsx',
    lines: 5275,
    area: 'sql-editor',
    riskLevel: 'critical',
    readiness: 'readyToExtract',
    why: {
      key: keyFor('query_editor', 'why'),
      fallback: 'SQL editing, execution, transactions, result layout, and shortcut state are concentrated, so transaction and result-panel regressions are likely.',
    },
    preferredNextSlice: {
      key: keyFor('query_editor', 'preferred_next_slice'),
      fallback: 'Editor toolbar',
    },
    safeSeam: {
      key: keyFor('query_editor', 'safe_seam'),
      fallback: 'The toolbar JSX can pass state and callbacks through props, avoiding SQL execution, transaction, and result pagination logic.',
    },
    suggestedSlices: [
      { key: keyFor('query_editor', 'suggested_slice.result_toolbar'), fallback: 'Result area toolbar' },
      { key: keyFor('query_editor', 'suggested_slice.transaction_status_bar'), fallback: 'Transaction status bar' },
      { key: keyFor('query_editor', 'suggested_slice.execution_log_hint'), fallback: 'Execution log hint' },
      { key: keyFor('query_editor', 'suggested_slice.editor_shortcut_binding'), fallback: 'Editor shortcut binding' },
    ],
    testTargets: ['QueryEditor.result-panel.test.tsx', 'useSqlEditorTransactionController.test.ts'],
    verificationPlan: [
      'npm --prefix frontend test -- QueryEditor.external-sql-save.test.tsx useSqlEditorTransactionController.test.tsx',
      'npm --prefix frontend run build',
      {
        key: keyFor('query_editor', 'verification.browser_smoke'),
        fallback: 'Open the SQL editor in a browser and verify connection/database selection, run, save, format, result visibility, and the AI menu.',
      },
    ],
  },
  {
    id: 'table_designer',
    path: 'frontend/src/components/TableDesigner.tsx',
    lines: 3549,
    area: 'table-designer',
    riskLevel: 'high',
    readiness: 'needsCharacterizationTests',
    why: {
      key: keyFor('table_designer', 'why'),
      fallback: 'Field editing, indexes, foreign keys, partitions, and DDL generation are concentrated, so database dialect differences can spread easily.',
    },
    preferredNextSlice: {
      key: keyFor('table_designer', 'preferred_next_slice'),
      fallback: 'Field editing table',
    },
    safeSeam: {
      key: keyFor('table_designer', 'safe_seam'),
      fallback: 'Add field type, length, NULL, and default value snapshot tests first, then extract the field editing table.',
    },
    suggestedSlices: [
      { key: keyFor('table_designer', 'suggested_slice.field_editing_table'), fallback: 'Field editing table' },
      { key: keyFor('table_designer', 'suggested_slice.index_panel'), fallback: 'Index configuration panel' },
      { key: keyFor('table_designer', 'suggested_slice.foreign_key_panel'), fallback: 'Foreign key configuration panel' },
      { key: keyFor('table_designer', 'suggested_slice.dialect_ddl_preview'), fallback: 'Dialect DDL preview' },
    ],
    testTargets: ['TableDesigner.*.test.tsx', 'tableDesignerSchemaSql.test.ts'],
    verificationPlan: [
      'npm --prefix frontend test -- tableDesignerSchemaSql.test.ts',
      'npm --prefix frontend run build',
      {
        key: keyFor('table_designer', 'verification.browser_smoke'),
        fallback: 'Open object design in a browser and verify fields, indexes, foreign keys, and DDL preview.',
      },
    ],
  },
  {
    id: 'redis_viewer',
    path: 'frontend/src/components/RedisViewer.tsx',
    lines: 2120,
    area: 'redis-browser',
    riskLevel: 'high',
    readiness: 'readyToExtract',
    why: {
      key: keyFor('redis_viewer', 'why'),
      fallback: 'Key browsing, data-structure editing, TTL, encoding display, and the add dialog are concentrated, so Redis Cluster/Sentinel follow-up validation is broad.',
    },
    preferredNextSlice: {
      key: keyFor('redis_viewer', 'preferred_next_slice'),
      fallback: 'Key search bar',
    },
    safeSeam: {
      key: keyFor('redis_viewer', 'safe_seam'),
      fallback: 'Extract the search bar and topology hint first, avoiding early changes to each data-structure editor.',
    },
    suggestedSlices: [
      { key: keyFor('redis_viewer', 'suggested_slice.key_search_bar'), fallback: 'Key search bar' },
      { key: keyFor('redis_viewer', 'suggested_slice.structure_editors'), fallback: 'String/List/Set/ZSet/Hash/Stream editors' },
      { key: keyFor('redis_viewer', 'suggested_slice.add_key_dialog'), fallback: 'Add key dialog' },
    ],
    testTargets: ['redisViewerTree.test.ts', 'RedisViewer.*.test.tsx'],
    verificationPlan: [
      'npm --prefix frontend test -- redisViewerTree.test.ts',
      'npm --prefix frontend run build',
      {
        key: keyFor('redis_viewer', 'verification.browser_smoke'),
        fallback: 'Open a Redis connection in a browser and verify key search, refresh, TTL, and the add entry.',
      },
    ],
  },
  {
    id: 'driver_manager',
    path: 'frontend/src/components/DriverManagerModal.tsx',
    lines: 1729,
    area: 'driver-manager',
    riskLevel: 'high',
    readiness: 'readyToExtract',
    why: {
      key: keyFor('driver_manager', 'why'),
      fallback: 'Driver installation, status display, downloads, and optional proxy logic are substantial, so status cards and action areas are good next extraction targets.',
    },
    preferredNextSlice: {
      key: keyFor('driver_manager', 'preferred_next_slice'),
      fallback: 'Driver status list',
    },
    safeSeam: {
      key: keyFor('driver_manager', 'safe_seam'),
      fallback: 'The status list is presentational; extract it first while keeping install and download actions in the parent component.',
    },
    suggestedSlices: [
      { key: keyFor('driver_manager', 'suggested_slice.driver_status_list'), fallback: 'Driver status list' },
      { key: keyFor('driver_manager', 'suggested_slice.install_actions'), fallback: 'Install action area' },
      { key: keyFor('driver_manager', 'suggested_slice.download_logs'), fallback: 'Download log area' },
    ],
    testTargets: ['DriverManagerModal.*.test.tsx'],
    verificationPlan: [
      'npm --prefix frontend test -- DriverManagerModal.*.test.tsx',
      'npm --prefix frontend run build',
      {
        key: keyFor('driver_manager', 'verification.browser_smoke'),
        fallback: 'Open driver management in a browser and verify status display, install buttons, and the log area.',
      },
    ],
  },
  {
    id: 'data_sync',
    path: 'frontend/src/components/DataSyncModal.tsx',
    lines: 1526,
    area: 'data-sync',
    riskLevel: 'high',
    readiness: 'needsCharacterizationTests',
    why: {
      key: keyFor('data_sync', 'why'),
      fallback: 'Data sync connections, table mapping, prechecks, and execution results are concentrated, so database dialect issues can be hidden.',
    },
    preferredNextSlice: {
      key: keyFor('data_sync', 'preferred_next_slice'),
      fallback: 'Sync precheck results',
    },
    safeSeam: {
      key: keyFor('data_sync', 'safe_seam'),
      fallback: 'Make precheck results a pure display component first, keeping connection selection and execution actions in the parent component.',
    },
    suggestedSlices: [
      { key: keyFor('data_sync', 'suggested_slice.connection_selection'), fallback: 'Connection selection area' },
      { key: keyFor('data_sync', 'suggested_slice.table_mapping'), fallback: 'Table mapping area' },
      { key: keyFor('data_sync', 'suggested_slice.precheck_results'), fallback: 'Sync precheck results' },
      { key: keyFor('data_sync', 'suggested_slice.execution_logs'), fallback: 'Execution log area' },
    ],
    testTargets: ['DataSyncModal.*.test.tsx'],
    verificationPlan: [
      'npm --prefix frontend test -- DataSyncModal.*.test.tsx',
      'npm --prefix frontend run build',
      {
        key: keyFor('data_sync', 'verification.browser_smoke'),
        fallback: 'Open data sync in a browser and verify connection selection, table mapping, precheck, and execution logs.',
      },
    ],
  },
  {
    id: 'jvm_diagnostic',
    path: 'frontend/src/components/JVMDiagnosticConsole.tsx',
    lines: 1146,
    area: 'jvm-diagnostics',
    riskLevel: 'medium',
    readiness: 'readyToExtract',
    why: {
      key: keyFor('jvm_diagnostic', 'why'),
      fallback: 'Diagnostic commands, output blocks, permission hints, and session state can continue to be split to lower JVM diagnostics regression risk.',
    },
    preferredNextSlice: {
      key: keyFor('jvm_diagnostic', 'preferred_next_slice'),
      fallback: 'Diagnostic output area',
    },
    safeSeam: {
      key: keyFor('jvm_diagnostic', 'safe_seam'),
      fallback: 'The output area mainly depends on the command result array, so it can be extracted as a display component first.',
    },
    suggestedSlices: [
      { key: keyFor('jvm_diagnostic', 'suggested_slice.command_input'), fallback: 'Command input area' },
      { key: keyFor('jvm_diagnostic', 'suggested_slice.diagnostic_output'), fallback: 'Diagnostic output area' },
      { key: keyFor('jvm_diagnostic', 'suggested_slice.permission_hint'), fallback: 'Permission hint area' },
    ],
    testTargets: ['JVMDiagnosticConsole.*.test.tsx'],
    verificationPlan: [
      'npm --prefix frontend test -- JVMDiagnosticConsole.*.test.tsx',
      'npm --prefix frontend run build',
      {
        key: keyFor('jvm_diagnostic', 'verification.browser_smoke'),
        fallback: 'Open the JVM diagnostics panel in a browser and verify command input, output, and permission hints.',
      },
    ],
  },
];

const NEXT_ACTIONS: LocalizableText[] = [
  {
    key: 'ai_chat.inspection.codebase_hotspots.next_action.pick_ready_slice',
    fallback: 'Prefer a slice with readiness=readyToExtract and existing test coverage for small-step extraction; avoid rewriting an entire large component directly.',
  },
  {
    key: 'ai_chat.inspection.codebase_hotspots.next_action.confirm_safe_seam',
    fallback: 'Confirm the safeSeam before every extraction, and do not cross SQL execution, transaction, connection secret, or database dialect boundaries.',
  },
  {
    key: 'ai_chat.inspection.codebase_hotspots.next_action.run_targeted_tests',
    fallback: 'After extraction, run the corresponding component tests, related utils tests, and npm --prefix frontend run build at minimum.',
  },
  {
    key: 'ai_chat.inspection.codebase_hotspots.next_action.browser_smoke',
    fallback: 'For visible UI extraction, open the real page in a browser for one smoke verification.',
  },
];

const translateText = (
  translate: AIInspectionTranslator | undefined,
  { key, fallback }: LocalizableText,
): string => translateInspectionCopy(translate, key, fallback);

const normalizeKeyword = (value: unknown): string => String(value || '').trim().toLowerCase();

const clampNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const localizeEntry = (
  entry: CodebaseHotspotSourceEntry,
  translate: AIInspectionTranslator | undefined,
): CodebaseHotspotEntry => ({
  path: entry.path,
  lines: entry.lines,
  area: entry.area,
  riskLevel: entry.riskLevel,
  readiness: entry.readiness,
  why: translateText(translate, entry.why),
  preferredNextSlice: translateText(translate, entry.preferredNextSlice),
  safeSeam: translateText(translate, entry.safeSeam),
  suggestedSlices: entry.suggestedSlices.map((item) => translateText(translate, item)),
  testTargets: entry.testTargets,
  verificationPlan: entry.verificationPlan.map((item) => (
    typeof item === 'string' ? item : translateText(translate, item)
  )),
});

const matchesKeyword = (entry: CodebaseHotspotEntry, keyword: string): boolean => {
  if (!keyword) {
    return true;
  }
  return [
    entry.path,
    entry.area,
    entry.riskLevel,
    entry.readiness,
    entry.why,
    entry.preferredNextSlice,
    entry.safeSeam,
    ...entry.suggestedSlices,
    ...entry.testTargets,
  ].some((item) => item.toLowerCase().includes(keyword));
};

export const buildCodebaseHotspotSnapshot = ({
  keyword,
  minLines,
  limit,
  includeRecommendations = true,
  translate,
}: CodebaseHotspotSnapshotOptions = {}) => {
  const normalizedKeyword = normalizeKeyword(keyword);
  const normalizedMinLines = clampNumber(minLines, 1000, 1, 20000);
  const normalizedLimit = clampNumber(limit, 8, 1, 30);
  const localizedEntries = CODEBASE_HOTSPOT_SNAPSHOT.map((entry) => localizeEntry(entry, translate));
  const matched = localizedEntries
    .filter((entry) => entry.lines >= normalizedMinLines)
    .filter((entry) => matchesKeyword(entry, normalizedKeyword))
    .slice(0, normalizedLimit);
  const criticalCount = matched.filter((entry) => entry.riskLevel === 'critical').length;
  const highCount = matched.filter((entry) => entry.riskLevel === 'high').length;

  return {
    kind: 'codebase_hotspots',
    source: 'static_maintainability_snapshot',
    evidence: {
      measuredAt: '2026-06-12',
      note: translateInspectionCopy(
        translate,
        'ai_chat.inspection.codebase_hotspots.evidence.note',
        'Based on the current repository frontend file-line hotspot snapshot; before extraction, prefer slices that are readyToExtract and already covered by tests.',
      ),
    },
    filters: {
      keyword: normalizedKeyword || undefined,
      minLines: normalizedMinLines,
      limit: normalizedLimit,
      includeRecommendations,
    },
    summary: {
      totalKnownHotspots: CODEBASE_HOTSPOT_SNAPSHOT.length,
      totalMatched: matched.length,
      maxLines: matched[0]?.lines || 0,
      criticalCount,
      highCount,
    },
    hotspots: matched.map((entry, index) => ({
      rank: index + 1,
      path: entry.path,
      lines: entry.lines,
      area: entry.area,
      riskLevel: entry.riskLevel,
      readiness: entry.readiness,
      why: entry.why,
      preferredNextSlice: includeRecommendations ? entry.preferredNextSlice : undefined,
      safeSeam: includeRecommendations ? entry.safeSeam : undefined,
      suggestedSlices: includeRecommendations ? entry.suggestedSlices : [],
      testTargets: includeRecommendations ? entry.testTargets : [],
      verificationPlan: includeRecommendations ? entry.verificationPlan : [],
    })),
    nextActions: includeRecommendations
      ? NEXT_ACTIONS.map((item) => translateText(translate, item))
      : [],
  };
};
